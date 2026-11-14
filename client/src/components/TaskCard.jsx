import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Avatar, DueChip, ErrorText, Icon, PriorityBadge, Tooltip } from "./ui";
import TaskDrawer, { StageBadge } from "./TaskDrawer";

// A task as one row. Click the row to open its details; the circle on the left completes it
// (only the person it's assigned to can do that).
export default function TaskCard({ task, onChanged, showProject = true }) {
    const toast = useToast();
    // Flags computed by the server: isMine = assigned to me, canManage = I may edit/delete it.
    const { isMine } = task;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const completed = task.status === "completed";

    const toggleStatus = async (event) => {
        event.stopPropagation();
        setBusy(true);
        setError("");
        try {
            await api(`/tasks/${task._id}/status`, { method: "PATCH", body: { status: completed ? "pending" : "completed" } });
            toast.success(completed ? "Task reopened" : "Nice work! Task completed", task.title);
            onChanged?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const onKey = (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } };

    return (
        <>
            <article className="@container row-bleed group cursor-pointer py-2.5 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-offset-[-2px]"
                role="button" tabIndex={0} aria-label={`Open task ${task.title}`} onClick={() => setOpen(true)} onKeyDown={onKey}>
                <div className="flex items-center gap-3">
                    {isMine ? (
                        <Tooltip label={completed ? "Mark as not done" : "Mark as done"}>
                            <button onClick={toggleStatus} disabled={busy} aria-label={completed ? "Mark as not done" : "Mark as done"}
                                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-150 ${completed ? "border-success bg-success text-[#04201c]" : "border-zinc-600 text-transparent hover:border-success hover:bg-success/15 hover:text-success"}`}>
                                <Icon name="check" className="text-[14.5px]" />
                            </button>
                        </Tooltip>
                    ) : (
                        <span title={completed ? "Completed" : "Only the assignee can complete this"} className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${completed ? "border-success/60 text-success" : "border-dashed border-zinc-600"}`}>
                            {completed && <Icon name="check" className="text-[14.5px]" />}
                        </span>
                    )}

                    <div className="min-w-0 flex-1">
                        <p className={`truncate text-[15px] ${completed ? "text-faint line-through" : "font-medium text-zinc-100 group-hover:text-white"}`}>{task.title}</p>
                        {task.description && <p className="truncate text-[14px] text-faint @2xl:hidden @4xl:block">{task.description}</p>}
                        {/* Narrow lists: details wrap under the title */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 @2xl:hidden">
                            <DueChip date={task.dueDate} done={completed} />
                            <PriorityBadge priority={task.priority} />
                            {showProject && task.project && <span className="truncate text-[13.5px] text-faint">{task.project.name}</span>}
                        </div>
                    </div>

                    {/* Wide lists: details sit in columns on the right */}
                    <div className="hidden shrink-0 items-center gap-4 @2xl:flex">
                        {showProject && task.project && (
                            <Link to={`/projects/${task.project._id}`} onClick={(e) => e.stopPropagation()} className="hidden w-36 items-center gap-1.5 truncate text-[13.5px] text-muted hover:text-accent @4xl:inline-flex">
                                <Icon name="folder" className="text-[15px] text-faint" /><span className="truncate">{task.project.name}</span>
                            </Link>
                        )}
                        <span className="w-[104px]"><StageBadge task={task} /></span>
                        <span className="w-[72px]"><PriorityBadge priority={task.priority} /></span>
                        <span className="w-24"><DueChip date={task.dueDate} done={completed} /></span>
                    </div>

                    <span className="hidden w-8 items-center gap-1 text-[13.5px] text-faint @md:inline-flex" title={task.commentCount ? `${task.commentCount} comments` : undefined}>{task.commentCount > 0 && <><Icon name="chat_bubble" className="text-[15px]" />{task.commentCount}</>}</span>
                    <span title={isMine ? `Assigned by ${task.assignedBy?.fullName || "someone"}` : `Assigned to ${task.assignee?.fullName}`}>
                        <Avatar user={isMine ? task.assignedBy : task.assignee} size="h-6 w-6 text-[10.5px]" />
                    </span>
                    <Icon name="chevron_right" className="hidden text-[18px] text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent @md:block" />
                </div>
                {error && <div className="mt-2 pl-[30px]"><ErrorText>{error}</ErrorText></div>}
            </article>
            <TaskDrawer task={task} open={open} onClose={() => setOpen(false)} onChanged={onChanged} />
        </>
    );
}
