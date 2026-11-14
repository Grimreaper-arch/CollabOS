import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import useApi from "../utils/useApi";
import { useToast } from "../context/ToastContext";
import TaskCard from "../components/TaskCard";
import { Badge, Empty, Icon, PageHeader, PageSkeleton, Panel, PRIORITY, Segmented, StatCard, Toggle } from "../components/ui";
import { WEEKDAYS, addDays, addMonths, daysFromToday, dueYMD, monthGrid, monthLabel, parseYMD, startOfMonth, toYMD, todayYMD } from "../utils/dates";
import { desktopAlertsEnabled, desktopAlertsSupported, disableDesktopAlerts, enableDesktopAlerts } from "../utils/desktopAlerts";
import { useLiveReload } from "../context/RealtimeContext";

// Builds an .ics file so tasks can be imported into Google Calendar / Outlook,
// each with a reminder one day before.
function exportIcs(tasks, projects) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const escape = (s = "") => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const event = (uid, ymd, summary, description) => {
        const start = ymd.replace(/-/g, "");
        const end = toYMD(addDays(parseYMD(ymd), 1)).replace(/-/g, "");
        return [
            "BEGIN:VEVENT", `UID:${uid}@collabos`, `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
            `SUMMARY:${escape(summary)}`, `DESCRIPTION:${escape(description)}`,
            "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", `DESCRIPTION:${escape(summary)}`, "END:VALARM",
            "END:VEVENT"
        ].join("\r\n");
    };
    const events = [
        ...tasks.map((t) => event(t._id, dueYMD(t.dueDate), `Due: ${t.title}`, `Project: ${t.project?.name || ""} · Priority: ${t.priority}`)),
        ...projects.map((p) => event(p._id, dueYMD(p.dueDate), `Project deadline: ${p.name}`, p.description || ""))
    ];
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CollabOS//Calendar//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    Object.assign(document.createElement("a"), { href: url, download: "collabos-deadlines.ics" }).click();
    URL.revokeObjectURL(url);
}

const timeOf = (date) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// How each kind of calendar item looks: teal for meetings, green for project deadlines,
// steel for Google events, and tasks coloured by state.
const KIND = {
    meeting: { icon: "videocam", pill: "border-l-accent bg-accent/10 text-[#8be0d5]", dot: "bg-accent", label: "Meeting" },
    project: { icon: "flag", pill: "border-l-success bg-success/10 text-[#8fe0b3]", dot: "bg-success", label: "Project deadline" },
    google: { icon: "event", pill: "border-l-steel bg-steel/10 text-[#b5c6d3]", dot: "bg-steel", label: "Google Calendar" }
};
const taskPill = (item) => (item.done ? "border-l-zinc-600 bg-white/[0.03] text-faint line-through" : item.overdue ? "border-l-danger bg-danger/10 text-[#f5a29d]" : "border-l-zinc-500 bg-white/[0.05] text-zinc-200");

function ItemPill({ item }) {
    const kind = KIND[item.kind];
    return (
        <span className={`flex min-w-0 items-center gap-1.5 rounded-[5px] border-l-2 px-1.5 py-[3px] text-[12.5px] leading-tight ${kind ? kind.pill : taskPill(item)}`}>
            {kind ? <Icon name={kind.icon} className="text-[13.5px]" /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY[item.priority]?.dot || "bg-faint"}`} />}
            <span className="truncate">{item.title}</span>
        </span>
    );
}

