import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSocketEvent } from "../context/RealtimeContext";
import useApi from "../utils/useApi";
import { PeoplePicker } from "../components/ProjectForms";
import { Avatar, AvatarStack, Badge, DatePicker, Empty, ErrorText, Field, Icon, Input, Modal, PageHeader, PageSkeleton, Select, StatCard, Tabs, Toggle } from "../components/ui";
import { todayYMD } from "../utils/dates";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const when = (date) => new Date(date).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function ScheduleForm({ limits, onDone, onCancel }) {
    const { user } = useAuth();
    const toast = useToast();
    const members = useApi("/org/members");
    const projects = useApi("/projects");
    const google = useApi("/google/status");
    const [form, setForm] = useState({ title: "", description: "", date: todayYMD(), time: "", durationMinutes: 30, projectId: "", addGoogleMeet: false });
    const [people, setPeople] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }));

    const others = (members.data?.members || []).map((m) => m.user).filter((p) => p._id !== user._id);
    const allowed = DURATIONS.filter((d) => limits.minutes === null || d <= limits.minutes);

    const submit = async (event) => {
        event.preventDefault();
        if (!form.time) return setError("Choose a start time.");
        setBusy(true);
        setError("");
        try {
            const startsAt = new Date(`${form.date}T${form.time}`);
            const { meeting, googleInvited } = await api("/meetings", {
                method: "POST",
                body: { ...form, startsAt: startsAt.toISOString(), participantIds: people, projectId: form.projectId || undefined }
            });
            toast.success("Meeting scheduled", googleInvited ? "Invitations were sent from your Google Calendar." : "Everyone invited got a notification and an email.");
            onDone(meeting);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <p className="eyebrow">What and when</p>
            <Field label="Title"><Input icon="title" value={form.title} onChange={set("title")} required maxLength={100} placeholder="Sprint planning" aria-label="Title" /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Date"><DatePicker value={form.date} onChange={set("date")} clearable={false} ariaLabel="Meeting date" /></Field>
                <Field label="Start time"><Input icon="schedule" type="time" value={form.time} onChange={set("time")} required aria-label="Start time" /></Field>
                <Field label="Length" hint={limits.minutes ? `Your plan allows up to ${limits.minutes} min` : undefined}>
                    <Select value={form.durationMinutes} onChange={set("durationMinutes")} ariaLabel="Length" options={allowed.map((d) => ({ value: d, label: d < 60 ? `${d} minutes` : `${d / 60} hour${d > 60 ? "s" : ""}` }))} />
                </Field>
            </div>
            <p className="eyebrow border-t border-line-soft pt-4">Who</p>
            <Field label="Project (optional)" hint="Everyone in the project can join.">
                <Select value={form.projectId} onChange={set("projectId")} ariaLabel="Project"
                    options={[{ value: "", label: "No project", icon: "block" }, ...(projects.data?.projects || []).filter((p) => p.isMember || p.isLead).map((p) => ({ value: p._id, label: p.name, icon: "folder" }))]} />
            </Field>
            <Field label={`Invite people (up to ${limits.participants - 1})`}>
                {others.length ? <PeoplePicker people={others} selected={people} onChange={setPeople} /> : <p className="text-[14.5px] text-faint">Nobody else is in this organization yet.</p>}
            </Field>
            <p className="eyebrow border-t border-line-soft pt-4">Details</p>
            <Field label="Agenda (optional)"><textarea value={form.description} onChange={set("description")} maxLength={500} className="field min-h-20" placeholder="What will you cover?" aria-label="Agenda" /></Field>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-inset p-3.5">
                <div>
                    <p className="text-[15px] font-medium text-zinc-200">Also add a Google Meet link</p>
                    <p className="mt-0.5 text-[13px] text-faint">
                        {google.data?.connected ? "The meeting goes in your Google Calendar and Google emails the invitations." : "Connect Google Calendar on the My Calendar page to use this."}
                    </p>
                </div>
                <Toggle checked={form.addGoogleMeet} onChange={(on) => google.data?.connected && set("addGoogleMeet")(on)} label="Add Google Meet link" />
            </div>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
                <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
                <button disabled={busy} className="btn-primary"><Icon name="event" className="text-[17px]" />{busy ? "Scheduling…" : "Schedule meeting"}</button>
            </div>
        </form>
    );
}

