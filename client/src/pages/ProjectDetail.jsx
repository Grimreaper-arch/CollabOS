import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, downloadFile } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { AddMembersForm, ProjectForm, TaskForm } from "../components/ProjectForms";
import { Avatar, AvatarStack, Badge, DueChip, Empty, ErrorText, Icon, Modal, PageSkeleton, Panel, ProgressBar, Spinner, Tabs } from "../components/ui";
import { ProjectCover, ProjectMark, projectHealth } from "../components/ProjectCard";
import { useCrumb } from "../components/AppLayout";
import { formatSize, plural, timeAgo } from "../utils/format";
import { useLiveReload } from "../context/RealtimeContext";
import KanbanBoard from "../components/KanbanBoard";
import { askAssistant } from "../components/AssistantPanel";

const FILE_ICONS = { "application/pdf": ["picture_as_pdf", "tile-red"], image: ["image", "tile-teal"] };
const fileIcon = (mime) => FILE_ICONS[mime] || (mime.startsWith("image/") ? FILE_ICONS.image : ["description", "tile-steel"]);

function FilesTab({ project }) {
    const { can } = useAuth();
    const toast = useToast();
    const { data, error, reload } = useApi(`/projects/${project._id}/files`);
    useLiveReload(reload, project._id);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const input = useRef(null);

    const upload = async (file) => {
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        setBusy(true);
        try {
            await api(`/projects/${project._id}/files`, { method: "POST", form });
            toast.success("File uploaded", file.name);
            reload();
        } catch (e) {
            toast.error("Upload failed", e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (file) => {
        if (!confirm(`Delete ${file.originalName}?`)) return;
        try {
            await api(`/files/${file._id}`, { method: "DELETE" });
            toast.success("File deleted", file.originalName);
            reload();
        } catch (e) {
            toast.error("Couldn't delete", e.message);
        }
    };

    const files = data?.files || [];

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <Panel title="Files" icon="folder" description={plural(files.length, "file")} bodyClassName="px-4 py-1.5">
                <ErrorText>{error}</ErrorText>
                <div className="rows">
                    {files.length ? files.map((f) => {
                        const [icon, tone] = fileIcon(f.mimeType);
                        return (
                            <div key={f._id} className="group flex items-center gap-3 py-2.5">
                                <span className={`tile ${tone}`}><Icon name={icon} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-medium text-zinc-100">{f.originalName}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-faint">
                                        <span className="tabular-nums">{formatSize(f.size)}</span>·<span>{f.uploadedBy?.fullName}</span>·<span>{timeAgo(f.createdAt)}</span>
                                        {f.task && <Badge tone="teal" icon="assignment_turned_in">Submission · {f.task.title}</Badge>}
                                    </p>
                                </div>
                                <button onClick={() => downloadFile(f._id, f.originalName).catch((e) => toast.error("Download failed", e.message))} className="btn-icon" aria-label={`Download ${f.originalName}`}><Icon name="download" /></button>
                                {f.canDelete && <button onClick={() => remove(f)} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${f.originalName}`}><Icon name="delete" /></button>}
                            </div>
                        );
                    }) : <Empty icon="folder_zip" title="No files yet">Shared documents and task submissions appear here.</Empty>}
                </div>
            </Panel>

            {can("files.upload") ? (
                <button
                    type="button"
                    onClick={() => input.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}
                    className={`flex h-fit min-h-56 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${dragging ? "border-accent bg-accent/[0.07]" : "border-line-strong hover:border-accent/50 hover:bg-accent/[0.03]"}`}
                >
                    <span className="tile tile-teal h-12 w-12 rounded-xl">
                        <Icon name={busy ? "progress_activity" : "cloud_upload"} className={busy ? "animate-spin" : ""} />
                    </span>
                    <p className="mt-4 text-[15px] font-medium text-white">{busy ? "Uploading…" : "Drop a file or click to upload"}</p>
                    <p className="mt-1 text-[13px] text-faint">PDF, Office, images, text, CSV or ZIP</p>
                    <input ref={input} type="file" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
                </button>
            ) : (
                <div className="card h-fit p-5 text-[14.5px] text-muted">
                    <Icon name="info" className="mb-2 text-faint" />
                    <p>Your role can't upload shared files. You can still submit work on your own tasks with the <Icon name="attach_file" className="align-middle text-[17px]" /> button.</p>
                </div>
            )}
        </div>
    );
}

function MembersTab({ project, onChange }) {
    const toast = useToast();
    const remove = async (member) => {
        if (!confirm(`Remove ${member.fullName} from this project?`)) return;
        try {
            await api(`/projects/${project._id}/members/${member._id}`, { method: "DELETE" });
            toast.success("Removed from project", member.fullName);
            onChange();
        } catch (e) {
            toast.error("Couldn't remove", e.message);
        }
    };

    const person = (m, badge) => (
        <div key={m._id} className="flex items-center gap-3 rounded-lg border border-line bg-inset p-3 transition-colors hover:border-line-strong">
            <Avatar user={m} size="h-9 w-9 text-[13px]" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-zinc-100">{m.fullName}</p>
                <p className="truncate text-[13px] text-faint">{m.email}</p>
            </div>
            {badge}
        </div>
    );

    return (
        <div className={`grid gap-6 ${project.canManage ? "xl:grid-cols-[1fr_400px]" : ""}`}>
            <Panel title="People" description={plural(project.members.length + 1, "person", "people")}>
                <div className="grid gap-2.5 md:grid-cols-2">
                    {person(project.owner, <Badge tone="amber" icon="flag">Lead</Badge>)}
                    {project.members.map((m) => person(m, project.canManage && (
                        <button onClick={() => remove(m)} className="btn-icon h-8 w-8 hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${m.fullName}`}><Icon name="person_remove" className="text-[20px]" /></button>
                    )))}
                </div>
            </Panel>
            {project.canManage && (
                <Panel title="Add people" description="Anyone already in your organization." className="h-fit">
                    <AddMembersForm project={project} onDone={onChange} />
                </Panel>
            )}
        </div>
    );
}

// The project's tasks as a drag-and-drop board.
function BoardTab({ project, onChange }) {
    const { can } = useAuth();
    const { data, loading, reload } = useApi(`/tasks?project=${project._id}`);
    useLiveReload(reload, project._id);
    const [adding, setAdding] = useState(false);
    const canAssign = can("tasks.assign") && (project.isMember || project.canManage);
    const refresh = () => { reload(); onChange(); };

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[14.5px] text-muted">Drag a card to move it, or click it for details. Cards with a lock belong to someone else.</p>
                {canAssign && <button onClick={() => setAdding(true)} className="btn-primary btn-sm"><Icon name="add" className="text-[17px]" />Add task</button>}
            </div>
            {loading && !data ? <Spinner /> : <KanbanBoard tasks={data?.tasks || []} onChanged={refresh} />}
            <Modal open={adding} onClose={() => setAdding(false)} title="Add a task" description={`In ${project.name}`} size="max-w-xl">
                <TaskForm projectId={project._id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />
            </Modal>
        </>
    );
}

function TasksTab({ project, onChange }) {
    const { can } = useAuth();
    const { data, loading, reload } = useApi(`/tasks?project=${project._id}`);
    useLiveReload(reload, project._id);
    const [adding, setAdding] = useState(false);
    const refresh = () => { reload(); onChange(); };
    const tasks = data?.tasks || [];
    const open = tasks.filter((t) => t.status !== "completed");
    const done = tasks.filter((t) => t.status === "completed");
    const canAssign = can("tasks.assign") && (project.isMember || project.canManage);

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[14.5px] text-muted">{open.length} open · {done.length} done</p>
                {canAssign && <button onClick={() => setAdding(true)} className="btn-primary btn-sm"><Icon name="add" className="text-[17px]" />Add task</button>}
            </div>
            {loading ? <Spinner /> : tasks.length ? (
                <div className="space-y-8">
                    {[["Open", open], ["Completed", done]].filter(([, list]) => list.length).map(([label, list]) => (
                        <section key={label}>
                            <h3 className="mb-2 flex items-center gap-2 text-[14.5px] font-semibold text-zinc-100">{label}<span className="rounded-full bg-white/[0.06] px-1.5 text-[12.5px] font-medium text-muted tabular-nums">{list.length}</span></h3>
                            <div className="rows-card">{list.map((t) => <TaskCard key={t._id} task={t} onChanged={refresh} showProject={false} />)}</div>
                        </section>
                    ))}
                </div>
            ) : (
                <Empty icon="checklist" title="No tasks yet" action={canAssign && <button onClick={() => setAdding(true)} className="btn-primary btn-sm">Add the first task</button>}>
                    {canAssign ? "Break the project into tasks and assign them." : "No tasks for you in this project yet."}
                </Empty>
            )}
            <Modal open={adding} onClose={() => setAdding(false)} title="Add a task" description={`In ${project.name}`} size="max-w-xl">
                <TaskForm projectId={project._id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />
            </Modal>
        </>
    );
}

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { data, error, loading, reload } = useApi(`/projects/${id}`);
    useLiveReload(reload, id);
    const [tab, setTab] = useState("board");
    const [editing, setEditing] = useState(false);
    useCrumb(data?.project?.name);

    if (loading && !data) return <PageSkeleton />;
    if (error || !data) {
        return (
            <div className="card"><Empty icon="lock" title="You can't open this project" action={<Link to="/projects" className="btn-secondary btn-sm">Back to projects</Link>}>{error}</Empty></div>
        );
    }

    const project = data.project;
    const percent = project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
    const health = projectHealth(project);

    const remove = async () => {
        if (!confirm(`Delete "${project.name}"? All its tasks, files and messages will be removed.`)) return;
        await api(`/projects/${project._id}`, { method: "DELETE" });
        toast.success("Project deleted", project.name);
        navigate("/projects");
    };

    return (
        <>
            <header className="card overflow-hidden">
                <div className="relative">
                    <ProjectCover project={project} className="h-24" />
                    <Link to="/projects" className="absolute top-3 left-4 inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-black/35 pr-3 pl-2 text-[14px] text-zinc-200 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white">
                        <Icon name="arrow_back" className="text-[16px]" />All projects
                    </Link>
                    <div className="absolute top-3 right-4"><Badge tone={health.tone} icon={health.icon} className="backdrop-blur-sm">{health.label}</Badge></div>
                </div>
                <div className="px-5 pb-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 items-end gap-4">
                            <ProjectMark project={project} size="-mt-7 h-14 w-14 text-[24px] ring-4 ring-panel" />
                            <div className="min-w-0 pb-0.5">
                                <h1 className="truncate text-[24px] leading-tight font-semibold text-ink">{project.name}</h1>
                                <p className="truncate text-[14px] text-faint">{project.isLead ? "You lead this project" : `Led by ${project.owner.fullName}`} · {plural(project.members.length + 1, "person", "people")}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <button onClick={() => askAssistant(`Summarize the project "${project.name}": progress, who is working on what, anything overdue or at risk, and the next steps you recommend.`)} className="btn-secondary btn-sm"><Icon name="auto_awesome" fill className="text-[15px] text-accent" />Summarize</button>
                            {project.isMember && <Link to={`/messages?project=${project._id}`} className="btn-secondary btn-sm"><Icon name="chat_bubble" className="text-[16px]" />Chat</Link>}
                            {project.isMember && <Link to={`/code?project=${project._id}`} className="btn-secondary btn-sm"><Icon name="code" className="text-[16px]" />Code</Link>}
                            {project.canManage && <button onClick={() => setEditing(true)} className="btn-secondary btn-sm"><Icon name="edit" className="text-[16px]" />Edit</button>}
                            {project.canManage && <button onClick={remove} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label="Delete project" title="Delete project"><Icon name="delete" /></button>}
                        </div>
                    </div>
                    <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{project.description || "No description yet."}</p>
                    <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
                        <div className="bg-panel p-3.5">
                            <p className="text-[13px] text-faint">Progress</p>
                            <div className="mt-1.5 flex items-center gap-2.5">
                                <span className="text-[18px] leading-none font-semibold text-ink tabular-nums">{percent}%</span>
                                <div className="flex-1"><ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : undefined} /></div>
                            </div>
                        </div>
                        <div className="bg-panel p-3.5">
                            <p className="text-[13px] text-faint">{project.canManage ? "Tasks done" : "Your tasks done"}</p>
                            <p className="mt-1.5 text-[18px] leading-none font-semibold text-ink tabular-nums">{project.completedCount}<span className="text-[14.5px] font-normal text-faint"> of {project.taskCount}</span></p>
                        </div>
                        <div className="bg-panel p-3.5">
                            <p className="text-[13px] text-faint">Deadline</p>
                            <p className="mt-1.5 text-[15px] leading-none">{project.dueDate ? <DueChip date={project.dueDate} done={percent === 100} /> : <span className="text-muted">No deadline</span>}</p>
                        </div>
                        <div className="bg-panel p-3.5">
                            <p className="text-[13px] text-faint">Team</p>
                            <div className="mt-1"><AvatarStack users={[project.owner, ...project.members]} max={6} size="h-6 w-6 text-[10.5px]" /></div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="mt-6">
                <Tabs value={tab} onChange={setTab} items={[
                    { value: "board", label: "Board", icon: "view_kanban" },
                    { value: "tasks", label: "Tasks", icon: "checklist", count: project.taskCount },
                    { value: "members", label: "People", icon: "group", count: project.members.length + 1 },
                    { value: "files", label: "Files", icon: "folder" }
                ]} />
            </div>

            <div className="mt-6">
                {tab === "board" && <BoardTab project={project} onChange={reload} />}
                {tab === "tasks" && <TasksTab project={project} onChange={reload} />}
                {tab === "members" && <MembersTab project={project} onChange={reload} />}
                {tab === "files" && <FilesTab project={project} />}
            </div>

            <Modal open={editing} onClose={() => setEditing(false)} title="Edit project">
                <ProjectForm project={project} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
            </Modal>
        </>
    );
}
