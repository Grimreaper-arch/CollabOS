import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, downloadFile } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import TaskCard from "../components/TaskCard";
import { AddMembersForm, ProjectForm, TaskForm } from "../components/ProjectForms";
import { Avatar, AvatarStack, DueChip, Empty, ErrorText, Icon, Modal, PageSkeleton, Panel, ProgressBar, Spinner, Tabs } from "../components/ui";
import { formatSize, plural, timeAgo } from "../utils/format";

const FILE_ICONS = { "application/pdf": ["picture_as_pdf", "text-danger bg-danger/10"], image: ["image", "text-accent bg-accent/10"] };
const fileIcon = (mime) => FILE_ICONS[mime] || (mime.startsWith("image/") ? FILE_ICONS.image : ["description", "text-primary bg-primary/10"]);

function FilesTab({ project }) {
    const { can } = useAuth();
    const toast = useToast();
    const { data, error, reload } = useApi(`/projects/${project._id}/files`);
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
            <Panel title="Files" description={plural(files.length, "file")}>
                <ErrorText>{error}</ErrorText>
                <div className="space-y-2">
                    {files.length ? files.map((f) => {
                        const [icon, tone] = fileIcon(f.mimeType);
                        return (
                            <div key={f._id} className="group flex items-center gap-3 rounded-xl border border-line bg-inset p-3 transition hover:border-[#2e2e36]">
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon name={icon} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-zinc-100">{f.originalName}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                                        <span className="font-mono">{formatSize(f.size)}</span>·<span>{f.uploadedBy?.fullName}</span>·<span>{timeAgo(f.createdAt)}</span>
                                        {f.task && <span className="chip border-primary/30 py-0 text-primary">Submission · {f.task.title}</span>}
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
                    className={`flex h-fit min-h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-primary bg-primary/[0.06]" : "border-line hover:border-primary/50 hover:bg-white/[0.02]"}`}
                >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon name={busy ? "progress_activity" : "cloud_upload"} className={busy ? "animate-spin" : ""} />
                    </span>
                    <p className="mt-4 text-sm font-medium text-white">{busy ? "Uploading…" : "Drop a file or click to upload"}</p>
                    <p className="mt-1 text-xs text-faint">PDF, Office, images, text, CSV or ZIP · max 10 MB</p>
                    <input ref={input} type="file" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
                </button>
            ) : (
                <div className="card h-fit p-5 text-[13px] text-muted">
                    <Icon name="info" className="mb-2 text-faint" />
                    <p>Your role can't upload shared files. You can still submit work on your own tasks with the <Icon name="attach_file" className="align-middle text-base" /> button.</p>
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
        <div key={m._id} className="flex items-center gap-3 rounded-xl border border-line bg-inset p-3">
            <Avatar user={m} size="h-9 w-9 text-xs" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{m.fullName}</p>
                <p className="truncate text-xs text-faint">{m.email}</p>
            </div>
            {badge}
        </div>
    );

    return (
        <div className={`grid gap-6 ${project.canManage ? "xl:grid-cols-[1fr_400px]" : ""}`}>
            <Panel title="People" description={plural(project.members.length + 1, "person", "people")}>
                <div className="grid gap-2.5 md:grid-cols-2">
                    {person(project.owner, <span className="chip border-primary/30 text-primary"><Icon name="military_tech" className="text-[14px]" />Lead</span>)}
                    {project.members.map((m) => person(m, project.canManage && (
                        <button onClick={() => remove(m)} className="btn-icon h-8 w-8 hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${m.fullName}`}><Icon name="person_remove" className="text-[18px]" /></button>
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

function TasksTab({ project, onChange }) {
    const { can } = useAuth();
    const { data, loading, reload } = useApi(`/tasks?project=${project._id}`);
    const [adding, setAdding] = useState(false);
    const refresh = () => { reload(); onChange(); };
    const tasks = data?.tasks || [];
    const open = tasks.filter((t) => t.status !== "completed");
    const done = tasks.filter((t) => t.status === "completed");
    const canAssign = can("tasks.assign") && (project.isMember || project.canManage);

    return (
        <>
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">{open.length} open · {done.length} done</p>
                {canAssign && <button onClick={() => setAdding(true)} className="btn-primary btn-sm"><Icon name="add" className="text-[18px]" />Add task</button>}
            </div>
            {loading ? <Spinner /> : tasks.length ? (
                <div className="space-y-8">
                    {[["Open", open], ["Completed", done]].filter(([, list]) => list.length).map(([label, list]) => (
                        <section key={label}>
                            <h3 className="mb-3 text-sm font-medium text-zinc-300">{label} <span className="ml-1 font-mono text-xs text-faint">{list.length}</span></h3>
                            <div className="grid gap-2.5 2xl:grid-cols-2">{list.map((t) => <TaskCard key={t._id} task={t} onChanged={refresh} showProject={false} />)}</div>
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
    const [tab, setTab] = useState("tasks");
    const [editing, setEditing] = useState(false);

    if (loading) return <PageSkeleton />;
    if (error) {
        return (
            <Empty icon="lock" title={error} action={<Link to="/projects" className="btn-secondary btn-sm">Back to projects</Link>} />
        );
    }

    const project = data.project;
    const percent = project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0;

    const remove = async () => {
        if (!confirm(`Delete "${project.name}"? All its tasks, files and messages will be removed.`)) return;
        await api(`/projects/${project._id}`, { method: "DELETE" });
        toast.success("Project deleted", project.name);
        navigate("/projects");
    };

    return (
        <>
            <Link to="/projects" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-white">
                <Icon name="arrow_back" className="text-base" />Projects
            </Link>

            <header className="card relative mt-4 overflow-hidden p-6">
                <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/10 text-2xl font-semibold text-primary ring-1 ring-primary/20">
                            {project.name[0].toUpperCase()}
                        </span>
                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-white">{project.name}</h1>
                            <p className="mt-1 max-w-2xl text-[14px] text-muted">{project.description || "No description"}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="chip"><Avatar user={project.owner} size="h-4 w-4 text-[7px]" />{project.isLead ? "You lead this" : `Lead: ${project.owner.fullName}`}</span>
                                {project.dueDate && <DueChip date={project.dueDate} />}
                                <AvatarStack users={[project.owner, ...project.members]} size="h-6 w-6 text-[9px]" />
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        {project.isMember && <Link to={`/messages?project=${project._id}`} className="btn-secondary btn-sm"><Icon name="forum" className="text-[18px]" />Chat</Link>}
                        {project.canManage && <button onClick={() => setEditing(true)} className="btn-secondary btn-sm"><Icon name="edit" className="text-[18px]" />Edit</button>}
                        {project.canManage && <button onClick={remove} className="btn-danger btn-sm"><Icon name="delete" className="text-[18px]" />Delete</button>}
                    </div>
                </div>
                <div className="relative mt-6 flex items-center gap-4">
                    <div className="flex-1"><ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : "bg-primary"} /></div>
                    <span className="font-mono text-xs text-muted">{percent}% · {project.completedCount}/{project.taskCount} {project.canManage ? "" : "of yours "}done</span>
                </div>
            </header>

            <div className="mt-6">
                <Tabs value={tab} onChange={setTab} items={[
                    { value: "tasks", label: "Tasks", icon: "checklist", count: project.taskCount },
                    { value: "members", label: "People", icon: "group", count: project.members.length + 1 },
                    { value: "files", label: "Files", icon: "folder" }
                ]} />
            </div>

            <div className="mt-6">
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