const clock = (date) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const length = (minutes) => (minutes < 60 ? `${minutes} min` : `${+(minutes / 60).toFixed(1)} h`);

// "in 25 min", "in 3 h", "in 2 days"
function startsIn(date) {
    const minutes = Math.round((new Date(date) - Date.now()) / 60000);
    if (minutes <= 0) return "Started";
    if (minutes < 60) return `In ${minutes} min`;
    if (minutes < 24 * 60) return `In ${Math.round(minutes / 60)} h`;
    const days = Math.round(minutes / 1440);
    return days === 1 ? "Tomorrow" : `In ${days} days`;
}

function DateBlock({ date, tone = "" }) {
    const d = new Date(date);
    return (
        <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border ${tone || "border-line bg-inset"}`}>
            <span className="text-[12px] font-semibold text-faint uppercase">{d.toLocaleDateString(undefined, { month: "short" })}</span>
            <span className="text-[21px] leading-none font-semibold text-ink tabular-nums">{d.getDate()}</span>
            <span className="mt-0.5 text-[11.5px] text-faint">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
        </span>
    );
}

function meetingState(meeting) {
    const now = Date.now();
    const start = new Date(meeting.startsAt).getTime();
    const end = new Date(meeting.endsAt).getTime();
    const live = meeting.live > 0;
    const over = meeting.status === "ended" || end <= now;
    const joinable = !over && (live || now > start - 15 * 60000);
    return { now, start, end, live, over, joinable };
}

// An upcoming or live meeting: prominent, with everything needed to decide whether to join.
function MeetingCard({ meeting, onCancel }) {
    const { now, start, live, joinable } = meetingState(meeting);
    const people = [meeting.host, ...meeting.participants].filter(Boolean);
    return (
        <article className={`card relative flex flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:items-center ${live ? "border-danger/35" : joinable ? "border-accent/35" : ""}`}>
            {(live || joinable) && <span className={`absolute inset-y-0 left-0 w-[3px] ${live ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />}
            <DateBlock date={meeting.startsAt} tone={live ? "border-danger/30 bg-danger/[0.08]" : joinable ? "border-accent/30 bg-accent/[0.08]" : ""} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[16px] font-semibold text-ink">{meeting.title}</h3>
                    {live ? <Badge tone="red"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />Live · {meeting.live} in the call</Badge>
                        : joinable ? <Badge tone="teal" dot>Open to join</Badge>
                        : <Badge dot>{startsIn(meeting.startsAt)}</Badge>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[14px] text-muted">
                    <span className="inline-flex items-center gap-1"><Icon name="schedule" className="text-[15px] text-faint" />{clock(meeting.startsAt)} – {clock(meeting.endsAt)}</span>
                    <span className="inline-flex items-center gap-1"><Icon name="timelapse" className="text-[15px] text-faint" />{length(meeting.durationMinutes)}</span>
                    {meeting.project && <span className="inline-flex items-center gap-1"><Icon name="folder" className="text-[15px] text-faint" />{meeting.project.name}</span>}
                </p>
                {meeting.description && <p className="mt-1.5 line-clamp-1 text-[14px] text-faint">{meeting.description}</p>}
                <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted"><Avatar user={meeting.host} size="h-5 w-5 text-[9.5px]" />{meeting.isHost ? "You're hosting" : `Hosted by ${meeting.host?.fullName}`}</span>
                    {people.length > 1 && <><span className="text-faint">·</span><AvatarStack users={people} max={5} size="h-5 w-5 text-[9.5px]" /><span className="text-[13.5px] text-faint">{people.length} invited</span></>}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {meeting.meetLink && <a href={meeting.meetLink} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" title="Open in Google Meet"><Icon name="open_in_new" className="text-[17px]" />Google Meet</a>}
                <Link to={`/meet/${meeting.roomId}`} className={joinable ? "btn-primary" : "btn-secondary"}><Icon name="videocam" fill={joinable} className="text-[18px]" />{live ? "Join now" : joinable ? "Join" : "Open room"}</Link>
                {meeting.isHost && start > now && <button onClick={() => onCancel(meeting)} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label={`Cancel ${meeting.title}`} title="Cancel meeting"><Icon name="event_busy" /></button>}
            </div>
        </article>
    );
}

// A meeting that has finished: one compact row.
function PastRow({ meeting }) {
    const people = [meeting.host, ...meeting.participants].filter(Boolean);
    const d = new Date(meeting.startsAt);
    return (
        <li className="flex items-center gap-3.5 py-3">
            <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-inset">
                <span className="text-[11px] font-semibold text-faint uppercase">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                <span className="text-[15px] leading-none font-semibold text-zinc-200 tabular-nums">{d.getDate()}</span>
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-zinc-100">{meeting.title}</p>
                <p className="truncate text-[13.5px] text-faint">{d.toLocaleDateString(undefined, { weekday: "short" })} {clock(meeting.startsAt)} · {length(meeting.durationMinutes)} · {meeting.isHost ? "hosted by you" : `hosted by ${meeting.host?.fullName}`}{meeting.project ? ` · ${meeting.project.name}` : ""}</p>
            </div>
            <AvatarStack users={people} max={4} size="h-6 w-6 text-[10.5px]" />
            <Badge>Ended</Badge>
        </li>
    );
}

export default function Meetings() {
    const toast = useToast();
    const navigate = useNavigate();
    const { data, loading, error, reload } = useApi("/meetings");
    const [scheduling, setScheduling] = useState(false);
    const [starting, setStarting] = useState(false);
    const [tab, setTab] = useState("upcoming");

    // Someone started or ended a meeting: refresh the "Live" badges.
    useSocketEvent("meeting:ring", () => reload());

    if (loading && !data) return <PageSkeleton />;
    const meetings = data?.meetings || [];
    const limits = data?.limits || { minutes: 40, participants: 4 };
    const now = Date.now();
    const live = meetings.filter((m) => m.live > 0);
    const upcoming = meetings.filter((m) => !m.live && new Date(m.endsAt) > now && m.status !== "ended");
    const past = meetings.filter((m) => !m.live && (new Date(m.endsAt) <= now || m.status === "ended")).reverse();
    const thisWeek = upcoming.filter((m) => new Date(m.startsAt) - now < 7 * 864e5);
    const hosting = upcoming.filter((m) => m.isHost).length;
    const pastMinutes = past.reduce((sum, m) => sum + m.durationMinutes, 0);
    const next = upcoming[0];

    const startNow = async () => {
        setStarting(true);
        try {
            const { meeting } = await api("/meetings", { method: "POST", body: { instant: true, title: "Quick meeting", durationMinutes: limits.minutes ?? 60 } });
            navigate(`/meet/${meeting.roomId}`);
        } catch (e) {
            toast.error("Couldn't start the meeting", e.message);
            setStarting(false);
        }
    };

    const cancel = async (meeting) => {
        if (!confirm(`Cancel "${meeting.title}"? Everyone invited will be told.`)) return;
        try {
            await api(`/meetings/${meeting._id}`, { method: "DELETE" });
            toast.success("Meeting cancelled");
            reload();
        } catch (e) {
            toast.error("Couldn't cancel", e.message);
        }
    };

    // Upcoming meetings grouped under day headings, like a timeline.
    const dayKey = (m) => new Date(m.startsAt).toDateString();
    const dayTitle = (m) => {
        const d = new Date(m.startsAt);
        const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
        return diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    };

    return (
        <>
            <PageHeader title="Meetings" subtitle={`Video calls inside CollabOS, with screen sharing and in-call chat. Your plan allows up to ${limits.participants} people${limits.minutes ? ` for ${limits.minutes} minutes` : " with no time limit"}.`}>
                <button onClick={() => setScheduling(true)} className="btn-secondary"><Icon name="event" className="text-[17px]" />Schedule meeting</button>
                <button onClick={startNow} disabled={starting} className="btn-primary"><Icon name="video_call" fill className="text-[18px]" />{starting ? "Starting…" : "Start meeting now"}</button>
            </PageHeader>
            <ErrorText>{error}</ErrorText>

            <section className="mt-6 stats">
                <StatCard label="Happening now" value={live.length} icon="sensors" tone="danger" hint={live.length ? "Join from the list below" : "No calls in progress"} />
                <StatCard label="This week" value={thisWeek.length} icon="date_range" tone="primary" hint={next ? `Next: ${startsIn(next.startsAt).toLowerCase()}` : "Nothing scheduled"} />
                <StatCard label="You're hosting" value={hosting} icon="co_present" tone="success" hint={`${upcoming.length} upcoming in total`} />
                <StatCard label="Past 30 days" value={past.length} icon="history" tone="steel" hint={past.length ? `${length(pastMinutes)} scheduled` : "No past meetings"} />
            </section>

            {live.length > 0 && (
                <section className="mt-6">
                    <h2 className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold text-zinc-100"><span className="h-2 w-2 animate-pulse rounded-full bg-danger" />Happening now</h2>
                    <div className="space-y-3">{live.map((m) => <MeetingCard key={m._id} meeting={m} onCancel={cancel} />)}</div>
                </section>
            )}

            <div className="mt-6">
                <Tabs value={tab} onChange={setTab} items={[{ value: "upcoming", label: "Upcoming", icon: "event_upcoming", count: upcoming.length }, { value: "past", label: "Past", icon: "history", count: past.length }]} />
            </div>

            {tab === "upcoming" ? (
                upcoming.length ? (
                    <div className="mt-4 space-y-3">
                        {upcoming.map((m, i) => (
                            <div key={m._id}>
                                {(i === 0 || dayKey(upcoming[i - 1]) !== dayKey(m)) && <p className={`eyebrow mb-2 ${i ? "mt-5" : ""} ${dayTitle(m) === "Today" ? "text-accent" : ""}`}>{dayTitle(m)}</p>}
                                <MeetingCard meeting={m} onCancel={cancel} />
                            </div>
                        ))}
                        <p className="pt-1 text-center text-[13.5px] text-faint">Rooms open 15 minutes before the start time.</p>
                    </div>
                ) : (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <button onClick={startNow} disabled={starting} className="card-link group flex items-center gap-4 p-5 text-left">
                            <span className="tile tile-teal h-12 w-12 rounded-xl"><Icon name="video_call" fill className="text-[26px]" /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[16px] font-semibold text-ink">Start a meeting now</span>
                                <span className="mt-0.5 block text-[14.5px] text-muted">Opens a room straight away. Anyone in your organization can join with the link.</span>
                            </span>
                            <Icon name="arrow_forward" className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                        </button>
                        <button onClick={() => setScheduling(true)} className="card-link group flex items-center gap-4 p-5 text-left">
                            <span className="tile tile-green h-12 w-12 rounded-xl"><Icon name="event" className="text-[26px]" /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[16px] font-semibold text-ink">Schedule for later</span>
                                <span className="mt-0.5 block text-[14.5px] text-muted">Pick a time and invite people. They get a notification and an email.</span>
                            </span>
                            <Icon name="arrow_forward" className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                        </button>
                        <p className="text-center text-[14px] text-faint lg:col-span-2">No upcoming meetings. Scheduled meetings appear here and in your calendar.</p>
                    </div>
                )
            ) : past.length ? (
                <ul className="rows-card mt-4">{past.map((m) => <PastRow key={m._id} meeting={m} />)}</ul>
            ) : (
                <div className="card mt-4"><Empty icon="history" title="No past meetings">Meetings from the last 30 days are listed here once they end.</Empty></div>
            )}

            <Modal open={scheduling} onClose={() => setScheduling(false)} title="Schedule a meeting" description="Invite people from your organization. They get a notification and an email." size="max-w-2xl">
                <ScheduleForm limits={limits} onCancel={() => setScheduling(false)} onDone={() => { setScheduling(false); reload(); }} />
            </Modal>
        </>
    );
}
