import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useApi from "../utils/useApi";
import { useToast } from "../context/ToastContext";
import TaskCard from "../components/TaskCard";
import { Empty, Icon, PageHeader, PageSkeleton, Panel, PRIORITY, Segmented, StatCard, Toggle } from "../components/ui";
import { WEEKDAYS, addDays, addMonths, daysFromToday, dueYMD, monthGrid, monthLabel, parseYMD, startOfMonth, toYMD, todayYMD } from "../utils/dates";
import { desktopAlertsEnabled, desktopAlertsSupported, disableDesktopAlerts, enableDesktopAlerts } from "../utils/desktopAlerts";

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

function DayCell({ day, month, items, selected, onSelect }) {
    const ymd = toYMD(day);
    const inMonth = day.getMonth() === month.getMonth();
    const isToday = ymd === todayYMD();
    const shown = items.slice(0, 3);

    return (
        <button
            onClick={() => onSelect(ymd)}
            className={`group relative flex min-h-[64px] flex-col gap-1 border-t border-l border-line-soft p-1.5 text-left transition sm:min-h-[112px] sm:p-2 ${selected ? "bg-primary/[0.07]" : "hover:bg-white/[0.02]"} ${inMonth ? "" : "bg-black/20"}`}
        >
            {selected && <span className="pointer-events-none absolute inset-0 ring-1 ring-primary/50 ring-inset" />}
            <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[12px] tabular-nums ${isToday ? "bg-primary font-semibold text-primary-ink" : inMonth ? "text-zinc-300" : "text-faint/50"}`}>
                {day.getDate()}
            </span>
            {/* Desktop: pills. Mobile: dots. */}
            <div className="hidden min-w-0 flex-col gap-1 sm:flex">
                {shown.map((item) => (
                    <span key={item.key} className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${item.kind === "project" ? "bg-accent/10 text-accent" : item.done ? "bg-white/[0.03] text-faint line-through" : item.overdue ? "bg-danger/10 text-danger" : "bg-white/[0.05] text-zinc-300"}`}>
                        {item.kind === "project" ? <Icon name="flag" className="text-[12px]" fill /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY[item.priority]?.dot || "bg-faint"}`} />}
                        <span className="truncate">{item.title}</span>
                    </span>
                ))}
                {items.length > 3 && <span className="px-1.5 text-[11px] text-faint">+{items.length - 3} more</span>}
            </div>
            <div className="flex flex-wrap gap-0.5 sm:hidden">
                {items.slice(0, 4).map((item) => <span key={item.key} className={`h-1.5 w-1.5 rounded-full ${item.kind === "project" ? "bg-accent" : item.overdue ? "bg-danger" : "bg-primary"}`} />)}
            </div>
        </button>
    );
}

export default function Calendar() {
    const toast = useToast();
    const tasksApi = useApi("/tasks");
    const projectsApi = useApi("/projects");
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [selected, setSelected] = useState(todayYMD());
    const [scope, setScope] = useState("mine");
    const [showProjects, setShowProjects] = useState(true);
    const [alerts, setAlerts] = useState(desktopAlertsEnabled());

    const allTasks = tasksApi.data?.tasks || [];
    const tasks = useMemo(() => allTasks.filter((t) => t.dueDate && (scope === "all" || t.isMine)), [allTasks, scope]);
    const projects = useMemo(() => (projectsApi.data?.projects || []).filter((p) => p.dueDate && showProjects), [projectsApi.data, showProjects]);

    // Everything with a date, grouped by "YYYY-MM-DD".
    const byDay = useMemo(() => {
        const map = new Map();
        const add = (ymd, item) => map.set(ymd, [...(map.get(ymd) || []), item]);
        tasks.forEach((t) => {
            const ymd = dueYMD(t.dueDate);
            add(ymd, { key: t._id, kind: "task", title: t.title, priority: t.priority, done: t.status === "completed", overdue: t.status !== "completed" && daysFromToday(ymd) < 0 });
        });
        projects.forEach((p) => add(dueYMD(p.dueDate), { key: `p-${p._id}`, kind: "project", title: p.name }));
        return map;
    }, [tasks, projects]);

    if (tasksApi.loading || projectsApi.loading) return <PageSkeleton />;

    const pending = tasks.filter((t) => t.status !== "completed");
    const overdue = pending.filter((t) => daysFromToday(dueYMD(t.dueDate)) < 0);
    const dueToday = pending.filter((t) => daysFromToday(dueYMD(t.dueDate)) === 0);
    const thisWeek = pending.filter((t) => { const d = daysFromToday(dueYMD(t.dueDate)); return d >= 0 && d < 7; });
    const dayTasks = tasks.filter((t) => dueYMD(t.dueDate) === selected);
    const dayProjects = projects.filter((p) => dueYMD(p.dueDate) === selected);
    const upcoming = pending.filter((t) => { const d = daysFromToday(dueYMD(t.dueDate)); return d >= 1 && d <= 14; })
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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
    const selectedLabel = parseYMD(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    return (
        <>
            <PageHeader eyebrow="Schedule" title="My Calendar" subtitle="Your deadlines at a glance. You'll be alerted the day before a task is due, and again if it slips.">
                <button onClick={() => exportIcs(tasks.filter((t) => t.status !== "completed"), projects)} className="btn-secondary">
                    <Icon name="ios_share" className="text-[18px]" />Export .ics
                </button>
            </PageHeader>

            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Overdue" value={overdue.length} icon="running_with_errors" tone="danger" hint={overdue.length ? "Needs attention" : "Nothing late"} />
                <StatCard label="Due today" value={dueToday.length} icon="today" tone="warning" />
                <StatCard label="Next 7 days" value={thisWeek.length} icon="date_range" tone="accent" />
                <article className="card flex flex-col justify-between gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[13px] font-medium text-muted">Desktop alerts</p>
                            <p className="mt-1 text-xs text-faint">{desktopAlertsSupported() ? "Pop-ups for due & overdue tasks" : "Not supported in this browser"}</p>
                        </div>
                        <Toggle checked={alerts} onChange={toggleAlerts} label="Desktop alerts" />
                    </div>
                    <p className={`flex items-center gap-1.5 text-xs ${alerts ? "text-success" : "text-faint"}`}>
                        <Icon name={alerts ? "notifications_active" : "notifications_off"} className="text-base" />{alerts ? "On for this browser" : "Off"}
                    </p>
                </article>
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
                <section className="card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
                        <div className="flex items-center gap-1">
                            <button onClick={() => setMonth(addMonths(month, -1))} className="btn-icon" aria-label="Previous month"><Icon name="chevron_left" /></button>
                            <button onClick={() => setMonth(addMonths(month, 1))} className="btn-icon" aria-label="Next month"><Icon name="chevron_right" /></button>
                        </div>
                        <h2 className="text-lg font-semibold tracking-tight text-white">{monthLabel(month)}</h2>
                        <button onClick={() => { setMonth(startOfMonth(new Date())); setSelected(todayYMD()); }} className="btn-secondary btn-sm">Today</button>
                        <div className="ml-auto flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-[13px] text-muted">
                                <Toggle checked={showProjects} onChange={setShowProjects} label="Show project deadlines" />Projects
                            </label>
                            <div className="w-48">
                                <Segmented value={scope} onChange={setScope} ariaLabel="Whose tasks" options={[{ value: "mine", label: "Mine" }, { value: "all", label: "All I see" }]} />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 border-r border-b border-line-soft">
                        {WEEKDAYS.map((d) => <div key={d} className="border-l border-line-soft px-2 py-2 font-mono text-[10px] uppercase tracking-widest text-faint">{d}</div>)}
                        {monthGrid(month).map((day) => (
                            <DayCell key={toYMD(day)} day={day} month={month} items={byDay.get(toYMD(day)) || []} selected={toYMD(day) === selected} onSelect={setSelected} />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-faint">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-danger" />High</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />Medium</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Low</span>
                        <span className="flex items-center gap-1.5"><Icon name="flag" className="text-[13px] text-accent" fill />Project deadline</span>
                    </div>
                </section>

                <div className="space-y-6">
                    <Panel title={selectedLabel} description={selected === todayYMD() ? "Today" : `${Math.abs(daysFromToday(selected))} days ${daysFromToday(selected) < 0 ? "ago" : "from now"}`}>
                        <div className="space-y-2.5">
                            {dayProjects.map((p) => (
                                <Link key={p._id} to={`/projects/${p._id}`} className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-3 transition hover:border-accent/50">
                                    <Icon name="flag" className="text-accent" fill />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-white">{p.name}</p>
                                        <p className="text-xs text-muted">Project deadline</p>
                                    </div>
                                </Link>
                            ))}
                            {dayTasks.map((t) => <TaskCard key={t._id} task={t} onChanged={reload} />)}
                            {!dayTasks.length && !dayProjects.length && <Empty icon="event_available" title="Nothing due">Enjoy the free time, or pick another day.</Empty>}
                        </div>
                    </Panel>

                    {overdue.length > 0 && (
                        <Panel title="Overdue" description="These have passed their due date.">
                            <div className="space-y-2.5">{overdue.map((t) => <TaskCard key={t._id} task={t} onChanged={reload} />)}</div>
                        </Panel>
                    )}

                    <Panel title="Coming up" description="Next two weeks">
                        {upcoming.length ? (
                            <ul className="space-y-1">
                                {upcoming.map((t) => {
                                    const ymd = dueYMD(t.dueDate);
                                    const date = parseYMD(ymd);
                                    return (
                                        <li key={t._id}>
                                            <button onClick={() => { setMonth(startOfMonth(date)); setSelected(ymd); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[0.04]">
                                                <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-line bg-inset py-1">
                                                    <span className="font-mono text-[9px] uppercase text-faint">{date.toLocaleDateString(undefined, { month: "short" })}</span>
                                                    <span className="font-mono text-sm font-semibold text-white">{date.getDate()}</span>
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm text-zinc-200">{t.title}</span>
                                                    <span className="block truncate text-xs text-faint">{t.project?.name}</span>
                                                </span>
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY[t.priority]?.dot}`} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : <p className="text-sm text-muted">Nothing due in the next two weeks.</p>}
                    </Panel>
                </div>
            </div>
        </>
    );
}
