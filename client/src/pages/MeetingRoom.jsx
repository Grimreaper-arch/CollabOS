import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRealtime, useSocketEvent } from "../context/RealtimeContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { Avatar, Empty, Icon, PageSkeleton } from "../components/ui";
import { PLAN_LIMIT_EVENT } from "../utils/plans";

// How a WebRTC call is set up here:
//  1. Everyone opens their camera/microphone (getUserMedia).
//  2. On joining, the server replies with who is already in the room. The newcomer creates one
//     RTCPeerConnection per person and sends each an "offer" (SDP) through Socket.io.
//  3. Each of them answers. Both sides also trade ICE candidates (possible network routes).
//  4. Once connected, audio and video flow directly between the browsers, not through the server.

// A video tile. Remote audio plays through the same <video> element.
function Tile({ name, user, stream, muted, audio, video, screen, self }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
    }, [stream]);
    const showVideo = Boolean(stream) && (video || screen);
    return (
        <div className="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-[#0d0d11]">
            <video ref={ref} autoPlay playsInline muted={muted}
                className={`h-full w-full ${screen ? "object-contain" : "object-cover"} ${self && !screen ? "-scale-x-100" : ""} ${showVideo ? "" : "invisible absolute"}`} />
            {!showVideo && <Avatar user={user || { fullName: name }} size="h-20 w-20 text-2xl" />}
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[13px] text-white backdrop-blur">
                {!audio && <Icon name="mic_off" className="text-[15px] text-danger" />}
                {screen && <Icon name="present_to_all" className="text-[15px] text-accent" />}
                {name}{self ? " (you)" : ""}
            </div>
        </div>
    );
}

