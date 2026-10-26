import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Avatar, DueChip, ErrorText, Icon, PriorityBadge } from "./ui";
import { timeAgo } from "../utils/format";

function Comments({ taskId, onAdded }) {
    const [comments, setComments] = useState(null);
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        api(`/tasks/${taskId}/comments`)
            .then((data) => setComments(data.comments))
            .catch((e) => setError(e.message));
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
        <div className="mt-3 space-y-3 border-t border-line-soft pt-3 pl-9">
            {comments?.map((c) => (
                <div key={c._id} className="flex gap-2.5">
                    <Avatar user={c.author} size="h-6 w-6 text-[9px]" />
                    <div className="min-w-0 rounded-xl rounded-tl-sm bg-white/[0.04] px-3 py-2">
                        <p className="text-xs"><span className="font-medium text-zinc-200">{c.author?.fullName}</span> <span className="text-faint">· {timeAgo(c.createdAt)}</span></p>
                        <p className="mt-0.5 text-[13px] text-zinc-300">{c.text}</p>
                    </div>
                </div>
            ))}
            <ErrorText>{error}</ErrorText>
            <form onSubmit={submit} className="relative">
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={240} className="field h-9 pr-10 text-[13px]" placeholder="Write a comment…" aria-label="Comment" />
                <button className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-primary hover:bg-primary/10" aria-label="Send comment">
                    <Icon name="arrow_upward" className="text-[18px]" />
                </button>
            </form>
        </div>
    );
}

export default function TaskCard({ task, onChanged, showProject = true }) {
    const toast = useToast();
    // Flags computed by the server: isMine = assigned to me, canManage = I may edit/delete it.
    const { isMine, canManage } = task;
    const [showComments, setShowComments] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const fileInput = useRef(null);
    const completed = task.status === "completed";

    const run = async (action, success) => {
        setBusy(true);
        setError("");
        try {
            await action();
            if (success) toast.success(...success);
            onChanged?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const toggleStatus = () => run(
        () => api(`/tasks/${task._id}/status`, { method: "PATCH", body: { status: completed ? "pending" : "completed" } }),
        completed ? ["Task reopened", task.title] : ["Nice work! Task completed", task.title]
    );

    const remove = () => {
        if (confirm(`Delete "${task.title}" for ${task.assignee?.fullName}?`)) run(() => api(`/tasks/${task._id}`, { method: "DELETE" }), ["Task deleted", task.title]);
    };

    const submitFile = (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        const form = new FormData();
        form.append("file", file);
        form.append("taskId", task._id);
        run(() => api(`/projects/${task.project._id}/files`, { method: "POST", form }), ["Work submitted", file.name]);
    };

    return (
        <article className={`group rounded-xl border bg-inset p-3.5 transition hover:border-[#2e2e36] ${completed ? "border-line-soft" : "border-line"}`}>
            <div className="flex items-start gap-3">
                {isMine ? (
                    <button onClick={toggleStatus} disabled={busy} aria-label={completed ? "Mark as not done" : "Mark as done"}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${completed ? "border-success bg-success text-black" : "border-[#3a3a44] hover:border-primary hover:bg-primary/10"}`}>
                        {completed && <Icon name="check" className="text-[14px] font-bold" />}
                    </button>
                ) : (
                    <Icon name={completed ? "check_circle" : "radio_button_unchecked"} className={`mt-0.5 text-[20px] ${completed ? "text-success" : "text-faint"}`} fill={completed} />
                )}

                <div className="min-w-0 flex-1">
                    <p className={`text-[14px] font-medium ${completed ? "text-faint line-through" : "text-zinc-100"}`}>{task.title}</p>
                    {task.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <DueChip date={task.dueDate} done={completed} />
                        <PriorityBadge priority={task.priority} />
                        {showProject && task.project && (
                            <Link to={`/projects/${task.project._id}`} className="chip hover:border-primary/40 hover:text-white"><Icon name="folder" className="text-[14px]" />{task.project.name}</Link>
                        )}
                        <span className="chip">
                            <Avatar user={isMine ? task.assignedBy : task.assignee} size="h-4 w-4 text-[7px]" />
                            {isMine ? `from ${task.assignedBy?.fullName?.split(" ")[0] || "someone"}` : task.assignee?.fullName}
                        </span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => setShowComments((v) => !v)} className={`btn-icon h-8 w-auto gap-1 px-2 text-xs ${showComments ? "bg-white/[0.06] text-white" : ""}`} aria-label="Comments">
                        <Icon name="chat_bubble" className="text-[17px]" />{task.commentCount || ""}
                    </button>
                    {isMine && (
                        <>
                            <button onClick={() => fileInput.current.click()} disabled={busy} className="btn-icon h-8 w-8" title="Submit work for this task" aria-label="Submit file">
                                <Icon name="attach_file" className="text-[18px]" />
                            </button>
                            <input ref={fileInput} type="file" hidden onChange={submitFile} />
                        </>
                    )}
                    {canManage && (
                        <button onClick={remove} disabled={busy} className="btn-icon h-8 w-8 hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100" aria-label="Delete task">
                            <Icon name="delete" className="text-[18px]" />
                        </button>
                    )}
                </div>
            </div>
            {error && <div className="mt-2 pl-8"><ErrorText>{error}</ErrorText></div>}
            {showComments && <Comments taskId={task._id} onAdded={onChanged} />}
        </article>
    );
}
