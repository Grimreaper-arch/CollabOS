import { useState } from "react";
import useApi from "../utils/useApi";
import { Avatar, Badge, Empty, ErrorText, Icon, PageHeader, PageSkeleton, Panel, Ring, Segmented, StatCard } from "../components/ui";
import { askAssistant } from "../components/AssistantPanel";

const TEAL = "#36c6b5";
const GREEN = "#43c982";
const STEEL = "#5f7686";
const AMBER = "#e2ac4d";
const RED = "#f0736c";

const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Legend({ items }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {items.map(([color, label]) => <span key={label} className="flex items-center gap-1.5 text-[13.5px] text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}</span>)}
        </div>
    );
}

// Tasks created (steel) and completed (teal) per week, as paired bars with a hover read-out.
function TrendChart({ weeks }) {
    const [hover, setHover] = useState(null);
    const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]));
    const top = Math.ceil(max / 2) * 2 || 2;
    const H = 180;
    const ticks = [0, top / 2, top];
    const active = hover !== null ? weeks[hover] : null;

    if (!weeks.some((w) => w.created || w.completed)) return <Empty compact icon="show_chart" title="Not enough data yet">Create and complete a few tasks to see the weekly trend.</Empty>;

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Legend items={[[STEEL, "Created"], [TEAL, "Completed"]]} />
                <p className="text-[13.5px] text-muted tabular-nums" aria-live="polite">
                    {active ? <><span className="font-medium text-zinc-100">{shortDate(new Date(new Date(active.from).getTime() + 1))} – {shortDate(active.to)}</span> · {active.created} created · {active.completed} completed</> : "Hover a week for its numbers"}
                </p>
            </div>
            <div className="flex gap-2">
                <div className="flex flex-col justify-between pb-6 text-right text-[12.5px] text-faint tabular-nums" style={{ height: H + 24 }} aria-hidden="true">
                    {[...ticks].reverse().map((t) => <span key={t} className="leading-none">{t}</span>)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="relative" style={{ height: H }}>
                        {ticks.map((t) => <span key={t} className="absolute inset-x-0 border-t border-dashed border-line-soft" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />)}
                        <div className="absolute inset-0 grid grid-cols-8 items-end">
                            {weeks.map((w, i) => (
                                <button key={i} type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                                    aria-label={`Week ending ${shortDate(w.to)}: ${w.created} created, ${w.completed} completed`}
                                    className={`flex h-full cursor-default items-end justify-center gap-1 rounded-md px-1 transition-colors ${hover === i ? "bg-white/[0.04]" : ""}`}>
                                    <span className="w-full max-w-[18px] rounded-t-[4px] transition-[height] duration-500" style={{ height: `${(w.created / top) * 100}%`, minHeight: w.created ? 3 : 0, background: STEEL }} />
                                    <span className="w-full max-w-[18px] rounded-t-[4px] transition-[height] duration-500" style={{ height: `${(w.completed / top) * 100}%`, minHeight: w.completed ? 3 : 0, background: `linear-gradient(180deg, ${GREEN}, ${TEAL})` }} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-2 grid grid-cols-8 text-center text-[12.5px] text-faint">
                        {weeks.map((w, i) => <span key={i} className={hover === i ? "text-zinc-200" : ""}>{i === weeks.length - 1 ? "This week" : shortDate(w.to)}</span>)}
                    </div>
                </div>
            </div>
        </div>
    );
}

const STAGE_META = { todo: ["To do", STEEL], in_progress: ["In progress", TEAL], review: ["In review", AMBER], done: ["Completed", GREEN] };

// One bar split by board column, with the numbers underneath.
function StageBar({ stages }) {
    const total = stages.reduce((sum, s) => sum + s.total, 0);
    if (!total) return <Empty compact icon="view_kanban">No tasks on the board yet.</Empty>;
    return (
        <div>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={stages.map((s) => `${STAGE_META[s.stage][0]}: ${s.total}`).join(", ")}>
                {stages.filter((s) => s.total).map((s) => <span key={s.stage} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.total / total) * 100}%`, background: STAGE_META[s.stage][1] }} title={`${STAGE_META[s.stage][0]}: ${s.total}`} />)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
                {stages.map((s) => (
                    <div key={s.stage} className="rounded-lg border border-line bg-inset px-3 py-2.5">
                        <dt className="flex items-center gap-1.5 text-[13.5px] text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: STAGE_META[s.stage][1] }} />{STAGE_META[s.stage][0]}</dt>
                        <dd className="mt-1 flex items-baseline gap-1.5"><span className="text-[21px] leading-none font-semibold text-ink tabular-nums">{s.total}</span><span className="text-[13px] text-faint tabular-nums">{Math.round((s.total / total) * 100)}%</span></dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

const PRIORITY_META = { high: ["High", RED], medium: ["Medium", AMBER], low: ["Low", STEEL] };

function PriorityMix({ priorities }) {
    const total = priorities.reduce((s, p) => s + p.total, 0);
    if (!total) return <Empty compact icon="flag">No tasks yet.</Empty>;
    return (
        <div className="space-y-4">
            {priorities.map((p) => {
                const [label, color] = PRIORITY_META[p.label];
                return (
                    <div key={p.label}>
                        <div className="mb-1.5 flex items-baseline justify-between text-[14.5px]">
                            <span className="flex items-center gap-2 text-zinc-200"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}</span>
                            <span className="text-[13.5px] text-muted tabular-nums">{p.completed} of {p.total} done · <span className="text-zinc-200">{p.percent}%</span></span>
                        </div>
                        {/* The track is this priority's share of all tasks; the fill is how much of it is done. */}
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]" title={`${label}: ${p.total} tasks, ${p.percent}% done`}>
                            <div className="h-full rounded-full" style={{ width: `${(p.total / total) * 100}%`, background: `${color}40` }}>
                                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${p.percent}%`, background: color }} />
                            </div>
                        </div>
                    </div>
                );
            })}
            <p className="text-[13.5px] text-faint">Bar length shows each priority's share of all {total} tasks.</p>
        </div>
    );
}

