import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Avatar, DueChip, Icon, PriorityBadge } from "./ui";
import TaskDrawer from "./TaskDrawer";

export const COLUMNS = [
    { id: "todo", label: "To do", icon: "radio_button_unchecked", tone: "text-[#a9bccb]", bar: "bg-steel" },
    { id: "in_progress", label: "In progress", icon: "pending", tone: "text-accent", bar: "bg-accent" },
    { id: "review", label: "In review", icon: "rate_review", tone: "text-warning", bar: "bg-warning" },
    { id: "done", label: "Completed", icon: "check_circle", tone: "text-success", bar: "bg-success" }
];

const canMove = (task) => task.isMine || task.canManage;
const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);

// Cards grouped by column, each column sorted by position.
function groupTasks(tasks) {
    const groups = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
    tasks.forEach((t) => groups[t.stage || (t.status === "completed" ? "done" : "todo")]?.push(t));
    Object.values(groups).forEach((list) => list.sort(byPosition));
    return groups;
}

function Card({ task, showProject, overlay = false, onOpen }) {
    const movable = canMove(task);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task._id, data: { task }, disabled: !movable || overlay });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const done = task.stage === "done";

    return (
        <article ref={overlay ? undefined : setNodeRef} style={overlay ? undefined : style} {...(overlay ? {} : attributes)} {...(overlay ? {} : listeners)}
            onClick={() => onOpen?.(task)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(task); else listeners?.onKeyDown?.(e); }}
            className={`group rounded-lg border border-line bg-panel p-3 text-left transition-[box-shadow,border-color,background-color] duration-150 ${movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} hover:border-line-strong hover:bg-[#121b1e] ${isDragging ? "opacity-30" : ""} ${overlay ? "rotate-2 cursor-grabbing border-accent/50 shadow-2xl shadow-black/70" : "shadow-[0_1px_2px_rgb(0_0_0/0.3)]"}`}
            aria-label={`${task.title}${movable ? ", draggable" : ""}. Press Enter to open.`}>
            {showProject && task.project?.name && <p className="mb-1.5 flex items-center gap-1 truncate text-[12.5px] text-faint"><Icon name="folder" className="text-[13.5px]" />{task.project.name}</p>}
            <div className="flex items-start justify-between gap-2">
                <p className={`text-[14.5px] leading-snug font-medium ${done ? "text-faint line-through" : "text-zinc-100"}`}>{task.title}</p>
                {!movable && <span title="Only the assignee or a manager can move this"><Icon name="lock" className="text-[15px] text-faint" /></span>}
            </div>
            {task.description && <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-faint">{task.description}</p>}
            <div className="mt-3 flex items-center gap-2.5">
                <PriorityBadge priority={task.priority} label={false} />
                {task.dueDate && <DueChip date={task.dueDate} done={done} />}
                {task.commentCount > 0 && <span className="inline-flex items-center gap-1 text-[13.5px] text-faint"><Icon name="chat_bubble" className="text-[14.5px]" />{task.commentCount}</span>}
                <span className="ml-auto" title={task.assignee?.fullName}><Avatar user={task.assignee} size="h-6 w-6 text-[10.5px]" /></span>
            </div>
        </article>
    );
}

function Column({ column, tasks, showProject, onOpen }) {
    const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column: column.id } });
    return (
        <section className={`flex min-h-[440px] w-[290px] shrink-0 flex-col rounded-xl border bg-white/[0.015] transition-colors md:w-auto ${isOver ? "border-accent/40 bg-accent/[0.04]" : "border-line-soft"}`} aria-label={`${column.label}, ${tasks.length} tasks`}>
            <header className="flex items-center gap-2 px-3 pt-3 pb-2.5">
                <span className={`h-2 w-2 rounded-full ${column.bar}`} />
                <h3 className="text-[14.5px] font-semibold text-zinc-100">{column.label}</h3>
                <span className="rounded-full bg-white/[0.06] px-1.5 text-[12.5px] font-medium text-muted tabular-nums">{tasks.length}</span>
            </header>
            <span className={`mx-3 mb-2.5 h-0.5 rounded-full ${column.bar} opacity-40`} aria-hidden="true" />
            <SortableContext id={column.id} items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
                <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 px-2 pb-2">
                    {tasks.map((t) => <Card key={t._id} task={t} showProject={showProject} onOpen={onOpen} />)}
                    {!tasks.length && (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line-soft p-4 text-center text-[13.5px] text-faint">
                            <span><Icon name={column.icon} className={`mb-1 block text-xl ${column.tone}`} />Nothing here.<br />Drop a task to move it.</span>
                        </div>
                    )}
                </div>
            </SortableContext>
        </section>
    );
}