function ControlButton({ on, onClick, icon, offIcon, label, danger }) {
    return (
        <button onClick={onClick} aria-label={label} title={label} aria-pressed={on}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${danger ? "bg-danger text-white hover:bg-danger/85" : on ? "bg-white/[0.08] text-white hover:bg-white/[0.14]" : "bg-danger/90 text-white hover:bg-danger"}`}>
            <Icon name={on || danger ? icon : offIcon || icon} />
        </button>
    );
}

const formatLeft = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function MeetingRoom() {
    const { roomId } = useParams();
    const { user } = useAuth();
    const { socket, connected } = useRealtime();
    const toast = useToast();
    const navigate = useNavigate();
    const details = useApi(`/meetings/room/${roomId}`);

    const [phase, setPhase] = useState("lobby"); // lobby → in → ended
    const [endReason, setEndReason] = useState("");
    const [mic, setMic] = useState(true);
    const [cam, setCam] = useState(true);
    const [sharing, setSharing] = useState(false);
    const [mediaError, setMediaError] = useState("");
    const [localStream, setLocalStream] = useState(null);
    const [peers, setPeers] = useState({}); // socketId → { name, avatar, userId, audio, video, screen, stream }
    const [chatOpen, setChatOpen] = useState(false);
    const [chat, setChat] = useState([]);
    const [chatText, setChatText] = useState("");
    const [endsAt, setEndsAt] = useState(null);
    const [now, setNow] = useState(Date.now());

    const pcs = useRef(new Map()); // socketId → RTCPeerConnection
    const pendingIce = useRef(new Map()); // socketId → candidates that arrived before the offer/answer
    const camStream = useRef(null);
    const screenTrack = useRef(null);
    const iceServers = details.data?.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];

    const updatePeer = (id, patch) => setPeers((prev) => (prev[id] || patch.name ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));

    // 1. Camera and microphone (falls back to audio only, then to nothing).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            for (const constraints of [{ audio: true, video: { width: 1280, height: 720 } }, { audio: true, video: false }]) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                    camStream.current = stream;
                    setLocalStream(stream);
                    if (!constraints.video) { setCam(false); setMediaError("No camera found. You can still join with audio."); }
                    return;
                } catch { /* try the next option */ }
            }
            setMic(false);
            setCam(false);
            setMediaError("Camera and microphone are blocked. Allow them in the browser's address bar, or join to watch and listen.");
        })();
        return () => { cancelled = true; };
    }, []);

    const audioTrack = () => camStream.current?.getAudioTracks()[0] || null;
    const videoTrack = () => screenTrack.current || camStream.current?.getVideoTracks()[0] || null;
    const sendersOf = (kind) => [...pcs.current.values()].map((pc) => pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender).filter(Boolean);

    const closePeer = useCallback((id) => {
        pcs.current.get(id)?.close();
        pcs.current.delete(id);
        pendingIce.current.delete(id);
        setPeers((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }, []);

    const createPeer = useCallback((id, initiator) => {
        const pc = new RTCPeerConnection({ iceServers });
        pcs.current.set(id, pc);
        pc.onicecandidate = (e) => e.candidate && socket?.emit("meet:signal", { to: id, data: { candidate: e.candidate } });
        pc.ontrack = (e) => setPeers((prev) => {
            const current = prev[id]?.stream;
            const stream = current || new MediaStream();
            if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
            return { ...prev, [id]: { ...prev[id], stream } };
        });
        pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") pc.restartIce?.(); };
        if (initiator) {
            // Always one audio and one video channel, so camera/screen can be swapped in later.
            pc.addTransceiver("audio", { direction: "sendrecv" }).sender.replaceTrack(audioTrack());
            pc.addTransceiver("video", { direction: "sendrecv" }).sender.replaceTrack(videoTrack());
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => socket?.emit("meet:signal", { to: id, data: { description: pc.localDescription } }))
                .catch((e) => console.error("Offer failed", e));
        }
        return pc;
    }, [socket, iceServers]); // eslint-disable-line react-hooks/exhaustive-deps

    // 3. Offers, answers and ICE candidates from the others.
    useSocketEvent("meet:signal", async ({ from, data }) => {
        try {
            if (data.description) {
                const pc = pcs.current.get(from) || createPeer(from, false);
                await pc.setRemoteDescription(data.description);
                if (data.description.type === "offer") {
                    for (const t of pc.getTransceivers()) {
                        t.direction = "sendrecv";
                        await t.sender.replaceTrack(t.receiver.track.kind === "audio" ? audioTrack() : videoTrack());
                    }
                    await pc.setLocalDescription(await pc.createAnswer());
                    socket.emit("meet:signal", { to: from, data: { description: pc.localDescription } });
                }
                for (const candidate of pendingIce.current.get(from) || []) await pc.addIceCandidate(candidate);
                pendingIce.current.delete(from);
            } else if (data.candidate) {
                const pc = pcs.current.get(from);
                if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate);
                else pendingIce.current.set(from, [...(pendingIce.current.get(from) || []), data.candidate]);
            }
        } catch (e) {
            console.error("Signalling error", e);
        }
    });

    useSocketEvent("meet:peer-joined", ({ socketId, ...peer }) => {
        setPeers((prev) => ({ ...prev, [socketId]: { ...prev[socketId], ...peer } }));
        toast.info(`${peer.name} joined`);
    });
    useSocketEvent("meet:peer-left", ({ socketId }) => closePeer(socketId));
    useSocketEvent("meet:peer-state", ({ socketId, ...state }) => updatePeer(socketId, state));
    useSocketEvent("meet:chat", (message) => {
        setChat((prev) => [...prev, message]);
        if (!chatOpen && message.userId !== user._id) toast.info(message.from, message.text);
    });
    useSocketEvent("meet:ended", ({ reason }) => { setEndReason(reason); leave(false); });

    // 2. Join the room.
    const join = () => {
        socket.emit("meet:join", { roomId }, (reply) => {
            if (reply?.error) {
                if (reply.code === "PLAN_LIMIT") window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: reply.error }));
                toast.error("Couldn't join", reply.error);
                return;
            }
            setEndsAt(reply.endsAt ? new Date(reply.endsAt).getTime() : null);
            setPhase("in");
            socket.emit("meet:state", { audio: mic, video: cam, screen: false });
            reply.peers.forEach(({ socketId, ...peer }) => {
                setPeers((prev) => ({ ...prev, [socketId]: { ...prev[socketId], ...peer } }));
                createPeer(socketId, true);
            });
        });
    };

    // Leaving: close every connection and turn the camera off.
    const leave = useCallback((tellServer = true) => {
        if (tellServer) socket?.emit("meet:leave");
        [...pcs.current.keys()].forEach(closePeer);
        screenTrack.current?.stop();
        screenTrack.current = null;
        setSharing(false);
        setPhase("ended");
    }, [socket, closePeer]);

    useEffect(() => () => {
        socket?.emit("meet:leave");
        pcs.current.forEach((pc) => pc.close());
        camStream.current?.getTracks().forEach((t) => t.stop());
        screenTrack.current?.stop();
    }, [socket]);

    useEffect(() => {
        if (phase === "ended") camStream.current?.getTracks().forEach((t) => t.stop());
    }, [phase]);

    // Countdown for plans with a time limit.
    useEffect(() => {
        if (!endsAt || phase !== "in") return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [endsAt, phase]);

    const toggleMic = () => {
        const next = !mic;
        audioTrack() && (audioTrack().enabled = next);
        setMic(next);
        socket?.emit("meet:state", { audio: next });
    };
    const toggleCam = () => {
        const track = camStream.current?.getVideoTracks()[0];
        if (!track) return toast.error("No camera", "Your browser didn't give access to a camera.");
        const next = !cam;
        track.enabled = next;
        setCam(next);
        socket?.emit("meet:state", { video: next });
    };

    const stopShare = () => {
        screenTrack.current?.stop();
        screenTrack.current = null;
        sendersOf("video").forEach((s) => s.replaceTrack(camStream.current?.getVideoTracks()[0] || null));
        setSharing(false);
        setLocalStream(camStream.current);
        socket?.emit("meet:state", { screen: false });
    };
    const toggleShare = async () => {
        if (sharing) return stopShare();
        try {
            const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = display.getVideoTracks()[0];
            screenTrack.current = track;
            track.onended = stopShare;
            sendersOf("video").forEach((s) => s.replaceTrack(track));
            setSharing(true);
            setLocalStream(new MediaStream([track, ...(camStream.current?.getAudioTracks() || [])]));
            socket?.emit("meet:state", { screen: true });
        } catch { /* the user cancelled the screen picker */ }
    };

    const sendChat = (event) => {
        event.preventDefault();
        if (!chatText.trim()) return;
        socket.emit("meet:chat", { text: chatText });
        setChatText("");
    };

    if (details.loading) return <PageSkeleton />;
    if (details.error) return <Empty icon="videocam_off" title={details.error} action={<Link to="/meetings" className="btn-secondary btn-sm">Back to meetings</Link>} />;
    const meeting = details.data.meeting;

    if (phase === "ended") {
        return (
            <div className="mx-auto mt-16 max-w-md text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.05] text-muted"><Icon name="call_end" /></span>
                <h1 className="mt-5 text-2xl font-semibold text-white">You left the meeting</h1>
                <p className="mt-2 text-muted">{endReason || meeting.title}</p>
                {endReason.includes("limit") && <p className="mt-3 text-[14.5px] text-faint">Pro and Scale have no time limit. <Link to="/billing" className="text-accent hover:underline">See plans</Link></p>}
                <div className="mt-6 flex justify-center gap-2">
                    <button onClick={() => window.location.reload()} className="btn-secondary">Rejoin</button>
                    <Link to="/meetings" className="btn-primary">Back to meetings</Link>
                </div>
            </div>
        );
    }

    if (phase === "lobby") {
        return (
            <div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
                <div>
                    <Tile name={user.fullName} user={user} stream={localStream} muted audio={mic} video={cam} self />
                    <div className="mt-4 flex justify-center gap-3">
                        <ControlButton on={mic} onClick={toggleMic} icon="mic" offIcon="mic_off" label={mic ? "Mute" : "Unmute"} />
                        <ControlButton on={cam} onClick={toggleCam} icon="videocam" offIcon="videocam_off" label={cam ? "Turn camera off" : "Turn camera on"} />
                    </div>
                </div>
                <div>
                    <p className="text-[13px] font-medium text-faint">Ready to join?</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{meeting.title}</h1>
                    <p className="mt-2 text-[15px] text-muted">Hosted by {meeting.isHost ? "you" : meeting.host.fullName}{meeting.project ? ` · ${meeting.project.name}` : ""}</p>
                    <p className="mt-1 text-[14.5px] text-faint">{meeting.live ? `${meeting.live} ${meeting.live === 1 ? "person is" : "people are"} in the call` : "Nobody's here yet"}</p>
                    {mediaError && <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[14.5px] text-warning"><Icon name="warning" className="text-[20px]" />{mediaError}</p>}
                    <div className="mt-6 flex flex-wrap gap-2">
                        <button onClick={join} disabled={!connected} className="btn-primary h-11 px-6"><Icon name="videocam" className="text-[17px]" />{connected ? "Join now" : "Connecting…"}</button>
                        {meeting.meetLink && <a href={meeting.meetLink} target="_blank" rel="noreferrer" className="btn-secondary h-11">Open in Google Meet</a>}
                    </div>
                    <p className="mt-4 text-[13px] text-faint">Up to {details.data.limits.participants} people{details.data.limits.minutes ? ` · ${details.data.limits.minutes}-minute limit on your plan` : ""}.</p>
                </div>
            </div>
        );
    }

    const entries = Object.entries(peers);
    const count = entries.length + 1;
    const cols = count === 1 ? "grid-cols-1" : count <= 4 ? "md:grid-cols-2" : count <= 9 ? "md:grid-cols-3" : "md:grid-cols-4";
    const left = endsAt ? endsAt - now : null;

    return (
        <div className="flex h-[calc(100vh-9.5rem)] min-h-[520px] gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="mb-3 flex items-center gap-3">
                    <span className="chip border-danger/40 bg-danger/10 text-danger"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />Live</span>
                    <h1 className="truncate font-semibold text-white">{meeting.title}</h1>
                    <span className="text-[14.5px] text-faint">{count} in call</span>
                    {left !== null && <span className={`ml-auto chip tabular-nums ${left < 5 * 60000 ? "border-warning/40 text-warning" : ""}`}><Icon name="timer" className="text-[15px]" />{formatLeft(left)} left</span>}
                </header>
                <div className={`grid flex-1 auto-rows-fr content-center gap-3 overflow-y-auto ${cols}`}>
                    <Tile name={user.fullName} user={user} stream={localStream} muted audio={mic} video={cam} screen={sharing} self />
                    {entries.map(([id, p]) => <Tile key={id} name={p.name} user={{ fullName: p.name, avatar: p.avatar }} stream={p.stream} audio={p.audio !== false} video={p.video !== false} screen={p.screen} />)}
                </div>
                <div className="mt-4 flex items-center justify-center gap-3">
                    <ControlButton on={mic} onClick={toggleMic} icon="mic" offIcon="mic_off" label={mic ? "Mute" : "Unmute"} />
                    <ControlButton on={cam} onClick={toggleCam} icon="videocam" offIcon="videocam_off" label={cam ? "Turn camera off" : "Turn camera on"} />
                    <ControlButton on onClick={toggleShare} icon={sharing ? "cancel_presentation" : "present_to_all"} label={sharing ? "Stop sharing" : "Share screen"} />
                    <ControlButton on onClick={() => setChatOpen((o) => !o)} icon="chat" label="Chat" />
                    <ControlButton danger onClick={() => { leave(); navigate("/meetings"); }} icon="call_end" label="Leave" />
                    {meeting.isHost && <button onClick={() => socket.emit("meet:end")} className="btn-ghost btn-sm text-danger">End for everyone</button>}
                </div>
            </div>
            {chatOpen && (
                <aside className="card flex w-80 shrink-0 flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                        <p className="text-[15px] font-semibold text-white">In-call chat</p>
                        <button onClick={() => setChatOpen(false)} className="btn-icon" aria-label="Close chat"><Icon name="close" /></button>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                        {chat.length ? chat.map((m, i) => (
                            <div key={i}><p className="text-[12.5px] text-faint">{m.userId === user._id ? "You" : m.from}</p><p className="text-[14.5px] text-zinc-200">{m.text}</p></div>
                        )) : <p className="text-center text-[13px] text-faint">Messages here disappear when the call ends.</p>}
                    </div>
                    <form onSubmit={sendChat} className="border-t border-line-soft p-3">
                        <input value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={500} className="field h-9 text-[14.5px]" placeholder="Send a message" aria-label="Chat message" />
                    </form>
                </aside>
            )}
        </div>
    );
}
