import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { ProjectForm, TaskForm } from "../components/ProjectForms";
import { ProjectMark, projectHealth, projectPercent } from "../components/ProjectCard";
import { Avatar, AvatarStack, Badge, Empty, ErrorText, Icon, Modal, PageSkeleton, Panel, ProgressBar, Ring, Segmented, StatCard } from "../components/ui";
import { plural, timeAgo } from "../utils/format";
import { addDays, daysFromToday, dueYMD, parseYMD, toYMD, todayYMD } from "../utils/dates";
import { useLiveReload } from "../context/RealtimeContext";
import { askAssistant } from "../components/AssistantPanel";

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const timeOf = (date) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const byDue = (a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity);

// Seven days starting today, with a bar showing how much is due each day.
function WeekStrip({ tasks, meetings }) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
    const counts = days.map((day) => {
        const ymd = toYMD(day);
        return tasks.filter((t) => dueYMD(t.dueDate) === ymd).length + meetings.filter((m) => toYMD(new Date(m.startsAt)) === ymd).length;
    });
    const max = Math.max(1, ...counts);
    return (
        <div className="grid grid-cols-7 gap-1">
            {days.map((day, i) => (
                <Link key={i} to="/calendar" title={`${plural(counts[i], "item")} on ${day.toLocaleDateString(undefined, { weekday: "long" })}`}
                    className={`group flex flex-col items-center gap-1.5 rounded-lg border py-2 transition-colors ${i === 0 ? "border-accent/30 bg-accent/[0.07]" : "border-transparent hover:border-line hover:bg-white/[0.03]"}`}>
                    <span className={`text-[12px] font-medium uppercase ${i === 0 ? "text-accent" : "text-faint"}`}>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${i === 0 ? "text-white" : "text-zinc-200"}`}>{day.getDate()}</span>
                    <span className="flex h-5 w-1.5 items-end rounded-full bg-white/[0.06]" aria-hidden="true">
                        <span className={`w-full rounded-full ${i === 0 ? "bg-accent" : "bg-steel"}`} style={{ height: `${(counts[i] / max) * 100}%` }} />
                    </span>
                </Link>
            ))}
        </div>
    );
}

// A project as a compact clickable tile: mark, status, progress.
function ProjectTile({ project }) {
    const percent = projectPercent(project);
    const health = projectHealth(project);
    return (
        <Link to={`/projects/${project._id}`} className="card-link group flex flex-col p-3.5" aria-label={`Open project ${project.name}`}>
            <div className="flex items-start gap-3">
                <ProjectMark project={project} size="h-9 w-9 text-[15px]" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">{project.name}</p>
                    <p className="truncate text-[13.5px] text-faint">Updated {timeAgo(project.lastActivityAt || project.updatedAt)}</p>
                </div>
                <Icon name="arrow_outward" className="text-[17px] text-faint transition-colors group-hover:text-accent" />
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-2">
                <Badge tone={health.tone} dot>{health.label}</Badge>
                <AvatarStack users={[project.owner, ...project.members].filter(Boolean)} max={3} size="h-5 w-5 text-[9.5px]" />
            </div>
            <div className="mt-3 flex items-center gap-2.5">
                <div className="flex-1"><ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : undefined} className="h-1" /></div>
                <span className="text-[13px] font-medium text-zinc-300 tabular-nums">{percent}%</span>
            </div>
        </Link>
    );
}

const SCHEDULE_KINDS = {
    meeting: { icon: "videocam", tile: "tile-teal" },
    task: { icon: "task_alt", tile: "" },
    project: { icon: "flag", tile: "tile-green" }
};

export default function Dashboard() {
    const { user, organization, role, can } = useAuth();
    const navigate = useNavigate();
    const projects = useApi("/projects");
    const tasks = useApi("/tasks");
    const activity = useApi("/activity?limit=8");
    const meetingsApi = useApi("/meetings");
    const org = useApi("/org");
    const [modal, setModal] = useState(null); // "project" | "task" | null
    const [work, setWork] = useState("next");

    const reloadAll = () => { projects.reload(); tasks.reload(); activity.reload(); };
    useLiveReload(reloadAll);

    if ((projects.loading && !projects.data) || (tasks.loading && !tasks.data)) return <PageSkeleton />;

    const projectList = projects.data?.projects || [];
    const allTasks = tasks.data?.tasks || [];
    const myTasks = allTasks.filter((t) => t.isMine);
    const myPending = myTasks.filter((t) => t.status !== "completed");
    const myDone = myTasks.filter((t) => t.status === "completed");
    const rate = myTasks.length ? Math.round((myDone.length / myTasks.length) * 100) : 0;
    const overdueTasks = myPending.filter((t) => t.dueDate && daysFromToday(dueYMD(t.dueDate)) < 0).sort(byDue);
    const dueThisWeek = myPending.filter((t) => { const d = t.dueDate && daysFromToday(dueYMD(t.dueDate)); return t.dueDate && d >= 0 && d < 7; });
    const recentlyDone = [...myDone].sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt)).slice(0, 6);
    const delegated = allTasks.filter((t) => !t.isMine && t.assignedBy?._id === user._id).slice(0, 4);
    const assignable = projectList.filter((p) => p.isMember || p.canManage);
    const activeProjects = projectList.filter((p) => !(p.taskCount > 0 && p.completedCount === p.taskCount));
    const recentProjects = [...projectList].sort((a, b) => new Date(b.lastActivityAt || b.updatedAt) - new Date(a.lastActivityAt || a.updatedAt)).slice(0, 4);
    const now = Date.now();
    const meetings = (meetingsApi.data?.meetings || []).filter((m) => m.status !== "ended" && new Date(m.endsAt) > now);
    const weekMeetings = meetings.filter((m) => new Date(m.startsAt) - now < 7 * 864e5);

    // The next week as one timeline: meetings, my task deadlines and project deadlines.
    const today = todayYMD();
    const schedule = [
        ...weekMeetings.map((m) => ({ key: `m-${m._id}`, kind: "meeting", ymd: toYMD(new Date(m.startsAt)), at: new Date(m.startsAt).getTime(), title: m.title, detail: `${timeOf(m.startsAt)} · ${m.durationMinutes} min`, to: `/meet/${m.roomId}`, live: m.live > 0 })),
        ...dueThisWeek.map((t) => ({ key: `t-${t._id}`, kind: "task", ymd: dueYMD(t.dueDate), at: parseYMD(dueYMD(t.dueDate)).getTime() + 864e5 - 1, title: t.title, detail: `Task due · ${t.project?.name || ""}`, to: "/tasks" })),
        ...projectList.filter((p) => { const d = p.dueDate && daysFromToday(dueYMD(p.dueDate)); return p.dueDate && d >= 0 && d < 7; })
            .map((p) => ({ key: `p-${p._id}`, kind: "project", ymd: dueYMD(p.dueDate), at: parseYMD(dueYMD(p.dueDate)).getTime() + 864e5 - 1, title: p.name, detail: "Project deadline", to: `/projects/${p._id}` }))
    ].sort((a, b) => a.at - b.at).slice(0, 7);
    const dayName = (ymd) => { const d = daysFromToday(ymd); return d === 0 ? "Today" : d === 1 ? "Tomorrow" : parseYMD(ymd).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }); };

    const workLists = {
        next: { tasks: [...myPending].sort(byDue).slice(0, 6), empty: [myTasks.length ? "All done" : "No tasks yet", myTasks.length ? "Every task assigned to you is complete." : "Tasks assigned to you will show up here."] },
        overdue: { tasks: overdueTasks.slice(0, 6), empty: ["Nothing overdue", "You're on top of every deadline."] },
        done: { tasks: recentlyDone, empty: ["Nothing completed yet", "Tasks you finish will be listed here."] }
    };
    const current = workLists[work];
    const dateLine = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const firstName = user.fullName.split(" ")[0];

    return (
        <>
            {/* Welcome */}
            <section className="card relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0" aria-hidden="true"
                    style={{ background: "radial-gradient(520px 220px at 100% 0%, rgb(54 198 181 / 0.16), transparent 70%), radial-gradient(420px 200px at 62% 120%, rgb(67 201 130 / 0.08), transparent 70%)" }} />
                <svg className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[46%] opacity-[0.22] md:block" aria-hidden="true" style={{ maskImage: "linear-gradient(90deg, transparent, black 60%)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 60%)" }}>
                    <defs><pattern id="home-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#36c6b5" strokeWidth="0.8" /></pattern></defs>
                    <rect width="100%" height="100%" fill="url(#home-grid)" />
                </svg>
                <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
                            <span className="font-medium text-accent">{organization.name}</span>
                            <span className="text-faint">·</span>{dateLine}
                            <span className="text-faint">·</span>{role?.name}
                        </p>
                        <h1 className="mt-2 text-[28px] leading-tight font-semibold text-ink">{greeting()}, {firstName}</h1>
                        <p className="mt-1.5 text-[15px] text-muted">
                            {myPending.length
                                ? <>You have <span className="font-medium text-zinc-100">{plural(myPending.length, "open task")}</span>{overdueTasks.length > 0 && <>, <span className="font-medium text-danger">{overdueTasks.length} overdue</span></>}{weekMeetings.length > 0 && <> and <span className="font-medium text-zinc-100">{plural(weekMeetings.length, "meeting")}</span> this week</>}.</>
                                : "You're all caught up. Nothing is waiting on you."}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {can("tasks.assign") && <button onClick={() => setModal("task")} className="btn-primary"><Icon name="add" className="text-[18px]" />New task</button>}
                            {can("projects.create") && <button onClick={() => setModal("project")} className="btn-secondary"><Icon name="create_new_folder" className="text-[17px]" />New project</button>}
                            <Link to="/meetings" className="btn-secondary"><Icon name="videocam" className="text-[17px]" />Meetings</Link>
                            <button onClick={() => askAssistant("Give me my daily brief: what's overdue, what's due today and this week, my meetings today, and what I should do first.")} className="btn-secondary border-accent/30 text-zinc-100 hover:border-accent/50"><Icon name="auto_awesome" fill className="text-[16px] text-accent" />Daily brief</button>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 rounded-xl border border-line bg-page/50 p-4 backdrop-blur-sm">
                        <Ring percent={rate} size={76} stroke={7} tone="success">
                            <span className="text-[18px] font-semibold text-ink tabular-nums">{rate}%</span>
                        </Ring>
                        <div>
                            <p className="text-[14px] text-muted">Your completion</p>
                            <p className="mt-0.5 text-[16px] font-semibold text-ink tabular-nums">{myDone.length} <span className="font-normal text-faint">of {myTasks.length} tasks</span></p>
                            <Link to="/analytics" className="mt-1 inline-flex items-center gap-0.5 text-[13.5px] text-accent hover:underline">View analytics<Icon name="chevron_right" className="text-[15px]" /></Link>
                        </div>
                    </div>
                </div>
            </section>
            <div className="mt-3"><ErrorText>{projects.error || tasks.error}</ErrorText></div>

            {/* Workspace overview */}
            <section className="mt-4 stats" aria-label="Workspace overview">
                <StatCard label="Active projects" value={activeProjects.length} icon="folder" tone="primary" hint={`${projectList.length} in total`} onClick={() => navigate("/projects")} />
                <StatCard label="Your open tasks" value={myPending.length} icon="pending_actions" tone="steel" hint={overdueTasks.length ? `${overdueTasks.length} overdue` : "Nothing overdue"} onClick={() => navigate("/tasks")} />
                <StatCard label="Due in 7 days" value={dueThisWeek.length} icon="event_upcoming" tone="warning" hint={weekMeetings.length ? `Plus ${plural(weekMeetings.length, "meeting")}` : "No meetings this week"} onClick={() => navigate("/calendar")} />
                <StatCard label="Team members" value={org.data?.counts.members ?? "–"} icon="group" tone="success" hint={org.data ? `${plural(org.data.counts.roles, "role")} in ${organization.name}` : " "} onClick={() => navigate("/organization")} />
            </section>

            <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-4">
                    {/* My work */}
                    <Panel title="My work" icon="task_alt" bodyClassName="px-4 py-1"
                        action={(
                            <>
                                <div className="hidden w-[300px] sm:block">
                                    <Segmented value={work} onChange={setWork} ariaLabel="Which tasks"
                                        options={[{ value: "next", label: "Up next" }, { value: "overdue", label: `Overdue ${overdueTasks.length || ""}`.trim() }, { value: "done", label: "Completed" }]} />
                                </div>
                                <Link to="/tasks" className="btn-ghost btn-sm">All tasks</Link>
                            </>
                        )}>
                        <div className="py-2 sm:hidden">
                            <Segmented value={work} onChange={setWork} ariaLabel="Which tasks" options={[{ value: "next", label: "Up next" }, { value: "overdue", label: "Overdue" }, { value: "done", label: "Completed" }]} />
                        </div>
                        <div className="rows">
                            {current.tasks.length ? current.tasks.map((t) => <TaskCard key={t._id} task={t} onChanged={reloadAll} />)
                                : <Empty compact icon={work === "overdue" ? "sentiment_satisfied" : "task_alt"} title={current.empty[0]}>{current.empty[1]}</Empty>}
                        </div>
                    </Panel>

                    {/* Projects */}
                    <section>
                        <div className="mb-2.5 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-zinc-100"><Icon name="folder" className="text-[18px] text-faint" />Recently updated projects</h2>
                            <Link to="/projects" className="btn-ghost btn-sm">All projects<Icon name="chevron_right" className="text-[16px]" /></Link>
                        </div>
                        {recentProjects.length ? (
                            <div className="grid gap-3 sm:grid-cols-2">{recentProjects.map((p) => <ProjectTile key={p._id} project={p} />)}</div>
                        ) : (
                            <div className="card">
                                <Empty compact icon="create_new_folder" title="No projects yet" action={can("projects.create") && <button onClick={() => setModal("project")} className="btn-primary btn-sm">Create a project</button>}>
                                    {can("projects.create") ? "Create your first project to get started." : "You'll see projects here once someone adds you to one."}
                                </Empty>
                            </div>
                        )}
                    </section>
                </div>

                <div className="min-w-0 space-y-4">
                    {/* Upcoming schedule */}
                    <Panel title="Next 7 days" icon="calendar_today" action={<Link to="/calendar" className="btn-ghost btn-sm">Calendar</Link>}>
                        <WeekStrip tasks={myPending} meetings={weekMeetings} />
                        <div className="mt-4 border-t border-line-soft pt-3">
                            {schedule.length ? (
                                <ol className="space-y-1">
                                    {schedule.map((item, i) => {
                                        const kind = SCHEDULE_KINDS[item.kind];
                                        const newDay = i === 0 || schedule[i - 1].ymd !== item.ymd;
                                        return (
                                            <li key={item.key}>
                                                {newDay && <p className={`eyebrow pb-1 ${i ? "pt-3" : ""} ${item.ymd === today ? "text-accent" : ""}`}>{dayName(item.ymd)}</p>}
                                                <Link to={item.to} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                                                    <span className={`tile h-8 w-8 ${kind.tile}`}><Icon name={kind.icon} className="text-[17px]" /></span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[14.5px] font-medium text-zinc-100 group-hover:text-white">{item.title}</span>
                                                        <span className="block truncate text-[13.5px] text-faint">{item.detail}</span>
                                                    </span>
                                                    {item.live && <Badge tone="red" dot>Live</Badge>}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ol>
                            ) : <p className="py-3 text-center text-[14.5px] text-muted">No meetings or deadlines in the next 7 days.</p>}
                        </div>
                    </Panel>

                    {can("tasks.assign") && (
                        <Panel title="Assigned by you" icon="send" bodyClassName="px-4 py-1.5" action={<button onClick={() => setModal("task")} className="btn-ghost btn-sm">Assign</button>}>
                            <div className="rows">
                                {delegated.length ? delegated.map((t) => (
                                    <div key={t._id} className="flex items-center gap-2.5 py-2">
                                        <Avatar user={t.assignee} size="h-6 w-6 text-[10.5px]" />
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-[14.5px] ${t.status === "completed" ? "text-faint line-through" : "text-zinc-200"}`}>{t.title}</p>
                                            <p className="truncate text-[13.5px] text-faint">{t.assignee?.fullName}</p>
                                        </div>
                                        <Badge tone={t.status === "completed" ? "green" : ""} dot>{t.status === "completed" ? "Done" : "Open"}</Badge>
                                    </div>
                                )) : <p className="py-3 text-center text-[14.5px] text-muted">You haven't assigned anything yet.</p>}
                            </div>
                        </Panel>
                    )}

                    {/* Recent activity */}
                    <Panel title="Recent activity" icon="history">
                        {activity.data?.activity.length ? (
                            <ol className="relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-line">
                                {activity.data.activity.map((a) => (
                                    <li key={a._id} className="relative flex gap-3">
                                        <Avatar user={a.actor} size="h-6 w-6 text-[10.5px] ring-4 ring-panel" />
                                        <div className="min-w-0">
                                            <p className="text-[14.5px] leading-snug text-zinc-300">{a.text}</p>
                                            <p className="mt-0.5 text-[13px] text-faint">
                                                {a.project && <Link to={`/projects/${a.project._id}`} className="hover:text-accent">{a.project.name}</Link>} · {timeAgo(a.createdAt)}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : <Empty compact icon="history">Project updates and task changes will appear here.</Empty>}
                    </Panel>
                </div>
            </section>

            <Modal open={modal === "project"} onClose={() => setModal(null)} title="New project" description="You'll be the project lead.">
                <ProjectForm onCancel={() => setModal(null)} onSaved={(p) => { setModal(null); navigate(`/projects/${p._id}`); }} />
            </Modal>
            <Modal open={modal === "task"} onClose={() => setModal(null)} title="New task" description="Assign work to people in one of your projects." size="max-w-xl">
                <TaskForm projects={assignable} onCancel={() => setModal(null)} onDone={() => { setModal(null); reloadAll(); }} />
            </Modal>
        </>
    );
}
