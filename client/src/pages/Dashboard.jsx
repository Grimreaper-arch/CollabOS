import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { ProjectForm, TaskForm } from "../components/ProjectForms";
import { Avatar, AvatarStack, Empty, ErrorText, Icon, Modal, PageHeader, PageSkeleton, Panel, ProgressBar, StatCard } from "../components/ui";
import { timeAgo } from "../utils/format";
import { addDays, daysFromToday, dueYMD, toYMD } from "../utils/dates";

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

// Seven-day strip showing how many of my tasks are due each day.
function WeekStrip({ tasks }) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
    return (
        <div className="grid grid-cols-7 gap-1.5">
            {days.map((day, i) => {
                const ymd = toYMD(day);
                const count = tasks.filter((t) => dueYMD(t.dueDate) === ymd).length;
                return (
                    <Link key={ymd} to="/calendar" className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 transition hover:border-primary/40 ${i === 0 ? "border-primary/40 bg-primary/[0.08]" : "border-line bg-inset"}`}>
                        <span className="font-mono text-[10px] uppercase text-faint">{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                        <span className={`font-mono text-base font-semibold ${i === 0 ? "text-primary" : "text-white"}`}>{day.getDate()}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${count ? (count > 1 ? "bg-warning" : "bg-accent") : "bg-transparent"}`} title={`${count} due`} />
                    </Link>
                );
            })}
        </div>
    );
}