// Connect / sync / disconnect Google Calendar.
function GoogleCalendarPanel({ status, onChange }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const run = async (action) => {
        setBusy(true);
        try { await action(); } catch (e) { toast.error("Google Calendar", e.message); } finally { setBusy(false); }
    };
    const connect = () => run(async () => { window.location.href = (await api("/google/connect-url")).url; });
    const sync = () => run(async () => { const { message } = await api("/google/sync", { method: "POST" }); toast.success("Synced", message); onChange(); });
    const disconnect = () => run(async () => {
        if (!confirm("Disconnect Google Calendar? Events already added stay in your Google Calendar.")) return;
        await api("/google/disconnect", { method: "POST" });
        toast.success("Google Calendar disconnected");
        onChange();
    });

    return (
        <Panel title="Google Calendar" icon="sync"
            action={status?.connected ? <Badge tone="green" dot>Connected</Badge> : status?.configured ? <Badge dot>Not connected</Badge> : null}>
            {!status ? <p className="text-[14.5px] text-muted">Checking…</p> : !status.configured ? (
                <p className="flex items-start gap-2 rounded-lg border border-line bg-inset p-3 text-[14.5px] text-muted">
                    <Icon name="info" className="text-[20px] text-faint" />Google isn't set up on this server yet. The administrator needs to add Google OAuth keys.
                </p>
            ) : status.connected ? (
                <div className="space-y-3">
                    <p className="truncate text-[14.5px] text-zinc-200">Signed in as <span className="font-medium">{status.email}</span></p>
                    <p className="text-[13.5px] leading-relaxed text-faint">New tasks assigned to you appear in Google Calendar automatically, with a reminder on the morning they're due. Your Google events show here in steel blue.</p>
                    <div className="flex gap-2">
                        <button disabled={busy} onClick={sync} className="btn-secondary btn-sm flex-1"><Icon name="sync" className={`text-[17px] ${busy ? "animate-spin" : ""}`} />Sync my tasks</button>
                        <button disabled={busy} onClick={disconnect} className="btn-ghost btn-sm">Disconnect</button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-[14px] leading-relaxed text-muted">See your deadlines and CollabOS meetings in Google Calendar, and your Google events here.</p>
                    <button disabled={busy} onClick={connect} className="btn-secondary w-full"><Icon name="add_link" className="text-[17px]" />Connect Google Calendar</button>
                </div>
            )}
        </Panel>
    );
}