// Drag-and-drop board. Moves are shown immediately and saved with PATCH /api/tasks/:id/stage;
// other people's boards update through Socket.io. If saving fails, the card jumps back.
export default function KanbanBoard({ tasks, onChanged, showProject = false }) {
    const toast = useToast();
    const [groups, setGroups] = useState(() => groupTasks(tasks));
    const [dragging, setDragging] = useState(null);
    const [openId, setOpenId] = useState(null);
    const opened = openId && tasks.find((t) => t._id === openId);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Fresh data from the server (e.g. someone else moved a card) replaces the local state.
    useEffect(() => { if (!dragging) setGroups(groupTasks(tasks)); }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

    const columnOf = useMemo(() => (id) => (COLUMNS.some((c) => c.id === id) ? id : Object.keys(groups).find((key) => groups[key].some((t) => t._id === id))), [groups]);

    // While dragging over another column, move the card there so the gap opens where it will land.
    const onDragOver = ({ active, over }) => {
        if (!over) return;
        const from = columnOf(active.id);
        const to = columnOf(over.id);
        if (!from || !to || from === to) return;
        setGroups((prev) => {
            const card = prev[from].find((t) => t._id === active.id);
            const target = prev[to].filter((t) => t._id !== active.id);
            const index = target.findIndex((t) => t._id === over.id);
            target.splice(index < 0 ? target.length : index, 0, { ...card, stage: to });
            return { ...prev, [from]: prev[from].filter((t) => t._id !== active.id), [to]: target };
        });
    };

    const onDragEnd = async ({ active, over }) => {
        const original = dragging;
        setDragging(null);
        if (!over || !original) return;
        const column = columnOf(active.id);
        if (!column) return;

        // Final order inside the column.
        const list = [...groups[column]];
        const oldIndex = list.findIndex((t) => t._id === active.id);
        const overIndex = list.findIndex((t) => t._id === over.id);
        if (overIndex >= 0 && overIndex !== oldIndex) list.splice(overIndex, 0, list.splice(oldIndex, 1)[0]);
        const index = list.findIndex((t) => t._id === active.id);

        // Position halfway between the neighbours, so only this card needs saving.
        const before = list[index - 1]?.position;
        const after = list[index + 1]?.position;
        const position = before === undefined && after === undefined ? Date.now()
            : before === undefined ? after - 1000
            : after === undefined ? before + 1000
            : (before + after) / 2;

        if (column === original.stage && position === original.position) return;
        list[index] = { ...list[index], stage: column, position };
        setGroups((prev) => ({ ...prev, [column]: list }));

        try {
            await api(`/tasks/${active.id}/stage`, { method: "PATCH", body: { stage: column, position } });
            if (column !== original.stage) toast.success(`Moved to ${COLUMNS.find((c) => c.id === column).label}`, original.title);
            onChanged?.();
        } catch (e) {
            toast.error("Couldn't move the task", e.message);
            setGroups(groupTasks(tasks));
        }
    };

    return (
        <>
        <DndContext sensors={sensors} collisionDetection={closestCorners}
            onDragStart={({ active }) => setDragging(active.data.current?.task || null)}
            onDragOver={onDragOver} onDragEnd={onDragEnd}
            onDragCancel={() => { setDragging(null); setGroups(groupTasks(tasks)); }}>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-4 md:overflow-visible">
                {COLUMNS.map((c) => <Column key={c.id} column={c} tasks={groups[c.id]} showProject={showProject} onOpen={(t) => setOpenId(t._id)} />)}
            </div>
            <DragOverlay>{dragging ? <Card task={dragging} showProject={showProject} overlay /> : null}</DragOverlay>
        </DndContext>
        {opened && <TaskDrawer task={opened} open onClose={() => setOpenId(null)} onChanged={onChanged} />}
        </>
    );
}
