import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Avatar, Badge, DatePicker, Drawer, DueChip, ErrorText, Icon, PriorityBadge, Select, Skeleton } from "./ui";
import { formatDate, timeAgo, toDateInput } from "../utils/format";

// The four board columns. "done" is the same thing as a completed task.
export const STAGES = {
    todo: { label: "To do", tone: "steel", icon: "radio_button_unchecked", dot: "bg-steel" },
    in_progress: { label: "In progress", tone: "teal", icon: "pending", dot: "bg-accent" },
    review: { label: "In review", tone: "amber", icon: "rate_review", dot: "bg-warning" },
    done: { label: "Done", tone: "green", icon: "check_circle", dot: "bg-success" }
};
export const stageOf = (task) => task.stage || (task.status === "completed" ? "done" : "todo");

export function StageBadge({ task }) {
    const stage = STAGES[stageOf(task)];
    return <Badge tone={stage.tone} dot>{stage.label}</Badge>;
}

const PRIORITY_OPTIONS = [
    { value: "high", label: "High", dot: "bg-danger" },
    { value: "medium", label: "Medium", dot: "bg-warning" },
    { value: "low", label: "Low", dot: "bg-steel" }
];

function Comments({ taskId, onAdded }) {
    const [comments, setComments] = useState(null);
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        api(`/tasks/${taskId}/comments`).then((data) => setComments(data.comments)).catch((e) => setError(e.message));
    }, [taskId]);

    const submit = async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        try {
            const { comment } = await api(`/tasks/${taskId}/comments`, { method: "POST", body: { text } });
            setComments((prev) => [...(prev || []), comment]);
            setText("");
            onAdded?.();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <section>
            <h3 className="eyebrow mb-3">Comments {comments?.length > 0 && <span className="ml-1 tabular-nums">{comments.length}</span>}</h3>
            {comments === null && !error && <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10 w-4/5" /></div>}
            {comments?.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[14px] text-faint">No comments yet. Ask a question or leave an update.</p>}
            <ol className="space-y-4">
                {comments?.map((c) => (
                    <li key={c._id} className="flex gap-2.5">
                        <Avatar user={c.author} size="h-7 w-7 text-[11.5px]" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px]"><span className="font-medium text-zinc-100">{c.author?.fullName}</span> <span className="text-faint">· {timeAgo(c.createdAt)}</span></p>
                            <p className="mt-0.5 text-[14.5px] leading-relaxed break-words whitespace-pre-wrap text-zinc-300">{c.text}</p>
                        </div>
                    </li>
                ))}
            </ol>
            <div className="mt-2"><ErrorText>{error}</ErrorText></div>
            <form onSubmit={submit} className="relative mt-3">
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={240} className="field pr-10" placeholder="Write a comment…" aria-label="Comment" />
                <button disabled={!text.trim()} className="absolute top-1/2 right-1 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-accent transition-colors hover:bg-accent/10 disabled:text-faint" aria-label="Send comment">
                    <Icon name="send" className="text-[18px]" />
                </button>
            </form>
        </section>
    );
}

function Property({ icon, label, children }) {
    return (
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 py-1.5">
            <dt className="flex items-center gap-2 text-[14px] text-faint"><Icon name={icon} className="text-[16px]" />{label}</dt>
            <dd className="min-w-0 text-[14.5px] text-zinc-200">{children}</dd>
        </div>
    );
}

