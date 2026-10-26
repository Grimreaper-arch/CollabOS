import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { Avatar, Empty, ErrorText, Field, Icon, Input, Modal, PageHeader, Panel, Select, Spinner, StatCard, Tabs, Toggle } from "../components/ui";
import { formatDate, plural, timeAgo } from "../utils/format";

const GROUP_ICONS = { Organization: "corporate_fare", People: "group", Roles: "badge", Projects: "folder_open", Tasks: "checklist", Files: "folder_zip" };

// ---------- People ----------

function PeopleTab({ roles, onChange }) {
    const { user, role: myRole, can } = useAuth();
    const toast = useToast();
    const { data, error, loading, reload } = useApi("/org/members");
    const [search, setSearch] = useState("");

    const assignable = roles.filter((r) => r.level > myRole.level && !r.isSystem);
    const canManage = (m) => m.user._id !== user._id && m.role.level > myRole.level;

    const changeRole = async (m, roleId) => {
        try {
            await api(`/org/members/${m.user._id}/role`, { method: "PATCH", body: { roleId } });
            toast.success("Role updated", `${m.user.fullName} is now ${roles.find((r) => r._id === roleId)?.name}.`);
            reload();
            onChange();
        } catch (e) {
            toast.error("Couldn't change role", e.message);
        }
    };

    const remove = async (m) => {
        if (!confirm(`Remove ${m.user.fullName} from the organization? They will lose access to all projects.`)) return;
        try {
            await api(`/org/members/${m.user._id}`, { method: "DELETE" });
            toast.success("Member removed", m.user.fullName);
            reload();
            onChange();
        } catch (e) {
            toast.error("Couldn't remove", e.message);
        }
    };

    if (loading) return <Spinner />;
    const q = search.trim().toLowerCase();
    const members = (data?.members || []).filter((m) => `${m.user.fullName} ${m.user.email} ${m.role.name}`.toLowerCase().includes(q));

    return (
        <Panel title="People" description={`You can change or remove people whose role is below yours (${myRole.name}).`}
            action={<div className="hidden w-64 sm:block"><Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9" /></div>}
            bodyClassName="p-0">
            <ErrorText>{error}</ErrorText>
            <div className="divide-y divide-line-soft">
                {members.map((m) => (
                    <div key={m._id} className="flex flex-col gap-3 px-5 py-3.5 transition hover:bg-white/[0.015] sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Avatar user={m.user} size="h-9 w-9 text-xs" />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-100">{m.user.fullName} {m.user._id === user._id && <span className="text-xs font-normal text-faint">(you)</span>}</p>
                                <p className="truncate text-xs text-faint">{m.user.email} · joined {formatDate(m.createdAt)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {can("members.assign_role") && canManage(m) ? (
                                <div className="w-48">
                                    <Select value={m.role._id} onChange={(roleId) => changeRole(m, roleId)} ariaLabel={`Role of ${m.user.fullName}`} className="h-9"
                                        options={assignable.map((r) => ({ value: r._id, label: r.name, hint: `L${r.level}` }))} />
                                </div>
                            ) : (
                                <span className={`chip ${m.role.isSystem ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/25 text-primary"}`}>
                                    {m.role.isSystem && <Icon name="workspace_premium" className="text-[14px]" />}{m.role.name}
                                </span>
                            )}
                            {can("members.remove") && canManage(m) && (
                                <button onClick={() => remove(m)} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${m.user.fullName}`}><Icon name="person_remove" /></button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

// ---------- Roles ----------

function RoleEditor({ role, groups, onSaved, onCancel }) {
    const { role: myRole, can } = useAuth();
    const toast = useToast();
    const [form, setForm] = useState({
        name: role?.name || "",
        description: role?.description || "",
        level: role?.level ?? myRole.level + 1,
        permissions: role?.permissions || []
    });
    const [error, setError] = useState("");

    const toggle = (key) => setForm((f) => ({
        ...f,
        permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key]
    }));

    const save = async (event) => {
        event.preventDefault();
        try {
            if (role) await api(`/org/roles/${role._id}`, { method: "PUT", body: form });
            else await api("/org/roles", { method: "POST", body: form });
            toast.success(role ? "Role updated" : "Role created", form.name);
            onSaved();
        } catch (e) {
            setError(e.message);
        }
    };

    const levels = Array.from({ length: 10 }, (_, i) => myRole.level + 1 + i);

    return (
        <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <Field label="Role name">
                    <Input icon="badge" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={40} placeholder="e.g. Team Lead" aria-label="Role name" autoFocus />
                </Field>
                <Field label="Seniority">
                    <Select value={form.level} onChange={(level) => setForm({ ...form, level: Number(level) })} ariaLabel="Seniority level"
                        options={levels.map((l) => ({ value: l, label: `Level ${l}`, hint: l === myRole.level + 1 ? "highest" : undefined }))} />
                </Field>
            </div>
            <Field label="Description">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={160} placeholder="What is this role for? (optional)" aria-label="Description" />
            </Field>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="label mb-0">Permissions</span>
                    <span className="font-mono text-xs text-faint">{form.permissions.length} selected</span>
                </div>
                <div className="max-h-[44vh] space-y-3 overflow-y-auto pr-1">
                    {groups.map((g) => (
                        <fieldset key={g.group} className="rounded-xl border border-line bg-inset">
                            <legend className="sr-only">{g.group}</legend>
                            <p className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-[13px] font-medium text-zinc-200">
                                <Icon name={GROUP_ICONS[g.group] || "tune"} className="text-[18px] text-primary" />{g.group}
                            </p>
                            <div className="divide-y divide-line-soft">
                                {g.permissions.map((p) => {
                                    const allowed = can(p.key);
                                    return (
                                        <label key={p.key} className={`flex items-center justify-between gap-4 px-4 py-2.5 ${allowed ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}
                                            title={allowed ? "" : "You can't grant a permission you don't have"}>
                                            <span>
                                                <span className="block text-[13px] text-zinc-200">{p.label}</span>
                                                <code className="font-mono text-[11px] text-faint">{p.key}</code>
                                            </span>
                                            <Toggle checked={form.permissions.includes(p.key)} onChange={() => allowed && toggle(p.key)} label={p.label} />
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>
                    ))}
                </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
                <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
                <button className="btn-primary"><Icon name="check" className="text-[18px]" />{role ? "Save role" : "Create role"}</button>
            </div>
        </form>
    );
}

function RolesTab({ roles, reload }) {
    const { can } = useAuth();
    const toast = useToast();
    const catalog = useApi("/org/permissions");
    const [editing, setEditing] = useState(null); // null = closed, {} = new, role = edit

    const groups = catalog.data?.groups || [];
    const labelOf = Object.fromEntries(groups.flatMap((g) => g.permissions.map((p) => [p.key, p.label])));
    const total = Object.keys(labelOf).length;

    const remove = async (role) => {
        if (!confirm(`Delete the role "${role.name}"?`)) return;
        try {
            await api(`/org/roles/${role._id}`, { method: "DELETE" });
            toast.success("Role deleted", role.name);
            reload();
        } catch (e) {
            toast.error("Couldn't delete role", e.message);
        }
    };

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted">Lower level = more senior. People can only manage roles below their own.</p>
                {can("roles.manage") && <button onClick={() => setEditing({})} className="btn-primary btn-sm"><Icon name="add" className="text-[18px]" />New role</button>}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {roles.map((r) => {
                    const full = r.permissions.length === total;
                    return (
                        <article key={r._id} className="card flex flex-col p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${r.isSystem ? "bg-warning/12 text-warning" : "bg-primary/12 text-primary"}`}>
                                        <Icon name={r.isSystem ? "workspace_premium" : "badge"} />
                                    </span>
                                    <div>
                                        <h4 className="font-semibold text-white">{r.name}</h4>
                                        <p className="text-xs text-faint">{plural(r.memberCount, "person", "people")}</p>
                                    </div>
                                </div>
                                <span className="chip font-mono">L{r.level}</span>
                            </div>
                            <p className="mt-3 text-[13px] text-muted">{r.description || "No description"}</p>
                            <div className="mt-4 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div className={`h-full rounded-full ${full ? "bg-warning" : "bg-primary"}`} style={{ width: `${total ? (r.permissions.length / total) * 100 : 0}%` }} />
                                </div>
                                <span className="font-mono text-[11px] text-faint">{r.permissions.length}/{total}</span>
                            </div>
                            <div className="mt-3 flex flex-1 flex-wrap content-start gap-1.5">
                                {full ? <span className="chip border-warning/30 text-warning">Full access</span>
                                    : r.permissions.length ? r.permissions.map((p) => <span key={p} className="chip" title={p}>{labelOf[p] || p}</span>)
                                        : <span className="text-xs text-faint">Basic access only: own tasks, comments and messages.</span>}
                            </div>
                            {can("roles.manage") && r.manageable && (
                                <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
                                    <button onClick={() => setEditing(r)} className="btn-secondary btn-sm flex-1"><Icon name="edit" className="text-base" />Edit</button>
                                    <button onClick={() => remove(r)} className="btn-icon h-8 w-8 hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${r.name}`}><Icon name="delete" className="text-[18px]" /></button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.name}` : "New role"}
                description="Pick exactly what this role can do. You can't grant permissions you don't have." size="max-w-2xl">
                <RoleEditor role={editing?._id ? editing : null} groups={groups} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
            </Modal>
        </>
    );
}

// ---------- Invitations ----------

function InvitationsTab({ roles }) {
    const { role: myRole } = useAuth();
    const toast = useToast();
    const { data, reload } = useApi("/org/invitations");
    const invitable = roles.filter((r) => r.level > myRole.level && !r.isSystem);
    const [form, setForm] = useState({ emails: "", roleId: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const send = async (event) => {
        event.preventDefault();
        if (!form.roleId) return setError("Choose a role for the invitation.");
        setBusy(true);
        setError("");
        try {
            const result = await api("/org/invitations", { method: "POST", body: form });
            if (result.invited.length) toast.success(`${plural(result.invited.length, "invitation")} sent`, result.invited.join(", "));
            if (result.skipped.length) toast.info("Some emails were skipped", result.skipped.join(", "));
            setForm({ ...form, emails: "" });
            reload();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const cancel = async (invite) => {
        try {
            await api(`/org/invitations/${invite._id}`, { method: "DELETE" });
            toast.success("Invitation cancelled", invite.email);
            reload();
        } catch (e) {
            toast.error("Couldn't cancel", e.message);
        }
    };

    const pending = data?.invitations || [];

    return (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <Panel title="Invite people" description="They'll see the invite when they log in or sign up with that email." className="h-fit">
                <form onSubmit={send} className="space-y-4">
                    <Field label="Email addresses" hint="Separate several with commas or new lines.">
                        <textarea value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} required className="field" placeholder={"name@company.com\nother@company.com"} aria-label="Email addresses" />
                    </Field>
                    <Field label="Role">
                        <Select value={form.roleId} onChange={(roleId) => setForm({ ...form, roleId })} ariaLabel="Role" placeholder="Choose their role"
                            options={invitable.map((r) => ({ value: r._id, label: r.name, icon: "badge", hint: `Level ${r.level}` }))} />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <button disabled={busy} className="btn-primary w-full"><Icon name="send" className="text-[18px]" />{busy ? "Sending…" : "Send invitations"}</button>
                </form>
            </Panel>

            <Panel title="Pending invitations" description="Invitations expire after 7 days.">
                <div className="space-y-2">
                    {pending.length ? pending.map((i) => (
                        <div key={i._id} className="flex items-center gap-3 rounded-xl border border-line bg-inset p-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon name="mail" /></span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-zinc-100">{i.email}</p>
                                <p className="text-xs text-faint">
                                    as <span className="text-primary">{i.role?.name}</span> · by {i.invitedBy?.fullName} · {i.expired ? <span className="text-danger">expired</span> : `expires ${formatDate(i.expiresAt)}`}
                                </p>
                            </div>
                            {i.role && i.role.level > myRole.level && <button onClick={() => cancel(i)} className="btn-ghost btn-sm hover:text-danger">Cancel</button>}
                        </div>
                    )) : <Empty icon="outgoing_mail" title="No pending invitations">Invite your teammates to get started.</Empty>}
                </div>
            </Panel>
        </div>
    );
}

// ---------- Audit log ----------

function AuditTab() {
    const { data, loading } = useApi("/org/audit");
    if (loading) return <Spinner />;
    return (
        <Panel title="Audit log" description="Every change to people, roles and invitations in your organization.">
            {data?.events.length ? (
                <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
                    {data.events.map((e) => (
                        <li key={e._id} className="relative flex gap-4">
                            <Avatar user={e.actor} size="h-8 w-8 text-[10px] ring-4 ring-panel" />
                            <div className="min-w-0 pt-1">
                                <p className="text-[13px] text-zinc-200">{e.text}</p>
                                <p className="mt-0.5 font-mono text-[11px] text-faint">{new Date(e.createdAt).toLocaleString()} · {timeAgo(e.createdAt)}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            ) : <Empty icon="history">No events yet.</Empty>}
        </Panel>
    );
}

// ---------- Settings ----------

function SettingsTab({ onChange }) {
    const { organization, can, isOwner, refresh } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const members = useApi(isOwner ? "/org/members" : null);
    const [form, setForm] = useState({ name: organization.name, description: organization.description || "" });
    const [newOwner, setNewOwner] = useState("");
    const [error, setError] = useState("");

    const save = async (event) => {
        event.preventDefault();
        try {
            await api("/org", { method: "PUT", body: form });
            await refresh();
            toast.success("Organization saved");
            onChange();
        } catch (e) {
            setError(e.message);
        }
    };

    const transfer = async () => {
        const target = members.data.members.find((m) => m.user._id === newOwner);
        if (!target || !confirm(`Make ${target.user.fullName} the Owner? You will take over their current role (${target.role.name}).`)) return;
        try {
            await api("/org/transfer-ownership", { method: "POST", body: { userId: newOwner } });
            await refresh();
            toast.success("Ownership transferred", `${target.user.fullName} is now the Owner.`);
        } catch (e) {
            toast.error("Couldn't transfer", e.message);
        }
    };

    const leave = async () => {
        if (!confirm(`Leave ${organization.name}? You will lose access to all its projects.`)) return;
        try {
            await api("/org/leave", { method: "POST" });
            await refresh();
            navigate("/welcome", { replace: true });
        } catch (e) {
            toast.error("Couldn't leave", e.message);
        }
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
            <Panel title="Organization profile" description={can("org.manage") ? "Shown to everyone in your organization." : "Your role can't edit these details."}>
                <form onSubmit={save} className="space-y-5">
                    <div className="flex items-center gap-4">
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/35 to-accent/15 text-2xl font-semibold text-primary ring-1 ring-primary/25">
                            {form.name[0]?.toUpperCase() || "?"}
                        </span>
                        <div>
                            <p className="font-medium text-white">{form.name || "Organization"}</p>
                            <p className="text-xs text-faint">Created {formatDate(organization.createdAt)}</p>
                        </div>
                    </div>
                    <Field label="Name">
                        <Input icon="corporate_fare" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!can("org.manage")} required maxLength={80} aria-label="Organization name" />
                    </Field>
                    <Field label="Description" hint={`${form.description.length}/250`}>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!can("org.manage")} maxLength={250} className="field" placeholder="What does your organization do?" aria-label="Description" />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    {can("org.manage") && <div className="flex justify-end border-t border-line-soft pt-5"><button className="btn-primary"><Icon name="check" className="text-[18px]" />Save changes</button></div>}
                </form>
            </Panel>

            <div className="space-y-6">
                {isOwner ? (
                    <Panel title="Transfer ownership" description="Hand the Owner role to someone else. You'll take over their current role.">
                        <div className="space-y-3">
                            <Select value={newOwner} onChange={setNewOwner} ariaLabel="New owner" placeholder="Choose a person"
                                options={(members.data?.members || []).filter((m) => !m.role.isSystem).map((m) => ({ value: m.user._id, label: m.user.fullName, user: m.user, hint: m.role.name }))} />
                            <button disabled={!newOwner} onClick={transfer} className="btn-secondary w-full"><Icon name="swap_horiz" className="text-[18px]" />Transfer ownership</button>
                        </div>
                    </Panel>
                ) : (
                    <Panel title="Leave organization" description="You'll lose access to its projects. Projects you lead go to the Owner.">
                        <button onClick={leave} className="btn-danger w-full"><Icon name="logout" className="text-[18px]" />Leave {organization.name}</button>
                    </Panel>
                )}
            </div>
        </div>
    );
}

// ---------- Page ----------

export default function Organization() {
    const { organization, role, can } = useAuth();
    const [params, setParams] = useSearchParams();
    const roles = useApi("/org/roles");
    const summary = useApi("/org");

    const tabs = [
        { value: "people", label: "People", icon: "group", count: summary.data?.counts.members },
        { value: "roles", label: "Roles", icon: "badge", count: summary.data?.counts.roles },
        can("members.invite") && { value: "invitations", label: "Invitations", icon: "mail" },
        { value: "audit", label: "Audit log", icon: "history" },
        { value: "settings", label: "Settings", icon: "tune" }
    ].filter(Boolean);
    const tab = tabs.some((t) => t.value === params.get("tab")) ? params.get("tab") : "people";
    const roleList = roles.data?.roles || [];
    const refreshAll = () => { roles.reload(); summary.reload(); };

    return (
        <>
            <PageHeader eyebrow="Organization" title={organization.name} subtitle={organization.description || "Manage people, roles and permissions."}>
                <span className="chip border-primary/30 bg-primary/10 py-1 text-primary"><Icon name="badge" className="text-[14px]" />You are {role.name}</span>
                {can("members.invite") && <button onClick={() => setParams({ tab: "invitations" })} className="btn-primary"><Icon name="person_add" className="text-[18px]" />Invite people</button>}
            </PageHeader>

            {summary.data && (
                <section className="mt-8 grid grid-cols-3 gap-4">
                    <StatCard label="People" value={summary.data.counts.members} icon="group" tone="primary" />
                    <StatCard label="Roles" value={summary.data.counts.roles} icon="badge" tone="accent" />
                    <StatCard label="Projects" value={summary.data.counts.projects} icon="folder_open" tone="success" />
                </section>
            )}

            <div className="mt-6"><Tabs items={tabs} value={tab} onChange={(t) => setParams({ tab: t })} /></div>

            <div className="mt-6">
                {roles.loading ? <Spinner /> : (
                    <>
                        {tab === "people" && <PeopleTab roles={roleList} onChange={refreshAll} />}
                        {tab === "roles" && <RolesTab roles={roleList} reload={refreshAll} />}
                        {tab === "invitations" && <InvitationsTab roles={roleList} />}
                        {tab === "audit" && <AuditTab />}
                        {tab === "settings" && <SettingsTab onChange={refreshAll} />}
                    </>
                )}
            </div>
        </>
    );
}
