import { useState } from "react";
import useApi from "../utils/useApi";
import { Avatar, Empty, ErrorText, PageHeader, PageSkeleton, Panel, PRIORITY, Segmented, StatCard } from "../components/ui";

function Bars({ rows, empty, people = false }) {
    if (!rows.length) return <Empty icon="bar_chart">{empty}</Empty>;
    return (
        <div className="space-y-4">
            {rows.map((row, i) => (
                <div key={row.id || row.label} className="flex items-center gap-3">
                    {people && <span className="w-5 text-right font-mono text-xs text-faint">{i + 1}</span>}
                    {people && <Avatar user={{ fullName: row.label }} size="h-7 w-7 text-[10px]" />}
                    <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-4 text-[13px]">
                            <span className="truncate text-zinc-200 capitalize">{row.label}</span>
                            <span className="font-mono text-xs text-muted">{row.completed}/{row.total} · {row.percent}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700" style={{ width: `${row.percent}%` }} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// Donut drawn with a CSS conic-gradient.
function Ring({ percent, done, total, overdue }) {
    return (
        <div className="flex flex-col items-center">
            <div className="relative h-44 w-44 rounded-full p-3" style={{ background: `conic-gradient(var(--color-primary) 0deg, var(--color-accent) ${percent * 3.6}deg, rgba(255,255,255,0.06) ${percent * 3.6}deg)` }}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-panel">
                    <span className="font-mono text-4xl font-semibold tracking-tight text-white">{percent}%</span>
                    <span className="text-xs text-faint">complete</span>
                </div>
            </div>
            <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
                {[["Done", done, "text-success"], ["Open", total - done, "text-accent"], ["Overdue", overdue, "text-danger"]].map(([label, value, tone]) => (
                    <div key={label} className="rounded-xl border border-line bg-inset py-2">
                        <p className={`font-mono text-lg font-semibold ${tone}`}>{value}</p>
                        <p className="text-[11px] text-faint">{label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PriorityMix({ priorities }) {
    const total = priorities.reduce((s, p) => s + p.total, 0);
    if (!total) return <Empty icon="flag">No tasks yet.</Empty>;
    return (
        <div>
            <div className="flex h-3 overflow-hidden rounded-full">
                {priorities.filter((p) => p.total).map((p) => <div key={p.label} className={PRIORITY[p.label].dot} style={{ width: `${(p.total / total) * 100}%` }} title={`${p.label}: ${p.total}`} />)}
            </div>
            <div className="mt-5 space-y-3">
                {priorities.map((p) => (
                    <div key={p.label} className="flex items-center gap-3 text-[13px]">
                        <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY[p.label].dot}`} />
                        <span className="flex-1 text-zinc-200 capitalize">{p.label}</span>
                        <span className="font-mono text-xs text-muted">{p.total} tasks</span>
                        <span className="w-12 text-right font-mono text-xs text-faint">{p.percent}% done</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Analytics() {
    const { data, error, loading } = useApi("/analytics");
    const [view, setView] = useState("personal");

    if (loading) return <PageSkeleton />;
    if (!data) return <ErrorText>{error}</ErrorText>;

    const org = data.organization;
    const showOrg = view === "organization" && org;
    const stats = showOrg ? org : data.personal;

    return (
        <>
            <PageHeader eyebrow="Insights" title={showOrg ? "Organization analytics" : "My analytics"}
                subtitle={showOrg ? "Workload and completion across the whole organization." : "Your workload, completion rate and deadlines."}>
                {org && <div className="w-64"><Segmented value={view} onChange={setView} ariaLabel="Analytics view" options={[{ value: "personal", label: "Me", icon: "person" }, { value: "organization", label: "Organization", icon: "corporate_fare" }]} /></div>}
            </PageHeader>

            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {showOrg ? (
                    <>
                        <StatCard label="Projects" value={org.projectCount} icon="folder_open" tone="primary" />
                        <StatCard label="People" value={org.memberCount} icon="group" tone="accent" />
                        <StatCard label="Completion rate" value={`${org.overall.percent}%`} icon="donut_large" tone="success" />
                        <StatCard label="Overdue tasks" value={org.overdue} icon="running_with_errors" tone="danger" />
                    </>
                ) : (
                    <>
                        <StatCard label="Assigned to you" value={data.personal.overall.total} icon="assignment" tone="primary" />
                        <StatCard label="Completed" value={data.personal.overall.completed} icon="task_alt" tone="success" />
                        <StatCard label="Completion rate" value={`${data.personal.overall.percent}%`} icon="donut_large" tone="accent" />
                        <StatCard label="Overdue" value={data.personal.overdue} icon="running_with_errors" tone="danger" />
                    </>
                )}
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
                <Panel title="Overall progress"><Ring percent={stats.overall.percent} done={stats.overall.completed} total={stats.overall.total} overdue={stats.overdue} /></Panel>
                <div className="grid gap-6">
                    <Panel title="Priority mix" description="How work is split by priority"><PriorityMix priorities={stats.priorities} /></Panel>
                    <Panel title="By project"><Bars rows={stats.projects} empty="No project tasks yet." /></Panel>
                </div>
            </section>

            {showOrg && (
                <Panel title="Leaderboard" description="Completion rate by person" className="mt-6">
                    <Bars rows={org.people} empty="Assign tasks to see progress by person." people />
                </Panel>
            )}
        </>
    );
}
