import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { TaskForm } from "../components/ProjectForms";
import { Empty, ErrorText, Icon, Input, Modal, PageHeader, PageSkeleton, Segmented, Select, StatCard, Toggle } from "../components/ui";
import { daysFromToday, dueYMD } from "../utils/dates";

// Buckets tasks by urgency.
const GROUPS = [
    { key: "overdue", label: "Overdue", icon: "running_with_errors", tone: "text-danger" },
    { key: "today", label: "Today", icon: "today", tone: "text-warning" },
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
    const [search, setSearch] = useState("");
    const [scope, setScope] = useState("mine");
    const [project, setProject] = useState("all");
    const [showDone, setShowDone] = useState(false);
    const adding = params.get("new") === "1";
    const setAdding = (open) => setParams(open ? { new: "1" } : {});

    if (tasks.loading) return <PageSkeleton />;

    const list = tasks.data?.tasks || [];
    const projectList = projects.data?.projects || [];
    const mine = list.filter((t) => t.isMine);
    const query = search.trim().toLowerCase();

    const filtered = list.filter((t) => {
        const text = [t.title, t.description, t.project?.name, t.assignee?.fullName].join(" ").toLowerCase();
        const scopeMatch = scope === "all" || (scope === "mine" && t.isMine) || (scope === "assigned" && t.assignedBy?._id === user._id && !t.isMine);
        return text.includes(query) && scopeMatch && (project === "all" || t.project?._id === project);
    });

    const grouped = GROUPS.map((g) => ({ ...g, tasks: filtered.filter((t) => groupOf(t) === g.key) }))
        .filter((g) => g.tasks.length && (g.key !== "done" || showDone));
    const doneCount = filtered.filter((t) => t.status === "completed").length;

    return (
        <>
            <PageHeader eyebrow="Workspace" title="Tasks"
                subtitle={can("tasks.manage_all") ? "Every task in your organization." : "Tasks assigned to you, by you, and in projects you lead."}>
                {can("tasks.assign") && <button onClick={() => setAdding(true)} className="btn-primary"><Icon name="add" className="text-[18px]" />Add task</button>}
            </PageHeader>
            <ErrorText>{tasks.error}</ErrorText>

            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Assigned to you" value={mine.length} icon="person" tone="primary" />
                <StatCard label="Open" value={mine.filter((t) => t.status !== "completed").length} icon="pending_actions" tone="accent" />
                <StatCard label="Overdue" value={mine.filter((t) => groupOf(t) === "overdue").length} icon="running_with_errors" tone="danger" />
                <StatCard label="Completed" value={mine.filter((t) => t.status === "completed").length} icon="task_alt" tone="success" />
            </section>

            <section className="card mt-6 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
                <div className="flex-1"><Input icon="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks, projects or people" aria-label="Search tasks" /></div>
                <div className="lg:w-80">
                    <Segmented value={scope} onChange={setScope} ariaLabel="Whose tasks" options={[{ value: "mine", label: "Mine" }, { value: "assigned", label: "Delegated" }, { value: "all", label: "All" }]} />
                </div>
                <div className="lg:w-56">
                    <Select value={project} onChange={setProject} ariaLabel="Filter by project"
                        options={[{ value: "all", label: "All projects", icon: "folder_open" }, ...projectList.map((p) => ({ value: p._id, label: p.name, icon: "folder" }))]} />
                </div>
                <label className="flex items-center gap-2 px-1 text-[13px] whitespace-nowrap text-muted">
                    <Toggle checked={showDone} onChange={setShowDone} label="Show completed" />Completed ({doneCount})
                </label>
            </section>

            <div className="mt-6 space-y-8">
                {grouped.length ? grouped.map((g) => (
                    <section key={g.key}>
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
                            <Icon name={g.icon} className={`text-[18px] ${g.tone}`} />{g.label}
                            <span className="rounded-md bg-white/[0.06] px-1.5 font-mono text-[11px] text-muted">{g.tasks.length}</span>
                        </h2>
                        <div className="grid gap-2.5 2xl:grid-cols-2">{g.tasks.map((t) => <TaskCard key={t._id} task={t} onChanged={tasks.reload} />)}</div>
                    </section>
                )) : (
                    <Empty icon="checklist" title={list.length ? "No matching tasks" : "No tasks yet"}
                        action={can("tasks.assign") && !list.length && <button onClick={() => setAdding(true)} className="btn-primary btn-sm">Add the first task</button>}>
                        {list.length ? (doneCount && !showDone ? "Only completed tasks match. Turn on “Completed” to see them." : "Try a different search or filter.") : "Tasks will appear here once they're assigned."}
                    </Empty>
                )}
            </div>

            <Modal open={adding} onClose={() => setAdding(false)} title="Add a task" description="Assign work to people in one of your projects." size="max-w-xl">
                <TaskForm projects={projectList.filter((p) => p.isMember || p.canManage)} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); tasks.reload(); }} />
            </Modal>
        </>
    );
}
