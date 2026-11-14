import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { Avatar, AvatarStack, Badge, Empty, ErrorText, Field, Icon, Input, Modal, Panel, Select, Skeleton, Spinner, StatCard, Tabs, Toggle } from "../components/ui";
import { formatDate, plural, timeAgo } from "../utils/format";

const GROUP_ICONS = { Organization: "apartment", People: "group", Roles: "badge", Projects: "folder", Tasks: "task_alt", Files: "folder_zip", Billing: "credit_card" };

// ---------- People ----------

function PeopleTab({ roles, members, onChange }) {
    const { user, role: myRole, can } = useAuth();
    const toast = useToast();
    const { data, error, loading, reload } = members;
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");

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

    if (loading && !data) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
    const q = search.trim().toLowerCase();
    const all = data?.members || [];
    const shown = all.filter((m) => `${m.user.fullName} ${m.user.email} ${m.role.name}`.toLowerCase().includes(q) && (roleFilter === "all" || m.role._id === roleFilter));
    const manages = can("members.assign_role") || can("members.remove");
    const columns = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_120px_200px_40px]";

    return (
        <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="sm:w-72"><Input icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email or role" aria-label="Search people" /></div>
                <div className="sm:w-52">
                    <Select value={roleFilter} onChange={setRoleFilter} ariaLabel="Filter by role"
                        options={[{ value: "all", label: "All roles", icon: "badge" }, ...roles.map((r) => ({ value: r._id, label: r.name, hint: String(r.memberCount) }))]} />
                </div>
                <p className="text-[14px] text-faint sm:ml-auto">{manages ? `You can manage people whose role is below yours (${myRole.name}).` : "Your role can view the team but not change it."}</p>
            </div>
            <ErrorText>{error}</ErrorText>

            <div className="rows-card">
                <div className={`hidden gap-x-4 bg-white/[0.015] py-2.5 text-[13px] font-medium text-faint md:grid ${columns}`}>
                    <span>{plural(shown.length, "person", "people")}</span><span>Department</span><span>Joined</span><span>Role</span><span />
                </div>
                {shown.map((m) => (
                    <div key={m._id} className={`grid grid-cols-1 items-center gap-x-4 gap-y-2.5 py-3 transition-colors hover:bg-white/[0.02] ${columns}`}>
                        <div className="flex min-w-0 items-center gap-3">
                            <Avatar user={m.user} size="h-9 w-9 text-[13px]" />
                            <div className="min-w-0">
                                <p className="truncate text-[15px] font-medium text-zinc-100">{m.user.fullName}{m.user._id === user._id && <span className="ml-1.5 rounded bg-white/[0.07] px-1 py-px text-[12px] font-medium text-muted">You</span>}</p>
                                <p className="truncate text-[13.5px] text-faint">{m.user.email}</p>
                            </div>
                        </div>
                        <span className="hidden truncate text-[14px] text-muted md:block">{m.user.department || <span className="text-faint">Not set</span>}</span>
                        <span className="hidden text-[14px] text-muted md:block">{formatDate(m.createdAt)}</span>
                        <div>
                            {can("members.assign_role") && canManage(m) ? (
                                <Select value={m.role._id} onChange={(roleId) => changeRole(m, roleId)} ariaLabel={`Role of ${m.user.fullName}`} className="h-8"
                                    options={assignable.map((r) => ({ value: r._id, label: r.name, hint: `Level ${r.level}` }))} />
                            ) : (
                                <Badge tone={m.role.isSystem ? "amber" : "teal"} icon={m.role.isSystem ? "workspace_premium" : "badge"}>{m.role.name}</Badge>
                            )}
                        </div>
                        <div className="flex md:justify-end">
                            {can("members.remove") && canManage(m) && (
                                <button onClick={() => remove(m)} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${m.user.fullName}`} title="Remove from organization"><Icon name="person_remove" /></button>
                            )}
                        </div>
                    </div>
                ))}
                {!shown.length && <Empty compact icon="person_search" title="Nobody matches">Try a different name or role.</Empty>}
            </div>
        </>
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
    const grantable = groups.flatMap((g) => g.permissions).filter((p) => can(p.key)).length;

    return (
        <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <Field label="Role name">
                    <Input icon="badge" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={40} placeholder="e.g. Team Lead" aria-label="Role name" autoFocus />
                </Field>
                <Field label="Seniority" hint="Lower number = more senior">
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
                    <Badge tone={form.permissions.length ? "teal" : ""}>{form.permissions.length} of {grantable} selected</Badge>
                </div>
                <div className="max-h-[44vh] space-y-3 overflow-y-auto pr-1">
                    {groups.map((g) => {
                        const on = g.permissions.filter((p) => form.permissions.includes(p.key)).length;
                        return (
                            <fieldset key={g.group} className="overflow-hidden rounded-lg border border-line bg-inset">
                                <legend className="sr-only">{g.group}</legend>
                                <p className="flex items-center gap-2 border-b border-line-soft bg-white/[0.02] px-4 py-2.5 text-[14.5px] font-semibold text-zinc-100">
                                    <Icon name={GROUP_ICONS[g.group] || "tune"} className="text-[18px] text-accent" />{g.group}
                                    <span className="ml-auto text-[13px] font-normal text-faint tabular-nums">{on}/{g.permissions.length}</span>
                                </p>
                                <div className="divide-y divide-line-soft">
                                    {g.permissions.map((p) => {
                                        const allowed = can(p.key);
                                        return (
                                            <label key={p.key} className={`flex items-center justify-between gap-4 px-4 py-2.5 transition-colors ${allowed ? "cursor-pointer hover:bg-white/[0.02]" : "cursor-not-allowed opacity-45"}`}
                                                title={allowed ? "" : "You can't grant a permission you don't have"}>
                                                <span>
                                                    <span className="block text-[14.5px] text-zinc-200">{p.label}</span>
                                                    <code className="font-mono text-[12.5px] text-faint">{p.key}</code>
                                                </span>
                                                <Toggle checked={form.permissions.includes(p.key)} onChange={() => allowed && toggle(p.key)} label={p.label} />
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        );
                    })}
                </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
                <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
                <button className="btn-primary"><Icon name="check" className="text-[17px]" />{role ? "Save role" : "Create role"}</button>
            </div>
        </form>
    );
}

function RolesTab({ roles, reload }) {
    const { can, role: myRole } = useAuth();
    const toast = useToast();
    const catalog = useApi("/org/permissions");
    const [editing, setEditing] = useState(null); // null = closed, {} = new, role = edit
    const [expanded, setExpanded] = useState(null);

    const groups = catalog.data?.groups || [];
    const total = groups.reduce((sum, g) => sum + g.permissions.length, 0);

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
                <p className="max-w-xl text-[14.5px] text-muted">Roles are ranked by seniority, most senior first. People can only manage roles below their own, and can't grant a permission they don't have.</p>
                {can("roles.manage") && <button onClick={() => setEditing({})} className="btn-primary"><Icon name="add" className="text-[18px]" />New role</button>}
            </div>

            {/* The hierarchy as a ladder: one rung per role, most senior at the top. */}
            <ol className="relative space-y-3 before:absolute before:top-6 before:bottom-6 before:left-[19px] before:w-px before:bg-line">
                {roles.map((r) => {
                    const full = total > 0 && r.permissions.length === total;
                    const mine = r._id === myRole._id;
                    const open = expanded === r._id;
                    return (
                        <li key={r._id} className="relative flex gap-4">
                            <span className={`relative z-[1] flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-full border text-[11.5px] leading-none font-semibold ${r.isSystem ? "border-warning/40 bg-[#2a2416] text-warning" : mine ? "border-accent/50 bg-[#10302d] text-accent" : "border-line bg-panel text-muted"}`} title={`Seniority level ${r.level}`}>
                                <span className="text-[10px] font-medium opacity-70">LVL</span>{r.level}
                            </span>
                            <article className={`card min-w-0 flex-1 ${mine ? "border-accent/30" : ""}`}>
                                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="text-[15.5px] font-semibold text-ink">{r.name}</h4>
                                            {r.isSystem && <Badge tone="amber" icon="workspace_premium">Owner</Badge>}
                                            {!r.isSystem && r.isCustom && <Badge>Custom</Badge>}
                                            {mine && <Badge tone="teal">Your role</Badge>}
                                        </div>
                                        <p className="mt-0.5 text-[14.5px] text-muted">{r.description || "No description"}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-5">
                                        <div className="text-right">
                                            <p className="text-[14.5px] font-semibold text-zinc-100 tabular-nums">{plural(r.memberCount, "person", "people")}</p>
                                            <p className="text-[13px] text-faint">hold this role</p>
                                        </div>
                                        <div className="w-36">
                                            <div className="mb-1 flex justify-between text-[13px]"><span className="text-faint">Permissions</span><span className="font-medium text-zinc-300 tabular-nums">{full ? "All" : `${r.permissions.length}/${total}`}</span></div>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${full ? "bg-warning" : "bg-gradient-to-r from-accent to-success"}`} style={{ width: `${total ? (r.permissions.length / total) * 100 : 0}%` }} /></div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => setExpanded(open ? null : r._id)} className={`btn-icon ${open ? "bg-white/[0.07] text-white" : ""}`} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} permissions of ${r.name}`} title="Show permissions"><Icon name={open ? "expand_less" : "expand_more"} /></button>
                                            {can("roles.manage") && r.manageable && (
                                                <>
                                                    <button onClick={() => setEditing(r)} className="btn-icon" aria-label={`Edit ${r.name}`} title="Edit role"><Icon name="edit" className="text-[18px]" /></button>
                                                    <button onClick={() => remove(r)} className="btn-icon hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${r.name}`} title="Delete role"><Icon name="delete" className="text-[18px]" /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {open && (
                                    <div className="grid gap-x-6 gap-y-4 border-t border-line-soft p-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {groups.map((g) => (
                                            <div key={g.group}>
                                                <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-zinc-200"><Icon name={GROUP_ICONS[g.group] || "tune"} className="text-[16px] text-faint" />{g.group}</p>
                                                <ul className="space-y-1">
                                                    {g.permissions.map((p) => {
                                                        const has = r.permissions.includes(p.key);
                                                        return (
                                                            <li key={p.key} className={`flex items-start gap-1.5 text-[14px] ${has ? "text-zinc-300" : "text-faint/70"}`}>
                                                                <Icon name={has ? "check" : "remove"} className={`mt-px text-[15px] ${has ? "text-success" : "text-faint/50"}`} />{p.label}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        ))}
                                        {!r.permissions.length && <p className="text-[14px] text-faint sm:col-span-2 xl:col-span-3">Basic access only: own tasks, comments and messages.</p>}
                                    </div>
                                )}
                            </article>
                        </li>
                    );
                })}
            </ol>

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
            toast.success("Invitation revoked", invite.email);
            reload();
        } catch (e) {
            toast.error("Couldn't revoke", e.message);
        }
    };

    const pending = data?.invitations || [];
    const count = form.emails.split(/[\s,;]+/).filter((e) => e.includes("@")).length;

    return (
        <div className="grid items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
            <Panel title="Invite people" icon="person_add" description="They join in one click from the email, or when they sign in with that address.">
                <form onSubmit={send} className="space-y-4">
                    <Field label="Email addresses" hint="Separate several with commas or new lines.">
                        <textarea value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} required className="field" placeholder={"name@company.com\nother@company.com"} aria-label="Email addresses" />
                    </Field>
                    <Field label="Role" hint="You can invite people to roles below your own.">
                        <Select value={form.roleId} onChange={(roleId) => setForm({ ...form, roleId })} ariaLabel="Role" placeholder="Choose their role"
                            options={invitable.map((r) => ({ value: r._id, label: r.name, icon: "badge", hint: `Level ${r.level}` }))} />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <button disabled={busy} className="btn-primary w-full"><Icon name="send" className="text-[17px]" />{busy ? "Sending…" : count > 1 ? `Send ${count} invitations` : "Send invitation"}</button>
                </form>
            </Panel>

            <Panel title="Pending invitations" icon="outgoing_mail" description="Invitations expire after 7 days." bodyClassName="px-4 py-1.5" action={pending.length > 0 && <Badge>{pending.length}</Badge>}>
                <div className="rows">
                    {pending.length ? pending.map((i) => (
                        <div key={i._id} className="flex items-center gap-3 py-2.5">
                            <span className={`tile ${i.expired ? "tile-red" : "tile-teal"}`}><Icon name={i.expired ? "mail_off" : "mail"} /></span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[15px] font-medium text-zinc-100">{i.email}</p>
                                <p className="truncate text-[13.5px] text-faint">Invited by {i.invitedBy?.fullName} · {timeAgo(i.createdAt)}</p>
                            </div>
                            <span className="hidden sm:block"><Badge tone="teal" icon="badge">{i.role?.name || "Role removed"}</Badge></span>
                            {i.expired ? <Badge tone="red" dot>Expired</Badge> : <Badge tone="amber" dot>Expires {formatDate(i.expiresAt)}</Badge>}
                            {i.role && i.role.level > myRole.level && <button onClick={() => cancel(i)} className="btn-ghost btn-sm hover:text-danger">Revoke</button>}
                        </div>
                    )) : <Empty compact icon="outgoing_mail" title="No pending invitations">People you invite appear here until they accept.</Empty>}
                </div>
            </Panel>
        </div>
    );
}

