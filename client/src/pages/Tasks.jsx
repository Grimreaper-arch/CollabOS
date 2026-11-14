import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { TaskForm } from "../components/ProjectForms";
import { Empty, ErrorText, Icon, Input, Modal, PageHeader, PageSkeleton, Segmented, Select, StatCard, Toggle } from "../components/ui";
import { daysFromToday, dueYMD } from "../utils/dates";
import { useLiveReload } from "../context/RealtimeContext";
import KanbanBoard from "../components/KanbanBoard";

// Buckets tasks by urgency.
const GROUPS = [
    { key: "overdue", label: "Overdue", icon: "error", tone: "text-danger" },
    { key: "today", label: "Due today", icon: "today", tone: "text-warning" },
    { key: "week", label: "This week", icon: "date_range", tone: "text-accent" },
    { key: "later", label: "Later", icon: "event_upcoming", tone: "text-muted" },
    { key: "none", label: "No due date", icon: "event_busy", tone: "text-faint" },
    { key: "done", label: "Completed", icon: "check_circle", tone: "text-success" }
];

function groupOf(task) {
    if (task.status === "completed") return "done";
    if (!task.dueDate) return "none";
    const d = daysFromToday(dueYMD(task.dueDate));
    if (d < 0) return "overdue";
    if (d === 0) return "today";
    if (d < 7) return "week";
    return "later";
}