// Everything about one task, in a panel that slides over the page.
// The assignee can move it between stages, mark it done and hand in work;
// whoever manages the task (assigner, project lead, or "tasks.manage_all") can edit and delete it.
export default function TaskDrawer({ task, open, onClose, onChanged }) {
    const toast = useToast();
    const { isMine, canManage } = task;
    const movable = isMine || canManage;
    const completed = task.status === "completed";
    const fileInput = useRef(null);
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) setForm({ title: task.title, description: task.description || "", priority: task.priority || "medium", dueDate: toDateInput(task.dueDate) });
    }, [open, task._id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open || !form) return null;

    const dirty = form.title !== task.title || form.description !== (task.description || "") || form.priority !== (task.priority || "medium") || form.dueDate !== toDateInput(task.dueDate);

    const run = async (action, success, close = false) => {
        setBusy(true);
        setError("");
        try {
            await action();
            if (success) toast.success(...success);
            onChanged?.();
            if (close) onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const save = () => run(() => api(`/tasks/${task._id}`, { method: "PUT", body: form }), ["Task updated", form.title]);
    const move = (stage) => run(() => api(`/tasks/${task._id}/stage`, { method: "PATCH", body: { stage } }), [`Moved to ${STAGES[stage].label}`, task.title]);
    const toggleDone = () => run(
        () => api(`/tasks/${task._id}/status`, { method: "PATCH", body: { status: completed ? "pending" : "completed" } }),
        completed ? ["Task reopened", task.title] : ["Task completed", task.title]
    );
    const remove = () => {
        if (confirm(`Delete "${task.title}" for ${task.assignee?.fullName}?`)) run(() => api(`/tasks/${task._id}`, { method: "DELETE" }), ["Task deleted", task.title], true);
    };
    const submitFile = (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        const data = new FormData();
        data.append("file", file);
        data.append("taskId", task._id);
        run(() => api(`/projects/${task.project._id}/files`, { method: "POST", form: data }), ["Work submitted", file.name]);
    };

    return (
        <Drawer open onClose={onClose}
            subtitle={task.project?.name}
            title={canManage
                ? <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={100} aria-label="Task title"
                    className="-mx-1.5 w-[calc(100%+0.75rem)] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-semibold text-ink outline-none transition-colors hover:border-line focus:border-accent/60 focus:bg-inset" />
                : task.title}
            footer={(
                <div className="flex flex-wrap items-center gap-2">
                    {isMine && (
                        <button onClick={toggleDone} disabled={busy} className={completed ? "btn-secondary" : "btn-primary"}>
                            <Icon name={completed ? "undo" : "check"} className="text-[18px]" />{completed ? "Reopen task" : "Mark as done"}
                        </button>
                    )}
                    {canManage && dirty && <button onClick={save} disabled={busy || !form.title.trim()} className="btn-primary"><Icon name="save" className="text-[18px]" />Save changes</button>}
                    {canManage && dirty && <button onClick={() => setForm({ title: task.title, description: task.description || "", priority: task.priority || "medium", dueDate: toDateInput(task.dueDate) })} className="btn-ghost">Discard</button>}
                    {canManage && <button onClick={remove} disabled={busy} className="btn-danger ml-auto"><Icon name="delete" className="text-[17px]" />Delete</button>}
                </div>
            )}>
            <dl className="rounded-xl border border-line bg-inset px-3.5 py-2">
                <Property icon="adjust" label="Status">
                    {movable
                        ? <div className="w-44"><Select value={stageOf(task)} onChange={move} ariaLabel="Status" disabled={busy} className="h-8" options={Object.entries(STAGES).map(([value, s]) => ({ value, label: s.label, dot: s.dot }))} /></div>
                        : <StageBadge task={task} />}
                </Property>
                <Property icon="signal_cellular_alt" label="Priority">
                    {canManage
                        ? <div className="w-44"><Select value={form.priority} onChange={(priority) => setForm({ ...form, priority })} ariaLabel="Priority" className="h-8" options={PRIORITY_OPTIONS} /></div>
                        : <PriorityBadge priority={task.priority} />}
                </Property>
                <Property icon="event" label="Due date">
                    {canManage
                        ? <div className="w-full max-w-64"><DatePicker value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} placeholder="No due date" ariaLabel="Due date" /></div>
                        : task.dueDate ? <DueChip date={task.dueDate} done={completed} /> : <span className="text-faint">No due date</span>}
                </Property>
                <Property icon="person" label="Assignee">
                    <span className="flex items-center gap-2"><Avatar user={task.assignee} size="h-5 w-5 text-[9.5px]" /><span className="truncate">{task.assignee?.fullName}{isMine && <span className="text-faint"> (you)</span>}</span></span>
                </Property>
                <Property icon="assignment_ind" label="Assigned by"><span className="truncate">{task.assignedBy?.fullName || "Unknown"}</span></Property>
                {task.project && (
                    <Property icon="folder" label="Project">
                        <Link to={`/projects/${task.project._id}`} onClick={onClose} className="inline-flex max-w-full items-center gap-1 truncate text-accent hover:underline">{task.project.name}<Icon name="arrow_outward" className="text-[14.5px]" /></Link>
                    </Property>
                )}
                <Property icon="schedule" label="Created"><span className="text-muted">{formatDate(task.createdAt)}</span></Property>
                {task.completedAt && <Property icon="task_alt" label="Completed"><span className="text-success">{formatDate(task.completedAt)}</span></Property>}
            </dl>

            <section className="mt-5">
                <h3 className="eyebrow mb-2">Description</h3>
                {canManage
                    ? <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} className="field min-h-24" placeholder="Add details, links or acceptance criteria" aria-label="Description" />
                    : <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${task.description ? "text-zinc-300" : "text-faint"}`}>{task.description || "No description."}</p>}
            </section>

            {isMine && (
                <section className="mt-5">
                    <h3 className="eyebrow mb-2">Hand in work</h3>
                    <button onClick={() => fileInput.current.click()} disabled={busy} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line px-3.5 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/[0.04]">
                        <span className="tile tile-teal"><Icon name="upload_file" /></span>
                        <span>
                            <span className="block text-[14.5px] font-medium text-zinc-100">Attach a file to this task</span>
                            <span className="block text-[13.5px] text-faint">It appears in the project's Files tab as your submission.</span>
                        </span>
                    </button>
                    <input ref={fileInput} type="file" hidden onChange={submitFile} />
                </section>
            )}

            <div className="mt-3"><ErrorText>{error}</ErrorText></div>
            <div className="mt-6 border-t border-line-soft pt-5"><Comments taskId={task._id} onAdded={onChanged} /></div>
        </Drawer>
    );
}