// ---------- Audit log ----------

// What kind of change an audit entry describes, read from its wording.
const AUDIT_KINDS = [
    [/invit/i, "Invitation", "mail", "tile-teal"],
    [/removed|left the organization|deleted/i, "Removal", "person_remove", "tile-red"],
    [/ownership|owner/i, "Ownership", "workspace_premium", "tile-amber"],
    [/role/i, "Role", "badge", "tile-steel"],
    [/plan|upgrad|payment|billing/i, "Billing", "credit_card", "tile-green"],
    [/joined|accepted/i, "Joined", "person_add", "tile-green"]
];
const auditKind = (text) => AUDIT_KINDS.find(([pattern]) => pattern.test(text)) || [null, "Organization", "apartment", ""];

function AuditTab() {
    const { data, loading } = useApi("/org/audit");
    const [filter, setFilter] = useState("all");
    if (loading && !data) return <Spinner />;
    const events = (data?.events || []).map((e) => { const [, label, icon, tile] = auditKind(e.text); return { ...e, label, icon, tile }; });
    const kinds = [...new Set(events.map((e) => e.label))];
    const shown = events.filter((e) => filter === "all" || e.label === filter);
    const dayOf = (date) => new Date(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    return (
        <Panel title="Audit log" icon="history" bodyClassName="p-0"
            description={`Changes to people, roles, invitations and settings${data?.historyDays ? `, kept for ${data.historyDays} days on your plan` : ""}.`}
            action={kinds.length > 1 && <div className="w-44"><Select value={filter} onChange={setFilter} ariaLabel="Filter by type" className="h-8" options={[{ value: "all", label: "All activity" }, ...kinds.map((k) => ({ value: k, label: k }))]} /></div>}>
            {shown.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                        <thead className="border-b border-line-soft bg-white/[0.015] text-[13px] text-faint">
                            <tr>{["Type", "What happened", "By", "When"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                            {shown.map((e, i) => (
                                <tr key={e._id} className="transition-colors hover:bg-white/[0.02]">
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                        <span className="flex items-center gap-2.5"><span className={`tile h-7 w-7 rounded-md ${e.tile}`}><Icon name={e.icon} className="text-[16px]" /></span><span className="text-[14px] text-zinc-300">{e.label}</span></span>
                                    </td>
                                    <td className="px-4 py-2.5 text-[14.5px] text-zinc-200">{e.text}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="flex items-center gap-2 text-[14px] text-muted"><Avatar user={e.actor} size="h-5 w-5 text-[9.5px]" />{e.actor?.fullName || "Someone"}</span></td>
                                    <td className="px-4 py-2.5 text-[13.5px] whitespace-nowrap text-faint tabular-nums" title={dayOf(e.createdAt)}>
                                        {(i === 0 || dayOf(shown[i - 1].createdAt) !== dayOf(e.createdAt)) ? new Date(e.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <Empty icon="history" title="Nothing recorded yet">Role changes, invitations and removals will be listed here.</Empty>}
        </Panel>
    );
}

// ---------- Settings ----------

function SettingsTab({ onChange }) {
    const { organization, can, isOwner, refresh, applySession } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const members = useApi(isOwner ? "/org/members" : null);
    const [form, setForm] = useState({ name: organization.name, description: organization.description || "" });
    const [newOwner, setNewOwner] = useState("");
    const [confirmName, setConfirmName] = useState("");
    const [error, setError] = useState("");

    // After leaving or deleting, the server switches to another organization if there is one.
    const goToNextOrg = (session) => {
        applySession(session);
        navigate(session.organization ? "/dashboard" : "/welcome", { replace: true });
    };

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
            const session = await api("/org/leave", { method: "POST" });
            toast.success(`You left ${organization.name}`);
            goToNextOrg(session);
        } catch (e) {
            toast.error("Couldn't leave", e.message);
        }
    };

    const deleteOrg = async () => {
        try {
            const session = await api("/org", { method: "DELETE", body: { confirmName } });
            toast.success(`${organization.name} was deleted`);
            goToNextOrg(session);
        } catch (e) {
            toast.error("Couldn't delete", e.message);
        }
    };

    const dirty = form.name !== organization.name || form.description !== (organization.description || "");

    return (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Panel title="Organization profile" icon="apartment" description={can("org.manage") ? "Shown to everyone in your organization." : "Your role can view these details but not edit them."}>
                <form onSubmit={save} className="space-y-5">
                    <Field label="Name">
                        <Input icon="apartment" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!can("org.manage")} required maxLength={80} aria-label="Organization name" />
                    </Field>
                    <Field label="Description" hint={`${form.description.length}/250`}>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!can("org.manage")} maxLength={250} className="field" placeholder="What does your organization do?" aria-label="Description" />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    {can("org.manage") && (
                        <div className="flex items-center justify-between border-t border-line-soft pt-4">
                            <p className="text-[13.5px] text-faint">Created {formatDate(organization.createdAt)}</p>
                            <button disabled={!dirty} className="btn-primary"><Icon name="check" className="text-[17px]" />Save changes</button>
                        </div>
                    )}
                </form>
            </Panel>

            <div className="space-y-4">
                {isOwner ? (
                    <Panel title="Transfer ownership" icon="swap_horiz" description="Hand the Owner role to someone else. You'll take over their current role.">
                        <div className="space-y-3">
                            <Select value={newOwner} onChange={setNewOwner} ariaLabel="New owner" placeholder="Choose a person"
                                options={(members.data?.members || []).filter((m) => !m.role.isSystem).map((m) => ({ value: m.user._id, label: m.user.fullName, user: m.user, hint: m.role.name }))} />
                            <button disabled={!newOwner} onClick={transfer} className="btn-secondary w-full"><Icon name="swap_horiz" className="text-[17px]" />Transfer ownership</button>
                        </div>
                    </Panel>
                ) : (
                    <section className="card border-danger/25">
                        <div className="border-b border-danger/15 px-4 py-3"><h3 className="flex items-center gap-2 text-[15px] font-semibold text-danger"><Icon name="warning" className="text-[18px]" />Leave organization</h3></div>
                        <div className="space-y-3 p-4">
                            <p className="text-[14.5px] text-muted">You'll lose access to its projects. Projects you lead go to the Owner.</p>
                            <button onClick={leave} className="btn-danger w-full"><Icon name="logout" className="text-[17px]" />Leave {organization.name}</button>
                        </div>
                    </section>
                )}
                {isOwner && (
                    <section className="card border-danger/25">
                        <div className="border-b border-danger/15 px-4 py-3"><h3 className="flex items-center gap-2 text-[15px] font-semibold text-danger"><Icon name="warning" className="text-[18px]" />Delete organization</h3></div>
                        <div className="space-y-3 p-4">
                            <p className="text-[14.5px] text-muted">Permanently deletes every project, task, file, message and role in it. People keep their accounts. This can't be undone.</p>
                            <Field label={<>Type <span className="font-semibold text-zinc-100">{organization.name}</span> to confirm</>}>
                                <Input icon="warning" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={organization.name} aria-label="Organization name to confirm" />
                            </Field>
                            <button disabled={confirmName !== organization.name} onClick={deleteOrg} className="btn-danger w-full"><Icon name="delete_forever" className="text-[17px]" />Delete {organization.name}</button>
                        </div>
                    </section>
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
    const members = useApi("/org/members");

    const counts = summary.data?.counts;
    const tabs = [
        { value: "people", label: "People", icon: "group", count: counts?.members },
        { value: "roles", label: "Roles", icon: "badge", count: counts?.roles },
        can("members.invite") && { value: "invitations", label: "Invitations", icon: "mail" },
        { value: "audit", label: "Audit log", icon: "history" },
        { value: "settings", label: "Settings", icon: "tune" }
    ].filter(Boolean);
    const tab = tabs.some((t) => t.value === params.get("tab")) ? params.get("tab") : "people";
    const roleList = roles.data?.roles || [];
    const refreshAll = () => { roles.reload(); summary.reload(); members.reload(); };
    const everyone = members.data?.members || [];
    const owner = everyone.find((m) => m.role.isSystem)?.user;
    const customRoles = roleList.filter((r) => r.isCustom).length;
    const planName = organization.plan?.name || "Starter";

    return (
        <>
            {/* Identity */}
            <header className="card relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: "radial-gradient(480px 200px at 0% 0%, rgb(54 198 181 / 0.13), transparent 70%)" }} />
                <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-[#2a9d7c] text-[28px] font-bold text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
                        {organization.name.trim()[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-[26px] leading-tight font-semibold text-ink">{organization.name}</h1>
                            <Badge tone={planName === "Starter" ? "steel" : "green"} dot>{planName} plan</Badge>
                        </div>
                        <p className="mt-1 max-w-2xl text-[15px] text-muted">{organization.description || "Manage people, roles and permissions for your organization."}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-muted">
                            {owner && <span className="inline-flex items-center gap-2"><Avatar user={owner} size="h-5 w-5 text-[9.5px]" />Owned by <span className="font-medium text-zinc-200">{owner.fullName}</span></span>}
                            <span className="inline-flex items-center gap-1.5"><Icon name="event" className="text-[15px] text-faint" />Created {formatDate(organization.createdAt)}</span>
                            <span className="inline-flex items-center gap-1.5"><Icon name="badge" className="text-[15px] text-faint" />You are <span className="font-medium text-accent">{role.name}</span></span>
                        </div>
                    </div>
                    {can("members.invite") && <button onClick={() => setParams({ tab: "invitations" })} className="btn-primary shrink-0"><Icon name="person_add" className="text-[18px]" />Invite people</button>}
                </div>
            </header>

            <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="People" value={counts?.members ?? "–"} icon="group" tone="primary" hint="Members of this organization"
                    visual={everyone.length > 0 && <AvatarStack users={everyone.map((m) => m.user)} max={4} size="h-7 w-7 text-[11.5px]" />} />
                <StatCard label="Roles" value={counts?.roles ?? "–"} icon="badge" tone="steel" hint={roleList.length ? `${roleList.length - customRoles} built-in · ${customRoles} custom` : " "} />
                <StatCard label="Projects" value={counts?.projects ?? "–"} icon="folder" tone="success" hint="Across the whole organization" />
            </section>

            <div className="mt-6"><Tabs items={tabs} value={tab} onChange={(t) => setParams({ tab: t })} /></div>

            <div className="mt-5">
                {roles.loading && !roles.data ? <Spinner /> : (
                    <>
                        {tab === "people" && <PeopleTab roles={roleList} members={members} onChange={refreshAll} />}
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
