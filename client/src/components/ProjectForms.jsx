import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { Avatar, DatePicker, ErrorText, Field, Icon, Input, Segmented, Select } from "./ui";
import { plural, toDateInput } from "../utils/format";

const PRIORITY_OPTIONS = [
    { value: "low", label: "Low", dot: "bg-success" },
    { value: "medium", label: "Medium", dot: "bg-warning" },
    { value: "high", label: "High", dot: "bg-danger" }
];

// Create a new project, or edit one when `project` is passed.
export function ProjectForm({ project, onSaved, onCancel }) {
    const toast = useToast();
    const [form, setForm] = useState({
        name: project?.name || "",
        description: project?.description || "",
        dueDate: toDateInput(project?.dueDate),
        repoUrl: project?.repoUrl || ""
    });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
            const data = project
                ? await api(`/projects/${project._id}`, { method: "PUT", body: form })
                : await api("/projects", { method: "POST", body: form });
            toast.success(project ? "Project updated" : "Project created", data.project.name);
            onSaved(data.project);
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <Field label="Project name">
                <Input icon="folder" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="e.g. Website Redesign" required autoFocus />
            </Field>
            <Field label="Description" hint={`${form.description.length}/250`}>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field" maxLength={250} placeholder="What is this project about?" />
            </Field>
            <Field label="Deadline">
                <DatePicker value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} placeholder="No deadline" ariaLabel="Project deadline" />
            </Field>
            <Field label="GitHub repository" hint="Optional. Lets the team open the code in VS Code online.">
                <Input icon="hub" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} placeholder="https://github.com/owner/repo" aria-label="GitHub repository" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2 pt-2">
                {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>}
                <button disabled={busy} className="btn-primary">{project ? "Save changes" : <><Icon name="add" className="text-[18px]" />Create project</>}</button>
            </div>
        </form>
    );
}

// Toggleable avatar chips for picking people.
function PeoplePicker({ people, selected, onChange }) {
    const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    const all = people.length > 0 && selected.length === people.length;
    return (
        <div>
            <div className="flex flex-wrap gap-2">
                {people.map((p) => {
                    const on = selected.includes(p._id);
                    return (
                        <button key={p._id} type="button" onClick={() => toggle(p._id)} aria-pressed={on}
                            className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[13px] transition ${on ? "border-primary/50 bg-primary/12 text-white" : "border-line bg-white/[0.02] text-muted hover:border-[#33333c] hover:text-zinc-200"}`}>
                            <Avatar user={p} size="h-6 w-6 text-[9px]" />
                            {p.fullName}
                            {on && <Icon name="check" className="text-base text-primary" />}
                        </button>
                    );
                })}
            </div>
            {people.length > 1 && (
                <button type="button" onClick={() => onChange(all ? [] : people.map((p) => p._id))} className="mt-2 text-xs text-primary hover:underline">
                    {all ? "Clear selection" : "Select everyone"}
                </button>
            )}
        </div>
    );
}

// Add people from the organization to a project.
export function AddMembersForm({ project, onDone }) {
    const toast = useToast();
    const { data } = useApi("/org/members");
    const [selected, setSelected] = useState([]);
    const [error, setError] = useState("");

    const inProject = new Set([project.owner._id, ...project.members.map((m) => m._id)]);
    const candidates = (data?.members || []).filter((m) => !inProject.has(m.user._id)).map((m) => m.user);

    const submit = async (event) => {
        event.preventDefault();
        try {
            const result = await api(`/projects/${project._id}/members`, { method: "POST", body: { userIds: selected } });
            toast.success(`${plural(result.added, "person", "people")} added`, project.name);
            setSelected([]);
            onDone?.();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            {candidates.length
                ? <PeoplePicker people={candidates} selected={selected} onChange={setSelected} />
                : <p className="text-sm text-muted">Everyone in your organization is already in this project.</p>}
            <ErrorText>{error}</ErrorText>
            <button disabled={!selected.length} className="btn-primary w-full"><Icon name="person_add" className="text-[18px]" />Add to project</button>
        </form>
    );
}

// Create and assign a task. Pass `projectId` to lock it to one project.
export function TaskForm({ projects = [], projectId, onDone, onCancel }) {
    const toast = useToast();
    const [selected, setSelected] = useState(projectId || "");
    const [people, setPeople] = useState([]);
    const [assignees, setAssignees] = useState([]);
    const [form, setForm] = useState({ title: "", description: "", priority: "medium", dueDate: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    // Load the chosen project's lead and members.
    useEffect(() => {
        setAssignees([]);
        setPeople([]);
        if (!selected) return;
        api(`/projects/${selected}`)
            .then(({ project }) => setPeople([project.owner, ...project.members]))
            .catch(() => {});
    }, [selected]);

    const submit = async (event) => {
        event.preventDefault();
        if (!assignees.length) return setError("Choose at least one person to assign this to.");
        setBusy(true);
        setError("");
        try {
            const { tasks } = await api("/tasks", { method: "POST", body: { ...form, projectId: selected, assignees } });
            toast.success("Task assigned", `“${form.title}” → ${plural(tasks.length, "person", "people")}`);
            setForm({ title: "", description: "", priority: "medium", dueDate: "" });
            setAssignees([]);
            onDone?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={100} required
                placeholder="What needs to be done?" aria-label="Task title"
                className="w-full bg-transparent text-lg font-medium text-white outline-none placeholder:text-faint" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500}
                placeholder="Add details, links or acceptance criteria (optional)" aria-label="Task details" className="field min-h-20" />

            <div className="grid gap-4 sm:grid-cols-2">
                {!projectId && (
                    <Field label="Project" className="sm:col-span-2">
                        <Select value={selected} onChange={setSelected} ariaLabel="Project" placeholder={projects.length ? "Choose a project" : "Join or create a project first"}
                            options={projects.map((p) => ({ value: p._id, label: p.name, icon: "folder", hint: p.isLead ? "Lead" : undefined }))} />
                    </Field>
                )}
                <Field label="Due date">
                    <DatePicker value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} placeholder="No due date" ariaLabel="Due date" />
                </Field>
                <Field label="Priority">
                    <Segmented options={PRIORITY_OPTIONS} value={form.priority} onChange={(priority) => setForm({ ...form, priority })} ariaLabel="Priority" />
                </Field>
            </div>

            <Field label="Assign to">
                {!selected
                    ? <p className="rounded-xl border border-dashed border-line px-3 py-3 text-[13px] text-faint">Pick a project to see its people.</p>
                    : <PeoplePicker people={people} selected={assignees} onChange={setAssignees} />}
            </Field>

            <ErrorText>{error}</ErrorText>
            <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-4">
                {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>}
                <button disabled={busy || !selected} className="btn-primary"><Icon name="send" className="text-[18px]" />{busy ? "Assigning…" : "Assign task"}</button>
            </div>
        </form>
    );
}