function DayCell({ day, month, items, selected, onSelect }) {
    const ymd = toYMD(day);
    const inMonth = day.getMonth() === month.getMonth();
    const isToday = ymd === todayYMD();
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const shown = items.slice(0, 3);

    return (
        <button onClick={() => onSelect(ymd)} aria-pressed={selected} aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${items.length} items`}
            className={`group relative flex min-h-[62px] flex-col gap-1 border-t border-l border-line-soft p-1.5 text-left transition-colors sm:min-h-[108px] sm:p-2 ${selected ? "bg-accent/[0.07]" : "hover:bg-white/[0.03]"} ${inMonth ? (weekend ? "bg-white/[0.01]" : "") : "bg-black/20"}`}>
            {selected && <span className="pointer-events-none absolute inset-0 border border-accent/50" />}
            <span className={`flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 text-[13.5px] tabular-nums ${isToday ? "bg-accent font-bold text-primary-ink" : inMonth ? "font-medium text-zinc-200" : "text-faint/50"}`}>
                {day.getDate()}
            </span>
            {/* Desktop: labelled pills. Mobile: dots. */}
            <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                {shown.map((item) => <ItemPill key={item.key} item={item} />)}
                {items.length > 3 && <span className="px-1.5 text-[12.5px] font-medium text-muted group-hover:text-accent">+{items.length - 3} more</span>}
            </div>
            <div className="flex flex-wrap gap-0.5 sm:hidden">
                {items.slice(0, 4).map((item) => <span key={item.key} className={`h-1.5 w-1.5 rounded-full ${KIND[item.kind]?.dot || (item.overdue ? "bg-danger" : "bg-zinc-400")}`} />)}
            </div>
        </button>
    );
}

// Seven columns, one per day, each listing everything on that day.
function WeekView({ days, byDay, selected, onSelect }) {
    return (
        <div className="grid grid-cols-1 divide-y divide-line-soft border-t border-line-soft md:grid-cols-7 md:divide-x md:divide-y-0">
            {days.map((day) => {
                const ymd = toYMD(day);
                const items = byDay.get(ymd) || [];
                const isToday = ymd === todayYMD();
                const on = ymd === selected;
                return (
                    <button key={ymd} onClick={() => onSelect(ymd)} aria-pressed={on}
                        className={`flex min-h-[72px] flex-col gap-1.5 p-2 text-left transition-colors md:min-h-[420px] ${on ? "bg-accent/[0.06]" : "hover:bg-white/[0.02]"}`}>
                        <span className="flex items-center gap-2 md:flex-col md:items-start md:gap-0.5">
                            <span className={`text-[12.5px] font-semibold uppercase ${isToday ? "text-accent" : "text-faint"}`}>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                            <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[15px] font-semibold tabular-nums ${isToday ? "bg-accent text-primary-ink" : "text-zinc-100"}`}>{day.getDate()}</span>
                        </span>
                        <span className="flex min-w-0 flex-col gap-1 self-stretch">
                            {items.map((item) => <ItemPill key={item.key} item={item} />)}
                            {!items.length && <span className="hidden text-[12.5px] text-faint/60 md:block">Nothing</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

const mondayOf = (date) => addDays(date, -((date.getDay() + 6) % 7));

export default function Calendar() {
    const toast = useToast();
    const tasksApi = useApi("/tasks");
    const projectsApi = useApi("/projects");
    const meetingsApi = useApi("/meetings");
    const googleStatus = useApi("/google/status");
    const [googleEvents, setGoogleEvents] = useState([]);
    const [params, setParams] = useSearchParams();
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [selected, setSelected] = useState(todayYMD());
    const [scope, setScope] = useState("mine");
    const [mode, setModeState] = useState(() => { try { return localStorage.getItem("collabos_calendar_view") || "month"; } catch { return "month"; } });
    const setMode = (value) => { setModeState(value); try { localStorage.setItem("collabos_calendar_view", value); } catch { /* storage unavailable */ } };
    const [showProjects, setShowProjects] = useState(true);
    const [alerts, setAlerts] = useState(desktopAlertsEnabled());

    const allTasks = tasksApi.data?.tasks || [];
    const tasks = useMemo(() => allTasks.filter((t) => t.dueDate && (scope === "all" || t.isMine)), [allTasks, scope]);
    const projects = useMemo(() => (projectsApi.data?.projects || []).filter((p) => p.dueDate && showProjects), [projectsApi.data, showProjects]);
    const meetings = meetingsApi.data?.meetings || [];

    // Back from Google's consent screen: ?google=connected or ?google_error=…
    useEffect(() => {
        if (params.get("google") === "connected") toast.success("Google Calendar connected", "Click “Sync my tasks” to add your current deadlines.");
        if (params.get("google_error")) toast.error("Google Calendar", params.get("google_error"));
        if (params.get("google") || params.get("google_error")) setParams({}, { replace: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Google events for the visible month (plus a week either side).
    const connected = googleStatus.data?.connected;
    useEffect(() => {
        if (!connected) return setGoogleEvents([]);
        const from = addDays(startOfMonth(month), -7);
        const to = addDays(addMonths(startOfMonth(month), 1), 7);
        api(`/google/events?from=${from.toISOString()}&to=${to.toISOString()}`)
            .then((d) => setGoogleEvents(d.events.filter((e) => !e.collabos)))
            .catch(() => setGoogleEvents([]));
    }, [connected, month]);

    // Everything with a date, grouped by "YYYY-MM-DD".
    const byDay = useMemo(() => {
        const map = new Map();
        const add = (ymd, item) => map.set(ymd, [...(map.get(ymd) || []), item]);
        meetings.forEach((m) => add(toYMD(new Date(m.startsAt)), { key: `m-${m._id}`, kind: "meeting", title: `${timeOf(m.startsAt)} ${m.title}` }));
        projects.forEach((p) => add(dueYMD(p.dueDate), { key: `p-${p._id}`, kind: "project", title: p.name }));
        googleEvents.forEach((e) => add(e.allDay ? e.start.slice(0, 10) : toYMD(new Date(e.start)), { key: `g-${e.id}`, kind: "google", title: e.allDay ? e.title : `${timeOf(e.start)} ${e.title}` }));
        tasks.forEach((t) => {
            const ymd = dueYMD(t.dueDate);
            add(ymd, { key: t._id, kind: "task", title: t.title, priority: t.priority, done: t.status === "completed", overdue: t.status !== "completed" && daysFromToday(ymd) < 0 });
        });
        return map;
    }, [tasks, projects, meetings, googleEvents]);

    useLiveReload(() => { tasksApi.reload(); projectsApi.reload(); });

    if ((tasksApi.loading && !tasksApi.data) || (projectsApi.loading && !projectsApi.data)) return <PageSkeleton />;

    const pending = tasks.filter((t) => t.status !== "completed");
    const overdue = pending.filter((t) => daysFromToday(dueYMD(t.dueDate)) < 0);
    const dueToday = pending.filter((t) => daysFromToday(dueYMD(t.dueDate)) === 0);
    const thisWeek = pending.filter((t) => { const d = daysFromToday(dueYMD(t.dueDate)); return d >= 0 && d < 7; });
    const dayTasks = tasks.filter((t) => dueYMD(t.dueDate) === selected);
    const dayProjects = projects.filter((p) => dueYMD(p.dueDate) === selected);
    const dayMeetings = meetings.filter((m) => toYMD(new Date(m.startsAt)) === selected);
    const dayGoogle = googleEvents.filter((e) => (e.allDay ? e.start.slice(0, 10) : toYMD(new Date(e.start))) === selected);
    const dayCount = dayTasks.length + dayProjects.length + dayMeetings.length + dayGoogle.length;

    // The next two weeks: task deadlines, project deadlines and meetings together.
    const within = (ymd) => { const d = daysFromToday(ymd); return d >= 1 && d <= 14; };
    const upcoming = [
        ...pending.filter((t) => within(dueYMD(t.dueDate))).map((t) => ({ key: t._id, ymd: dueYMD(t.dueDate), title: t.title, detail: t.project?.name, kind: "task", priority: t.priority })),
        ...projects.filter((p) => within(dueYMD(p.dueDate))).map((p) => ({ key: `p-${p._id}`, ymd: dueYMD(p.dueDate), title: p.name, detail: "Project deadline", kind: "project" })),
        ...meetings.filter((m) => m.status !== "ended" && within(toYMD(new Date(m.startsAt)))).map((m) => ({ key: `m-${m._id}`, ymd: toYMD(new Date(m.startsAt)), title: m.title, detail: `${timeOf(m.startsAt)} · ${m.durationMinutes} min meeting`, kind: "meeting" }))
    ].sort((a, b) => a.ymd.localeCompare(b.ymd));

    const toggleAlerts = async (on) => {
        if (on) {
            const granted = await enableDesktopAlerts();
            setAlerts(granted);
            if (granted) toast.success("Desktop alerts on", "You'll get a pop-up when a task is due soon or overdue.");
            else toast.error("Alerts blocked", "Allow notifications for this site in your browser settings.");
        } else {
            disableDesktopAlerts();
            setAlerts(false);
        }
    };

    const reload = () => { tasksApi.reload(); projectsApi.reload(); };
    const select = (ymd) => { setSelected(ymd); setMonth(startOfMonth(parseYMD(ymd))); };
    const selectedDate = parseYMD(selected);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(selectedDate), i));
    const step = (direction) => {
        if (mode === "week") select(toYMD(addDays(selectedDate, direction * 7)));
        else setMonth(addMonths(month, direction));
    };
    const heading = mode === "week"
        ? `${weekDays[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
        : monthLabel(month);
    const offset = daysFromToday(selected);

    return (
        <>
            <PageHeader title="Calendar" subtitle="Deadlines, meetings and project milestones in one place. You're reminded the day before a task is due, and again if it slips.">
                <button onClick={() => exportIcs(tasks.filter((t) => t.status !== "completed"), projects)} className="btn-secondary" title="Download an .ics file for Outlook, Apple Calendar or Google Calendar">
                    <Icon name="ios_share" className="text-[17px]" />Export calendar
                </button>
            </PageHeader>

            <section className="mt-6 stats">
                <StatCard label="Overdue" value={overdue.length} icon="error" tone="danger" hint={overdue.length ? "Needs attention" : "Nothing is late"} />
                <StatCard label="Due today" value={dueToday.length} icon="today" tone="warning" hint={dueToday[0]?.title || "Nothing due today"} />
                <StatCard label="Next 7 days" value={thisWeek.length} icon="date_range" tone="primary" hint={`${upcoming.length} items in the next two weeks`} />
                <article className="card flex items-center gap-3.5 p-4">
                    <span className={`tile ${alerts ? "tile-green" : ""}`}><Icon name={alerts ? "notifications_active" : "notifications_off"} className="text-[20px]" /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-muted">Desktop alerts</p>
                        <p className={`mt-1 text-[16px] leading-none font-semibold ${alerts ? "text-success" : "text-ink"}`}>{alerts ? "On" : "Off"}</p>
                        <p className="mt-1.5 truncate text-[13px] text-faint">{desktopAlertsSupported() ? "Pop-ups for due and overdue tasks" : "Not supported in this browser"}</p>
                    </div>
                    <Toggle checked={alerts} onChange={toggleAlerts} label="Desktop alerts" />
                </article>
            </section>

            <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
                <section className="card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5 sm:px-4">
                        <div className="flex items-center rounded-lg border border-line">
                            <button onClick={() => step(-1)} className="btn-icon rounded-r-none" aria-label={mode === "week" ? "Previous week" : "Previous month"}><Icon name="chevron_left" /></button>
                            <button onClick={() => { setMonth(startOfMonth(new Date())); setSelected(todayYMD()); }} className="h-8 border-x border-line px-3 text-[14px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.05]">Today</button>
                            <button onClick={() => step(1)} className="btn-icon rounded-l-none" aria-label={mode === "week" ? "Next week" : "Next month"}><Icon name="chevron_right" /></button>
                        </div>
                        <h2 className="ml-1 text-[18px] font-semibold text-ink" aria-live="polite">{heading}</h2>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <label className="flex h-8 items-center gap-2 rounded-lg px-1.5 text-[14px] text-muted">
                                <Toggle checked={showProjects} onChange={setShowProjects} label="Show project deadlines" />Projects
                            </label>
                            <div className="w-36"><Segmented value={scope} onChange={setScope} ariaLabel="Whose tasks" options={[{ value: "mine", label: "Mine" }, { value: "all", label: "All" }]} /></div>
                            <div className="w-40"><Segmented value={mode} onChange={setMode} ariaLabel="Calendar view" options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }]} /></div>
                        </div>
                    </div>

                    {mode === "week" ? <WeekView days={weekDays} byDay={byDay} selected={selected} onSelect={select} /> : (
                        <div className="grid grid-cols-7 border-r border-b border-line-soft">
                            {WEEKDAYS.map((d, i) => <div key={d} className={`border-l border-line-soft px-2 py-2 text-[12.5px] font-semibold tracking-wide uppercase ${i > 4 ? "text-faint/70" : "text-faint"}`}>{d}</div>)}
                            {monthGrid(month).map((day) => (
                                <DayCell key={toYMD(day)} day={day} month={month} items={byDay.get(toYMD(day)) || []} selected={toYMD(day) === selected} onSelect={setSelected} />
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line-soft px-4 py-2.5 text-[13px] text-faint">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-zinc-500" />Task</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger" />Overdue task</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />Meeting</span>
                        {showProjects && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success" />Project deadline</span>}
                        {connected && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-steel" />Google Calendar</span>}
                    </div>
                </section>

                <aside className="min-w-0 space-y-4" aria-label="Selected day and upcoming">
                    <section className="card">
                        <div className="flex items-center gap-3.5 border-b border-line-soft p-4">
                            <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${offset === 0 ? "border-accent/40 bg-accent/10" : "border-line bg-inset"}`}>
                                <span className={`text-[11.5px] font-semibold uppercase ${offset === 0 ? "text-accent" : "text-faint"}`}>{selectedDate.toLocaleDateString(undefined, { month: "short" })}</span>
                                <span className="text-[18px] leading-none font-semibold text-ink tabular-nums">{selectedDate.getDate()}</span>
                            </span>
                            <div className="min-w-0">
                                <h3 className="truncate text-[15px] font-semibold text-ink">{selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
                                <p className="text-[14px] text-muted">{offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset === -1 ? "Yesterday" : `${Math.abs(offset)} days ${offset < 0 ? "ago" : "from now"}`} · {dayCount} {dayCount === 1 ? "item" : "items"}</p>
                            </div>
                        </div>
                        <div className="rows px-4 py-1">
                            {dayMeetings.map((m) => (
                                <Link key={m._id} to={`/meet/${m.roomId}`} className="row-bleed group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/[0.03]">
                                    <span className="tile tile-teal h-8 w-8"><Icon name="videocam" className="text-[17px]" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14.5px] font-medium text-zinc-100">{m.title}</p>
                                        <p className="text-[13.5px] text-faint">{timeOf(m.startsAt)} · {m.durationMinutes} min meeting</p>
                                    </div>
                                    <Icon name="chevron_right" className="text-[18px] text-faint group-hover:text-accent" />
                                </Link>
                            ))}
                            {dayProjects.map((p) => (
                                <Link key={p._id} to={`/projects/${p._id}`} className="row-bleed group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/[0.03]">
                                    <span className="tile tile-green h-8 w-8"><Icon name="flag" className="text-[17px]" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14.5px] font-medium text-zinc-100">{p.name}</p>
                                        <p className="text-[13.5px] text-faint">Project deadline</p>
                                    </div>
                                    <Icon name="chevron_right" className="text-[18px] text-faint group-hover:text-accent" />
                                </Link>
                            ))}
                            {dayGoogle.map((e) => (
                                <a key={e.id} href={e.link} target="_blank" rel="noreferrer" className="row-bleed group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/[0.03]">
                                    <span className="tile tile-steel h-8 w-8"><Icon name="event" className="text-[17px]" /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[14.5px] font-medium text-zinc-100">{e.title}</p>
                                        <p className="text-[13.5px] text-faint">{e.allDay ? "All day" : timeOf(e.start)} · Google Calendar</p>
                                    </div>
                                    <Icon name="open_in_new" className="text-[16px] text-faint group-hover:text-accent" />
                                </a>
                            ))}
                            {dayTasks.map((t) => <TaskCard key={t._id} task={t} onChanged={reload} />)}
                            {!dayCount && <Empty compact icon="event_available" title="Nothing scheduled">Pick another day, or enjoy the free time.</Empty>}
                        </div>
                    </section>

                    {overdue.length > 0 && (
                        <Panel title="Overdue" icon="error" bodyClassName="px-4 py-1" action={<Badge tone="red">{overdue.length}</Badge>}>
                            <div className="rows">{overdue.map((t) => <TaskCard key={t._id} task={t} onChanged={reload} />)}</div>
                        </Panel>
                    )}

                    <Panel title="Coming up" icon="event_upcoming" description="The next two weeks" bodyClassName="p-2">
                        {upcoming.length ? (
                            <ul>
                                {upcoming.map((item) => {
                                    const date = parseYMD(item.ymd);
                                    const kind = KIND[item.kind];
                                    return (
                                        <li key={item.key}>
                                            <button onClick={() => select(item.ymd)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.04]">
                                                <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-line bg-inset py-1">
                                                    <span className="text-[11.5px] font-semibold text-faint uppercase">{date.toLocaleDateString(undefined, { month: "short" })}</span>
                                                    <span className="text-[15px] leading-tight font-semibold text-ink tabular-nums">{date.getDate()}</span>
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[14.5px] text-zinc-100">{item.title}</span>
                                                    <span className="block truncate text-[13.5px] text-faint">{item.detail}</span>
                                                </span>
                                                {kind ? <Icon name={kind.icon} className={`text-[16px] ${item.kind === "meeting" ? "text-accent" : "text-success"}`} /> : <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY[item.priority]?.dot}`} title={`${PRIORITY[item.priority]?.label} priority`} />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : <p className="px-2 py-4 text-center text-[14.5px] text-muted">Nothing in the next two weeks.</p>}
                    </Panel>

                    <GoogleCalendarPanel status={googleStatus.data} onChange={googleStatus.reload} />
                </aside>
            </div>
        </>
    );
}
