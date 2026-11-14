import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useRealtime, useSocketEvent } from "../context/RealtimeContext";
import useApi from "../utils/useApi";
import { Avatar, Badge, Empty, ErrorText, Icon, Input, Kbd, PageSkeleton, Popover, Skeleton, Tooltip } from "../components/ui";
import { ProjectMark } from "../components/ProjectCard";
import { askAssistant } from "../components/AssistantPanel";

const TYPING_TIMEOUT = 3000;
const EMOJI = ["👍", "🙏", "🎉", "✅", "🔥", "😀", "😂", "😅", "🤔", "👀", "❤️", "🚀", "💡", "⚠️", "👋", "🙌"];

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayLabel = (date) => {
    const d = new Date(date);
    if (sameDay(d, new Date())) return "Today";
    if (sameDay(d, Date.now() - 864e5)) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};
const timeOf = (date) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
// Short time for the conversation list: "4:12 PM", "Yesterday", "Mon", "12 Nov".
const shortTime = (date) => {
    const d = new Date(date);
    if (sameDay(d, new Date())) return timeOf(d);
    if (sameDay(d, Date.now() - 864e5)) return "Yesterday";
    if (Date.now() - d < 6 * 864e5) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

// Does this message belong to the open conversation?
function inConversation(message, type, activeId, myId) {
    if (type === "project") return message.project === activeId;
    if (message.project) return false;
    const sender = message.sender?._id ?? message.sender;
    return (sender === activeId && message.recipient === myId) || (sender === myId && message.recipient === activeId);
}

function TypingDots() {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[0, 150, 300].map((delay) => <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/70" style={{ animationDelay: `${delay}ms` }} />)}
        </span>
    );
}

// A project channel's mark in the list and header.
const ChannelMark = ({ channel, size = "h-9 w-9 text-[15px]" }) => <ProjectMark project={channel} size={size} />;

// Right-hand panel: who is in this conversation.
function Details({ type, active, online, onClose }) {
    const project = useApi(type === "project" ? `/projects/${active._id}` : null);
    const people = project.data ? [project.data.project.owner, ...project.data.project.members] : [];
    return (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[300px] animate-slide-in flex-col border-l border-line-soft bg-panel xl:static xl:animate-none" aria-label="Conversation details">
            <header className="flex h-[57px] shrink-0 items-center justify-between border-b border-line-soft px-4">
                <h3 className="text-[15px] font-semibold text-zinc-100">Details</h3>
                <button onClick={onClose} className="btn-icon" aria-label="Close details"><Icon name="close" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
                {type === "user" ? (
                    <>
                        <div className="flex flex-col items-center text-center">
                            <Avatar user={active} size="h-16 w-16 text-lg" online={online.has(active._id)} />
                            <p className="mt-3 text-[16px] font-semibold text-ink">{active.fullName}</p>
                            <p className="text-[14px] text-muted">{active.email}</p>
                            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                                <Badge tone="teal" icon="badge">{active.roleName}</Badge>
                                <Badge tone={online.has(active._id) ? "green" : ""} dot>{online.has(active._id) ? "Online" : "Offline"}</Badge>
                            </div>
                        </div>
                        <p className="mt-5 rounded-lg border border-line bg-inset p-3 text-[13.5px] leading-relaxed text-faint"><Icon name="lock" className="mr-1 align-[-2px] text-[14.5px]" />Direct messages are only visible to the two of you. You'll see “Seen” once they've read your last message.</p>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            <ChannelMark channel={active} size="h-11 w-11 text-[18px]" />
                            <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-ink">{active.name}</p>
                                <p className="text-[13.5px] text-muted">Project channel</p>
                            </div>
                        </div>
                        <Link to={`/projects/${active._id}`} className="btn-secondary btn-sm mt-3 w-full"><Icon name="folder" className="text-[16px]" />Open project</Link>
                        <p className="eyebrow mt-5 mb-2">Members {people.length > 0 && <span className="tabular-nums">· {people.length}</span>}</p>
                        {project.loading && !project.data ? <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div> : (
                            <ul className="space-y-0.5">
                                {people.map((p, i) => (
                                    <li key={p._id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
                                        <Avatar user={p} size="h-7 w-7 text-[11.5px]" online={online.has(p._id)} />
                                        <span className="min-w-0 flex-1 truncate text-[14.5px] text-zinc-200">{p.fullName}</span>
                                        {i === 0 && <span className="text-[12.5px] text-faint">Lead</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-4 text-[13.5px] leading-relaxed text-faint">Everyone in the project can read and post here.</p>
                    </>
                )}
            </div>
        </aside>
    );
}

export default function Messages() {
    const { user, organization } = useAuth();
    const { socket, connected, online } = useRealtime();
    const { data, loading, reload: reloadConversations } = useApi("/messages/conversations");
    const [params, setParams] = useSearchParams();
    const [messages, setMessages] = useState(null);
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");
    const [find, setFind] = useState(null);     // null = closed, string = search within this conversation
    const [error, setError] = useState("");
    const [typing, setTyping] = useState({});   // userId → name, for the open conversation
    const [unread, setUnread] = useState({});   // userId → count of unread direct messages
    const [previews, setPreviews] = useState({}); // "project:<id>" | "user:<id>" → { text, at, mine, senderName }
    const [details, setDetails] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const feed = useRef(null);
    const input = useRef(null);
    const emojiAnchor = useRef(null);
    const typingTimers = useRef({});
    const lastTypingSent = useRef(0);

    // The open conversation lives in the URL: ?project=<id> or ?user=<id>.
    const channels = useMemo(() => data?.channels || [], [data]);
    const contacts = useMemo(() => data?.contacts || [], [data]);
    const explicit = Boolean(params.get("user") || params.get("project"));
    const type = params.get("user") ? "user" : "project";
    const activeId = params.get("user") || params.get("project") || channels[0]?._id;
    const active = type === "user" ? contacts.find((c) => c._id === activeId) : channels.find((c) => c._id === activeId);

    useEffect(() => {
        setUnread(Object.fromEntries(contacts.map((c) => [c._id, c.unread || 0])));
        setPreviews(Object.fromEntries([
            ...channels.filter((c) => c.last).map((c) => [`project:${c._id}`, c.last]),
            ...contacts.filter((c) => c.last).map((c) => [`user:${c._id}`, c.last])
        ]));
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    // Opening a direct message marks it as read (the sender sees "Seen").
    const markRead = () => {
        if (type !== "user" || !activeId || !socket) return;
        socket.emit("messages:read", { user: activeId });
        setUnread((prev) => ({ ...prev, [activeId]: 0 }));
    };

    // Load the conversation once; after that, new messages arrive over Socket.io.
    // (Reloaded on reconnect, in case anything was missed while offline.)
    useEffect(() => {
        if (!activeId) return;
        let cancelled = false;
        setMessages(null);
        setError("");
        setTyping({});
        setFind(null);
        api(`/messages?${type}=${activeId}`)
            .then(({ messages: list }) => { if (!cancelled) setMessages(list); })
            .catch((e) => { if (!cancelled) { setError(e.message); setMessages([]); } });
        markRead();
        return () => { cancelled = true; };
    }, [type, activeId, connected]); // eslint-disable-line react-hooks/exhaustive-deps

    const notePreview = (message) => {
        const mine = message.sender?._id === user._id;
        const key = message.project ? `project:${message.project}` : `user:${mine ? message.recipient : message.sender?._id}`;
        setPreviews((prev) => ({ ...prev, [key]: { text: message.text, at: message.createdAt, mine, senderName: mine ? "You" : message.sender?.fullName } }));
    };

    useSocketEvent("message:new", ({ message, orgId }) => {
        if (orgId && orgId !== organization._id) return;
        notePreview(message);
        if (inConversation(message, type, activeId, user._id)) {
            setMessages((prev) => ((prev || []).some((m) => m._id === message._id) ? prev : [...(prev || []), message]));
            const sender = message.sender?._id;
            if (sender !== user._id) {
                setTyping((prev) => { const next = { ...prev }; delete next[sender]; return next; });
                if (type === "user" && document.visibilityState === "visible") markRead();
            }
        } else if (!message.project && message.sender?._id !== user._id) {
            setUnread((prev) => ({ ...prev, [message.sender._id]: (prev[message.sender._id] || 0) + 1 }));
        }
    });

    useSocketEvent("typing", ({ from, name, typing: isTyping, project, user: dmFrom, orgId }) => {
        const here = type === "project" ? project === activeId : (dmFrom === activeId && (!orgId || orgId === organization._id));
        if (!here || from === user._id) return;
        clearTimeout(typingTimers.current[from]);
        setTyping((prev) => {
            const next = { ...prev };
            if (isTyping) next[from] = name; else delete next[from];
            return next;
        });
        if (isTyping) {
            typingTimers.current[from] = setTimeout(() => setTyping((prev) => { const next = { ...prev }; delete next[from]; return next; }), TYPING_TIMEOUT);
        }
    });

    useSocketEvent("messages:read", ({ by, at, orgId }) => {
        if (orgId !== organization._id || type !== "user" || by !== activeId) return;
        setMessages((prev) => (prev || []).map((m) => (m.sender?._id === user._id && !m.readAt ? { ...m, readAt: at } : m)));
    });

    // Someone joined a project or the people list changed.
    useSocketEvent("session:changed", () => reloadConversations());

    useEffect(() => {
        if (find) return;
        feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
    }, [messages, typing, find]);

    useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

    // The message box grows with what you type.
    useEffect(() => {
        const el = input.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }, [text, activeId]);

    // Tell the others we're typing, at most once a second.
    const onType = (value) => {
        setText(value);
        if (!socket || Date.now() - lastTypingSent.current < 1000) return;
        lastTypingSent.current = Date.now();
        socket.emit("typing", { [type]: activeId, typing: Boolean(value.trim()) });
    };

    const send = async (event) => {
        event?.preventDefault();
        if (!text.trim()) return;
        try {
            const { message } = await api("/messages", { method: "POST", body: { [type]: activeId, text } });
            setMessages((prev) => ((prev || []).some((m) => m._id === message._id) ? prev : [...(prev || []), message]));
            notePreview({ ...message, sender: { _id: user._id, fullName: user.fullName }, project: type === "project" ? activeId : null, recipient: type === "user" ? activeId : null });
            setText("");
            setError("");
            socket?.emit("typing", { [type]: activeId, typing: false });
            lastTypingSent.current = 0;
        } catch (e) {
            setError(e.message);
        }
    };

    const addEmoji = (emoji) => {
        const el = input.current;
        const at = el?.selectionStart ?? text.length;
        onType(text.slice(0, at) + emoji + text.slice(at));
        setEmojiOpen(false);
        setTimeout(() => { el?.focus(); el?.setSelectionRange(at + emoji.length, at + emoji.length); }, 0);
    };

    if (loading && !data) return <PageSkeleton />;

    const q = search.trim().toLowerCase();
    const shownChannels = channels.filter((c) => c.name.toLowerCase().includes(q));
    // People you've talked to most recently come first.
    const shownContacts = contacts.filter((c) => c.fullName.toLowerCase().includes(q))
        .sort((a, b) => new Date(previews[`user:${b._id}`]?.at || 0) - new Date(previews[`user:${a._id}`]?.at || 0) || a.fullName.localeCompare(b.fullName));
    const totalUnread = Object.values(unread).reduce((sum, n) => sum + n, 0);

    const row = (kind, entry, label, leading, fallback) => {
        const selected = activeId === entry._id && type === kind;
        const last = previews[`${kind}:${entry._id}`];
        const badge = kind === "user" ? unread[entry._id] : 0;
        return (
            <li key={entry._id}>
                <button onClick={() => setParams({ [kind]: entry._id })} aria-current={selected ? "true" : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${selected ? "bg-accent/[0.09]" : "hover:bg-white/[0.04]"}`}>
                    {selected && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden="true" />}
                    {leading}
                    <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                            <span className={`min-w-0 flex-1 truncate text-[14.5px] ${badge ? "font-semibold text-white" : selected ? "font-medium text-white" : "font-medium text-zinc-200"}`}>{label}</span>
                            {last && <span className={`shrink-0 text-[12.5px] tabular-nums ${badge ? "text-accent" : "text-faint"}`}>{shortTime(last.at)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                            <span className={`min-w-0 flex-1 truncate text-[13.5px] ${badge ? "text-zinc-200" : "text-faint"}`}>
                                {last ? <>{last.mine ? "You: " : kind === "project" && last.senderName ? `${last.senderName.split(" ")[0]}: ` : ""}{last.text}</> : fallback}
                            </span>
                            {badge > 0 && <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[12px] font-bold text-primary-ink tabular-nums">{badge > 9 ? "9+" : badge}</span>}
                        </span>
                    </span>
                </button>
            </li>
        );
    };

    const typingNames = Object.values(typing);
    const list = messages || [];
    const lastMine = [...list].reverse().find((m) => m.sender?._id === user._id);
    const needle = (find || "").trim().toLowerCase();
    const visible = needle ? list.filter((m) => m.text.toLowerCase().includes(needle)) : list;
    const name = active ? (type === "user" ? active.fullName : active.name) : "";

    return (
        <div className="card relative flex h-[calc(100dvh-6.5rem)] min-h-[520px] overflow-hidden -mb-[4.5rem] lg:h-[calc(100dvh-7rem)]">
            {/* Conversation list */}
            <aside className={`w-full shrink-0 flex-col border-line-soft bg-sidebar/50 md:flex md:w-[300px] md:border-r ${explicit ? "hidden" : "flex"}`} aria-label="Conversations">
                <div className="flex h-[57px] shrink-0 items-center justify-between border-b border-line-soft px-4">
                    <h1 className="text-[16px] font-semibold text-ink">Messages</h1>
                    {totalUnread > 0 && <Badge tone="teal">{totalUnread} unread</Badge>}
                </div>
                <div className="p-3 pb-1"><Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></div>
                <div className="flex-1 overflow-y-auto px-2 pb-3">
                    <p className="eyebrow flex items-center justify-between px-2.5 pt-3 pb-1.5">Project channels<span className="tabular-nums">{shownChannels.length}</span></p>
                    <ul className="space-y-0.5">
                        {shownChannels.map((c) => row("project", c, c.name, <ChannelMark channel={c} />, `${c.memberCount || ""} members · no messages yet`.trim()))}
                        {!channels.length && <li className="px-2.5 py-2 text-[14px] text-faint">Join a project to get its channel.</li>}
                    </ul>
                    <p className="eyebrow flex items-center justify-between px-2.5 pt-5 pb-1.5">Direct messages<span className="tabular-nums">{shownContacts.length}</span></p>
                    <ul className="space-y-0.5">
                        {shownContacts.map((c) => row("user", c, c.fullName, <Avatar user={c} size="h-9 w-9 text-[12.5px]" online={online.has(c._id)} />, c.roleName))}
                        {!contacts.length && <li className="px-2.5 py-2 text-[14px] text-faint">Invite people to your organization to message them.</li>}
                    </ul>
                    {q && !shownChannels.length && !shownContacts.length && <p className="px-2.5 py-6 text-center text-[14px] text-faint">Nothing matches “{search}”.</p>}
                </div>
                <p className="flex items-center gap-1.5 border-t border-line-soft px-4 py-2 text-[13px] text-faint">
                    <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "animate-pulse bg-warning"}`} />{connected ? "Connected · messages arrive instantly" : "Reconnecting…"}
                </p>
            </aside>

            {/* Conversation */}
            <section className={`min-w-0 flex-1 flex-col md:flex ${explicit ? "flex" : "hidden"}`}>
                {active ? (
                    <>
                        <header className="flex h-[57px] shrink-0 items-center gap-3 border-b border-line-soft px-3 sm:px-4">
                            <button onClick={() => setParams({})} className="btn-icon -ml-1 md:hidden" aria-label="Back to conversations"><Icon name="arrow_back" /></button>
                            {type === "user" ? <Avatar user={active} size="h-9 w-9 text-[13px]" online={online.has(active._id)} /> : <ChannelMark channel={active} />}
                            <div className="min-w-0 flex-1">
                                <h2 className="truncate text-[15px] font-semibold text-ink">{name}</h2>
                                <p className="truncate text-[13.5px] text-faint">
                                    {typingNames.length ? <span className="text-accent">{typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…</span>
                                        : type === "user" ? (online.has(active._id) ? "Online now" : active.roleName) : `Project channel${active.memberCount ? ` · ${active.memberCount} members` : ""}`}
                                </p>
                            </div>
                            <Tooltip label="Search this conversation"><button onClick={() => setFind((f) => (f === null ? "" : null))} className={`btn-icon ${find !== null ? "bg-white/[0.07] text-white" : ""}`} aria-label="Search this conversation" aria-pressed={find !== null}><Icon name="search" /></button></Tooltip>
                            <Tooltip label="Summarize with the assistant">
                                <button onClick={() => askAssistant(type === "user"
                                    ? `Summarize my recent direct messages with ${active.fullName}: key points, decisions and anything I still need to reply to or do.`
                                    : `Summarize the recent chat in the "${active.name}" project channel: decisions, open questions and action items (with who should do them).`)}
                                    className="btn-icon text-accent hover:text-accent" aria-label="Summarize this conversation"><Icon name="auto_awesome" fill /></button>
                            </Tooltip>
                            <Tooltip label="Details"><button onClick={() => setDetails((d) => !d)} className={`btn-icon ${details ? "bg-white/[0.07] text-white" : ""}`} aria-label="Conversation details" aria-pressed={details}><Icon name="info" /></button></Tooltip>
                        </header>

                        {find !== null && (
                            <div className="flex items-center gap-2 border-b border-line-soft bg-inset px-4 py-2">
                                <div className="flex-1"><Input icon="search" autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search in ${name}`} aria-label="Search messages" className="h-8" /></div>
                                <span className="text-[13.5px] text-faint tabular-nums">{needle ? `${visible.length} of ${list.length}` : `${list.length} messages`}</span>
                                <button onClick={() => setFind(null)} className="btn-ghost btn-sm">Done</button>
                            </div>
                        )}

                        <div ref={feed} className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                            {messages === null ? (
                                <div className="space-y-4" aria-busy="true">{[60, 40, 72, 48].map((w, i) => <div key={i} className={`flex gap-2.5 ${i % 2 ? "flex-row-reverse" : ""}`}><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-10" style={{ width: `${w}%` }} /></div>)}</div>
                            ) : visible.length ? visible.map((m, i) => {
                                const mine = m.sender?._id === user._id;
                                const prev = visible[i - 1];
                                const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
                                const grouped = !newDay && prev?.sender?._id === m.sender?._id && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60e3;
                                return (
                                    <div key={m._id}>
                                        {newDay && (
                                            <div className="my-4 flex items-center gap-3" role="separator">
                                                <span className="h-px flex-1 bg-line-soft" />
                                                <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[12.5px] font-medium text-muted">{dayLabel(m.createdAt)}</span>
                                                <span className="h-px flex-1 bg-line-soft" />
                                            </div>
                                        )}
                                        <div className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3.5"}`}>
                                            <div className="w-8 shrink-0">{!grouped && <Avatar user={m.sender} size="h-8 w-8 text-[11.5px]" />}</div>
                                            <div className={`flex max-w-[78%] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
                                                {!grouped && (
                                                    <p className="mb-1 flex items-baseline gap-2 px-0.5">
                                                        <span className="text-[14px] font-semibold text-zinc-100">{mine ? "You" : m.sender?.fullName}</span>
                                                        <span className="text-[12.5px] text-faint">{timeOf(m.createdAt)}</span>
                                                    </p>
                                                )}
                                                <p title={new Date(m.createdAt).toLocaleString()}
                                                    className={`rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap ${mine ? "rounded-tr-md border border-accent/20 bg-accent/[0.13] text-zinc-50" : "rounded-tl-md border border-line bg-white/[0.04] text-zinc-100"}`}>{m.text}</p>
                                                {type === "user" && m === lastMine && !needle && (
                                                    <p className="mt-1 flex items-center gap-1 px-1 text-[12.5px] text-faint">
                                                        <Icon name={m.readAt ? "done_all" : "done"} className={`text-[15px] ${m.readAt ? "text-accent" : ""}`} />
                                                        {m.readAt ? `Seen ${timeOf(m.readAt)}` : "Sent"}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : needle ? <Empty icon="search_off" title="No messages match">Try a different word. Search covers the most recent 200 messages.</Empty>
                                : <Empty icon="waving_hand" title={type === "user" ? `Say hello to ${active.fullName.split(" ")[0]}` : `Welcome to ${active.name}`}>{type === "user" ? "This is the start of your direct conversation." : "This channel is for everyone in the project. Share an update to get it started."}</Empty>}
                            {typingNames.length > 0 && !needle && (
                                <div className="mt-3 flex items-center gap-2.5 pl-[42px]">
                                    <span className="rounded-2xl rounded-tl-md border border-line bg-white/[0.04] px-3.5 py-3"><TypingDots /></span>
                                    <span className="text-[13px] text-faint">{typingNames[0].split(" ")[0]} is typing</span>
                                </div>
                            )}
                        </div>

                        <form onSubmit={send} className="border-t border-line-soft p-3 sm:px-5 sm:py-3.5">
                            <ErrorText>{error}</ErrorText>
                            <div className="rounded-xl border border-line bg-inset transition-[border-color,box-shadow] focus-within:border-accent/55 focus-within:ring-[3px] focus-within:ring-accent/12">
                                <textarea ref={input} value={text} onChange={(e) => onType(e.target.value)} rows={1} maxLength={2000}
                                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                    className="block max-h-[150px] min-h-10 w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-[15px] text-white outline-none placeholder:text-faint"
                                    placeholder={`Message ${type === "user" ? active.fullName : active.name}`} aria-label="Message" />
                                <div className="flex items-center gap-1 px-2 pb-2">
                                    <Tooltip label="Add an emoji"><button type="button" ref={emojiAnchor} onClick={() => setEmojiOpen((o) => !o)} className="btn-icon h-7 w-7" aria-label="Add an emoji" aria-expanded={emojiOpen}><Icon name="mood" className="text-[20px]" /></button></Tooltip>
                                    <Popover anchorRef={emojiAnchor} open={emojiOpen} onClose={() => setEmojiOpen(false)} className="p-2">
                                        <div className="grid grid-cols-8 gap-0.5">
                                            {EMOJI.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)} className="flex h-8 w-8 items-center justify-center rounded-md text-[18px] transition-colors hover:bg-white/[0.08]" aria-label={`Insert ${e}`}>{e}</button>)}
                                        </div>
                                    </Popover>
                                    <span className="ml-auto hidden text-[12.5px] text-faint sm:inline"><Kbd>↵</Kbd> send · <Kbd>Shift ↵</Kbd> new line</span>
                                    {text.length > 1800 && <span className="text-[12.5px] text-warning tabular-nums">{2000 - text.length}</span>}
                                    <button disabled={!text.trim()} className="btn-primary ml-1 h-8 gap-1 rounded-lg px-2.5" aria-label="Send message"><Icon name="send" fill className="text-[17px]" /><span className="hidden sm:inline">Send</span></button>
                                </div>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="m-auto"><Empty icon="forum" title="No conversation selected">Pick a project channel or a person to start talking.</Empty></div>
                )}
            </section>

            {details && active && <Details type={type} active={active} online={online} onClose={() => setDetails(false)} />}
        </div>
    );
}