function ProjectTile({ project }) {
    const percent = project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
    return (
        <Link to={`/projects/${project._id}`} className="group rounded-xl border border-line bg-inset p-4 transition hover:-translate-y-0.5 hover:border-[#33333c]">
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-accent/10 font-semibold text-primary">{project.name[0]}</span>
                {project.isLead && <span className="chip border-primary/30 text-primary">Lead</span>}
            </div>
            <p className="mt-3 truncate font-medium text-white">{project.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{project.description || "No description"}</p>
            <div className="mt-4 flex items-center justify-between text-xs text-faint">
                <span className="font-mono">{percent}%</span>
                <span>{project.completedCount}/{project.taskCount} tasks</span>
            </div>
            <div className="mt-1.5"><ProgressBar percent={percent} /></div>
            <div className="mt-4"><AvatarStack users={[project.owner, ...project.members]} /></div>
        </Link>
    );
}

export default function Dashboard() {
    const { user, can } = useAuth();
    const navigate = useNavigate();
    const projects = useApi("/projects");
    const tasks = useApi("/tasks");
    const activity = useApi("/activity?limit=8");
    const [modal, setModal] = useState(null); // "project" | "task" | null

    const reloadAll = () => { projects.reload(); tasks.reload(); activity.reload(); };

    if (projects.loading || tasks.loading) return <PageSkeleton />;

    const projectList = projects.data?.projects || [];
    const allTasks = tasks.data?.tasks || [];
    const myTasks = allTasks.filter((t) => t.isMine);
    const myPending = myTasks.filter((t) => t.status !== "completed");
    const rate = myTasks.length ? Math.round(((myTasks.length - myPending.length) / myTasks.length) * 100) : 0;
    const dueThisWeek = myPending.filter((t) => { const d = t.dueDate && daysFromToday(dueYMD(t.dueDate)); return t.dueDate && d >= 0 && d < 7; }).length;
    const overdue = myPending.filter((t) => t.dueDate && daysFromToday(dueYMD(t.dueDate)) < 0).length;
    // Most urgent first: overdue, then by due date, undated last.
    const focus = [...myPending].sort((a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity)).slice(0, 5);
    const delegated = allTasks.filter((t) => !t.isMine && t.assignedBy?._id === user._id).slice(0, 4);
    const assignable = projectList.filter((p) => p.isMember || p.canManage);
    const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

    return (
        <>
            <PageHeader eyebrow={today} title={`${greeting()}, ${user.fullName.split(" ")[0]}`}
                subtitle={myPending.length ? `You have ${myPending.length} open task${myPending.length === 1 ? "" : "s"}${overdue ? `, ${overdue} overdue` : ""}.` : "You're all caught up."}>
                {can("projects.create") && <button onClick={() => setModal("project")} className="btn-secondary"><Icon name="create_new_folder" className="text-[18px]" />New project</button>}
                {can("tasks.assign") && <button onClick={() => setModal("task")} className="btn-primary"><Icon name="add" className="text-[18px]" />Add task</button>}
            </PageHeader>
            <ErrorText>{projects.error || tasks.error}</ErrorText>

            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Open tasks" value={myPending.length} icon="pending_actions" tone="primary" hint={`${myTasks.length} assigned in total`} />
                <StatCard label="Due this week" value={dueThisWeek} icon="date_range" tone="accent" />
                <StatCard label="Overdue" value={overdue} icon="running_with_errors" tone={overdue ? "danger" : "default"} hint={overdue ? "Check your calendar" : "Nothing late"} />
                <StatCard label="Completion" value={`${rate}%`} icon="donut_large" tone="success" hint="Of your assigned tasks" />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
                <Panel title="Focus" description="Your most urgent open tasks" action={<Link to="/tasks" className="btn-ghost btn-sm">View all<Icon name="arrow_forward" className="text-base" /></Link>}>
                    <div className="space-y-2.5">
                        {focus.length ? focus.map((t) => <TaskCard key={t._id} task={t} onChanged={reloadAll} />)
                            : <Empty icon="task_alt" title={myTasks.length ? "All done!" : "No tasks yet"}>{myTasks.length ? "Every task assigned to you is complete." : "Tasks assigned to you will show up here."}</Empty>}
                    </div>
                </Panel>

                <div className="space-y-6">
                    <Panel title="This week" action={<Link to="/calendar" className="btn-ghost btn-sm">Calendar<Icon name="arrow_forward" className="text-base" /></Link>}>
                        <WeekStrip tasks={myPending} />
                    </Panel>

                    {can("tasks.assign") && (
                        <Panel title="Delegate work" description="Recently assigned by you">
                            <div className="space-y-2">
                                {delegated.length ? delegated.map((t) => (
                                    <div key={t._id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                                        <Avatar user={t.assignee} size="h-7 w-7 text-[10px]" />
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-[13px] ${t.status === "completed" ? "text-faint line-through" : "text-zinc-200"}`}>{t.title}</p>
                                            <p className="truncate text-xs text-faint">{t.assignee?.fullName}</p>
                                        </div>
                                        <Icon name={t.status === "completed" ? "check_circle" : "schedule"} className={`text-[18px] ${t.status === "completed" ? "text-success" : "text-faint"}`} fill={t.status === "completed"} />
                                    </div>
                                )) : <p className="text-[13px] text-muted">You haven't assigned anything yet.</p>}
                            </div>
                            <button onClick={() => setModal("task")} className="btn-secondary mt-4 w-full"><Icon name="add_task" className="text-[18px]" />Assign a task</button>
                        </Panel>
                    )}
                </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
                <Panel title="Projects" action={<Link to="/projects" className="btn-ghost btn-sm">All projects<Icon name="arrow_forward" className="text-base" /></Link>}>
                    {projectList.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{projectList.slice(0, 6).map((p) => <ProjectTile key={p._id} project={p} />)}</div>
                    ) : (
                        <Empty icon="folder_open" title="No projects yet" action={can("projects.create") && <button onClick={() => setModal("project")} className="btn-primary btn-sm">Create a project</button>}>
                            {can("projects.create") ? "Create your first project to get started." : "You'll see projects here once someone adds you to one."}
                        </Empty>
                    )}
                </Panel>

                <Panel title="Activity">
                    {activity.data?.activity.length ? (
                        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
                            {activity.data.activity.map((a) => (
                                <li key={a._id} className="relative flex gap-3 pl-0">
                                    <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-panel bg-primary" />
                                    <div className="min-w-0">
                                        <p className="text-[13px] text-zinc-300">{a.text}</p>
                                        <p className="mt-0.5 text-[11px] text-faint">{a.project?.name} · {timeAgo(a.createdAt)}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : <Empty icon="history">Project activity will appear here.</Empty>}
                </Panel>
            </section>

            <Modal open={modal === "project"} onClose={() => setModal(null)} title="New project" description="You'll be the project lead.">
                <ProjectForm onCancel={() => setModal(null)} onSaved={(p) => { setModal(null); navigate(`/projects/${p._id}`); }} />
            </Modal>
            <Modal open={modal === "task"} onClose={() => setModal(null)} title="Add a task" description="Assign work to people in one of your projects." size="max-w-xl">
                <TaskForm projects={assignable} onCancel={() => setModal(null)} onDone={() => { setModal(null); reloadAll(); }} />
            </Modal>
        </>
    );
}