export default function Tasks() {
    const { user, can } = useAuth();
    const [params, setParams] = useSearchParams();
    const tasks = useApi("/tasks");
    const projects = useApi("/projects");
    useLiveReload(tasks.reload);
    const [search, setSearch] = useState("");
    const [scope, setScope] = useState("mine");
    const [project, setProject] = useState("all");
    const [showDone, setShowDone] = useState(false);
    const [closed, setClosed] = useState(() => new Set());
    // List or Kanban board, remembered per browser.
    const [view, setViewState] = useState(() => { try { return localStorage.getItem("collabos_tasks_view") || "list"; } catch { return "list"; } });
    const setView = (value) => { setViewState(value); try { localStorage.setItem("collabos_tasks_view", value); } catch { /* storage unavailable */ } };
    const adding = params.get("new") === "1";
    const setAdding = (open) => setParams(open ? { new: "1" } : {});
    const toggleGroup = (key) => setClosed((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

    if (tasks.loading && !tasks.data) return <PageSkeleton />;

    const list = tasks.data?.tasks || [];
    const projectList = projects.data?.projects || [];
    const mine = list.filter((t) => t.isMine);
    const mineOpen = mine.filter((t) => t.status !== "completed");
    const mineDone = mine.length - mineOpen.length;
    const mineOverdue = mine.filter((t) => groupOf(t) === "overdue").length;
    const dueThisWeek = mineOpen.filter((t) => ["today", "week"].includes(groupOf(t))).length;
    const delegated = list.filter((t) => t.assignedBy?._id === user._id && !t.isMine);
    const query = search.trim().toLowerCase();

    const filtered = list.filter((t) => {
        const text = [t.title, t.description, t.project?.name, t.assignee?.fullName].join(" ").toLowerCase();
        const scopeMatch = scope === "all" || (scope === "mine" && t.isMine) || (scope === "assigned" && t.assignedBy?._id === user._id && !t.isMine);
        return text.includes(query) && scopeMatch && (project === "all" || t.project?._id === project);
    });

    const grouped = GROUPS.map((g) => ({ ...g, tasks: filtered.filter((t) => groupOf(t) === g.key) }))
        .filter((g) => g.tasks.length && (g.key !== "done" || showDone));
    const doneCount = filtered.filter((t) => t.status === "completed").length;
    const filtering = Boolean(query) || project !== "all";

    return (
        <>
            <PageHeader title="Tasks"
                subtitle={can("tasks.manage_all") ? "Every task in your organization. Click a task to see its details and comments." : "Work assigned to you, by you, and in projects you lead. Click a task to see its details and comments."}>
                {can("tasks.assign") && <button onClick={() => setAdding(true)} className="btn-primary"><Icon name="add" className="text-[18px]" />New task</button>}
            </PageHeader>
            <ErrorText>{tasks.error}</ErrorText>

            <section className="mt-6 stats">
                <StatCard label="Assigned to you" value={mine.length} icon="assignment_ind" tone="primary"
                    hint={mine.length ? `${Math.round((mineDone / mine.length) * 100)}% completed` : "Nothing assigned yet"}
                    percent={mine.length ? (mineDone / mine.length) * 100 : undefined} />
                <StatCard label="Open" value={mineOpen.length} icon="pending_actions" tone="steel" hint={dueThisWeek ? `${dueThisWeek} due this week` : "Nothing due this week"} />
                <StatCard label="Overdue" value={mineOverdue} icon="error" tone="danger" hint={mineOverdue ? "Past their due date" : "Nothing is late"} />
                <StatCard label="Completed" value={mineDone} icon="task_alt" tone="success" hint={delegated.length ? `You've delegated ${delegated.length}` : "By you, so far"} />
            </section>

            <section className="card mt-6 flex flex-col gap-2 p-2 xl:flex-row xl:items-center" aria-label="Find tasks">
                <div className="min-w-0 flex-1"><Input icon="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks, projects or people" aria-label="Search tasks" className="border-transparent bg-transparent hover:border-transparent" /></div>
                <span className="hidden h-6 w-px bg-line xl:block" aria-hidden="true" />
                <div className="xl:w-[270px]">
                    <Segmented value={scope} onChange={setScope} ariaLabel="Whose tasks" options={[{ value: "mine", label: "Mine" }, { value: "assigned", label: "Delegated" }, { value: "all", label: "All" }]} />
                </div>
                <div className="xl:w-52">
                    <Select value={project} onChange={setProject} ariaLabel="Filter by project"
                        options={[{ value: "all", label: "All projects", icon: "folder_open" }, ...projectList.map((p) => ({ value: p._id, label: p.name, icon: "folder" }))]} />
                </div>
                <label className={`flex h-9 items-center gap-2 rounded-lg px-2 text-[14.5px] whitespace-nowrap transition-opacity ${view === "list" ? "text-muted" : "pointer-events-none opacity-40"}`} title={view === "list" ? "" : "The board always shows the Completed column"}>
                    <Toggle checked={showDone} onChange={setShowDone} label="Show completed" />Completed <span className="text-faint tabular-nums">{doneCount}</span>
                </label>
                <div className="xl:w-44">
                    <Segmented value={view} onChange={setView} ariaLabel="View" options={[{ value: "list", label: "List", icon: "view_list" }, { value: "board", label: "Board", icon: "view_kanban" }]} />
                </div>
            </section>

            {view === "board" ? (
                <div className="mt-4"><KanbanBoard tasks={filtered} onChanged={tasks.reload} showProject /></div>
            ) : (
                <div className="mt-4 space-y-4">
                    {grouped.length ? grouped.map((g) => {
                        const isClosed = closed.has(g.key);
                        return (
                            <section key={g.key} className="card overflow-hidden">
                                <button onClick={() => toggleGroup(g.key)} aria-expanded={!isClosed}
                                    className="flex w-full items-center gap-2 border-b border-line-soft bg-white/[0.015] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]">
                                    <Icon name={g.icon} className={`text-[17px] ${g.tone}`} />
                                    <h2 className="text-[14.5px] font-semibold text-zinc-100">{g.label}</h2>
                                    <span className="rounded-full bg-white/[0.06] px-1.5 text-[12.5px] font-medium text-muted tabular-nums">{g.tasks.length}</span>
                                    <Icon name={isClosed ? "chevron_right" : "expand_more"} className="ml-auto text-[20px] text-faint" />
                                </button>
                                {!isClosed && (
                                    <>
                                        <div className="hidden items-center gap-4 border-b border-line-soft py-1.5 pr-[125px] pl-[46px] text-[12.5px] font-medium text-faint xl:flex">
                                            <span className="flex-1">Task</span><span className="hidden w-36 2xl:block">Project</span><span className="w-[104px]">Status</span><span className="w-[72px]">Priority</span><span className="w-24">Due</span>
                                        </div>
                                        <div className="divide-y divide-line-soft px-4">{g.tasks.map((t) => <TaskCard key={t._id} task={t} onChanged={tasks.reload} />)}</div>
                                    </>
                                )}
                            </section>
                        );
                    }) : (
                        <div className="card">
                            <Empty icon={list.length ? "filter_list_off" : "checklist"} title={!list.length ? "No tasks yet" : scope === "mine" && !mine.length && !filtering ? "Nothing is assigned to you" : "No tasks match"}
                                action={list.length
                                    ? (scope === "mine" && !mine.length && !filtering ? <button onClick={() => setScope("all")} className="btn-secondary btn-sm">Show all tasks</button> : doneCount && !showDone
                                        ? <button onClick={() => setShowDone(true)} className="btn-secondary btn-sm">Show completed</button>
                                        : filtering && <button onClick={() => { setSearch(""); setProject("all"); }} className="btn-secondary btn-sm">Clear filters</button>)
                                    : can("tasks.assign") && <button onClick={() => setAdding(true)} className="btn-primary"><Icon name="add" className="text-[18px]" />Add the first task</button>}>
                                {list.length ? (scope === "mine" && !mine.length && !filtering ? "You can still see tasks you delegated and tasks in projects you manage." : doneCount && !showDone ? "Everything here is already completed." : scope === "assigned" ? "You haven't delegated anything that matches." : "Try a different search, project or scope.")
                                    : "Tasks appear here as soon as they're assigned."}
                            </Empty>
                        </div>
                    )}
                </div>
            )}

            <Modal open={adding} onClose={() => setAdding(false)} title="New task" description="Assign work to people in one of your projects." size="max-w-xl">
                <TaskForm projects={projectList.filter((p) => p.isMember || p.canManage)} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); tasks.reload(); }} />
            </Modal>
        </>
    );
}