// Completion per project, sorted from most to least complete.
function ProjectBars({ rows }) {
    if (!rows.length) return <Empty compact icon="bar_chart">No project tasks yet.</Empty>;
    return (
        <div className="space-y-3.5">
            {[...rows].sort((a, b) => b.percent - a.percent).map((row) => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[180px_minmax(0,1fr)_112px]">
                    <span className="truncate text-[14.5px] text-zinc-200">{row.label}</span>
                    <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-white/[0.06] sm:order-none sm:col-span-1" title={`${row.label}: ${row.completed} of ${row.total} done`}>
                        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${row.percent}%`, background: row.percent === 100 ? GREEN : `linear-gradient(90deg, ${TEAL}, ${GREEN})` }} />
                    </span>
                    <span className="flex items-center justify-end gap-2 text-[13.5px] tabular-nums">
                        {row.overdue > 0 && <span className="text-danger" title={`${row.overdue} overdue`}>{row.overdue} late</span>}
                        <span className="text-muted">{row.completed}/{row.total}</span>
                        <span className="w-9 text-right font-medium text-zinc-100">{row.percent}%</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

// Each person's tasks as one bar: completed, still open, overdue.
function Workload({ people }) {
    if (!people.length) return <Empty compact icon="group">Assign tasks to see how work is shared.</Empty>;
    const max = Math.max(...people.map((p) => p.total));
    const rows = [...people].sort((a, b) => b.total - a.total);
    return (
        <div>
            <div className="mb-4"><Legend items={[[GREEN, "Completed"], [STEEL, "Open"], [RED, "Overdue"]]} /></div>
            <div className="space-y-3">
                {rows.map((p) => {
                    const overdue = p.overdue || 0;
                    const open = p.total - p.completed - overdue;
                    return (
                        <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[190px_minmax(0,1fr)_120px]">
                            <span className="flex min-w-0 items-center gap-2.5"><Avatar user={{ fullName: p.label }} size="h-6 w-6 text-[10.5px]" /><span className="truncate text-[14.5px] text-zinc-200">{p.label}</span></span>
                            <span className="order-3 col-span-2 flex h-2.5 gap-px sm:order-none sm:col-span-1" style={{ width: `${Math.max(8, (p.total / max) * 100)}%` }} title={`${p.label}: ${p.completed} completed, ${open} open, ${overdue} overdue`}>
                                {[[p.completed, GREEN], [open, STEEL], [overdue, RED]].filter(([n]) => n > 0).map(([n, color], i) => <span key={i} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flex: n, background: color }} />)}
                            </span>
                            <span className="flex items-center justify-end gap-2 text-[13.5px] tabular-nums">
                                <span className="text-muted">{p.total} tasks</span>
                                <span className="w-9 text-right font-medium text-zinc-100">{p.percent}%</span>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function Analytics() {
    const { data, error, loading } = useApi("/analytics");
    const [view, setView] = useState("personal");

    if (loading && !data) return <PageSkeleton />;
    if (!data) return <ErrorText>{error}</ErrorText>;

    const org = data.organization;
    const showOrg = view === "organization" && org;
    const stats = showOrg ? org : data.personal;
    const { overall } = stats;
    const open = overall.total - overall.completed;
    const trend = stats.trend || [];
    const doneLately = trend.slice(-4).reduce((sum, w) => sum + w.completed, 0);
    const doneBefore = trend.slice(0, 4).reduce((sum, w) => sum + w.completed, 0);
    const change = doneLately - doneBefore;
    const range = trend.length ? `${shortDate(new Date(new Date(trend[0].from).getTime() + 1))} – ${shortDate(trend.at(-1).to)}` : "";

    return (
        <>
            <PageHeader title="Analytics"
                subtitle={showOrg ? "Completion, workload and deadlines across the whole organization, calculated live from your tasks." : "Your own workload, completion rate and deadlines, calculated live from your tasks."}>
                <button onClick={() => askAssistant(showOrg ? "Look at the organization's task analytics: who is overloaded, which projects are at risk, and what should we do about it?" : "Look at my tasks and tell me how I'm doing: what's overdue, what's at risk, and what I should focus on this week.")} className="btn-secondary"><Icon name="auto_awesome" fill className="text-[16px] text-accent" />Explain these numbers</button>
                {org && <div className="w-64"><Segmented value={view} onChange={setView} ariaLabel="Analytics view" options={[{ value: "personal", label: "Me", icon: "person" }, { value: "organization", label: "Organization", icon: "apartment" }]} /></div>}
            </PageHeader>

            <section className="mt-6 stats">
                {showOrg ? (
                    <>
                        <StatCard label="Completion rate" value={`${overall.percent}%`} icon="donut_large" tone="success" hint={`${overall.completed} of ${overall.total} tasks done`} percent={overall.percent} />
                        <StatCard label="Projects" value={org.projectCount} icon="folder" tone="primary" hint={`${stats.projects.length} with tasks`} />
                        <StatCard label="People" value={org.memberCount} icon="group" tone="steel" hint={`${org.people.length} with assigned work`} />
                        <StatCard label="Overdue tasks" value={org.overdue} icon="error" tone="danger" hint={org.overdue ? "Across the organization" : "Nothing is late"} />
                    </>
                ) : (
                    <>
                        <StatCard label="Completion rate" value={`${overall.percent}%`} icon="donut_large" tone="success" hint={`${overall.completed} of ${overall.total} tasks done`} percent={overall.percent} />
                        <StatCard label="Open tasks" value={open} icon="pending_actions" tone="primary" hint={`${stats.dueThisWeek ?? 0} due in the next 7 days`} />
                        <StatCard label="Completed, last 4 weeks" value={doneLately} icon="task_alt" tone="steel" hint={change === 0 ? "Same as the 4 weeks before" : `${change > 0 ? "+" : ""}${change} vs the 4 weeks before`} />
                        <StatCard label="Overdue" value={stats.overdue} icon="error" tone="danger" hint={stats.overdue ? "Past their due date" : "Nothing is late"} />
                    </>
                )}
            </section>

            <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Panel title="Tasks created and completed" icon="show_chart" description="Per week, for the last 8 weeks" action={range && <Badge icon="date_range">{range}</Badge>}>
                    <TrendChart weeks={trend} />
                </Panel>

                <Panel title="Overall progress" icon="donut_large">
                    <div className="flex items-center gap-5">
                        <Ring percent={overall.percent} size={120} stroke={11} tone="success">
                            <span className="text-center"><span className="block text-[26px] leading-none font-semibold text-ink tabular-nums">{overall.percent}%</span><span className="text-[12.5px] text-faint">complete</span></span>
                        </Ring>
                        <dl className="flex-1 space-y-2.5">
                            {[["Completed", overall.completed, GREEN], ["Open", open - stats.overdue, STEEL], ["Overdue", stats.overdue, RED]].map(([label, value, color]) => (
                                <div key={label} className="flex items-center justify-between text-[14.5px]">
                                    <dt className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}</dt>
                                    <dd className="font-semibold text-zinc-100 tabular-nums">{Math.max(0, value)}</dd>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-t border-line-soft pt-2.5 text-[14.5px]"><dt className="text-muted">Total</dt><dd className="font-semibold text-zinc-100 tabular-nums">{overall.total}</dd></div>
                        </dl>
                    </div>
                </Panel>
            </section>

            <section className="mt-4 grid items-start gap-4 lg:grid-cols-2">
                <Panel title="Where work stands" icon="view_kanban" description="Tasks by board column"><StageBar stages={stats.stages || []} /></Panel>
                <Panel title="Priority mix" icon="signal_cellular_alt" description="How work is split by priority, and how much is done"><PriorityMix priorities={stats.priorities} /></Panel>
            </section>

            <Panel title="Progress by project" icon="folder" description={showOrg ? "Every project with tasks, most complete first" : "Your tasks in each project, most complete first"} className="mt-4">
                <ProjectBars rows={stats.projects} />
            </Panel>

            {showOrg && (
                <Panel title="Team workload" icon="group" description="How many tasks each person has, and how many are done, open or overdue" className="mt-4">
                    <Workload people={org.people} />
                </Panel>
            )}
        </>
    );
}
