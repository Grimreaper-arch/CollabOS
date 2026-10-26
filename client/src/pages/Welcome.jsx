import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import useApi from "../utils/useApi";
import { ErrorText, Field, Icon, Input, Skeleton } from "../components/ui";
import { formatDate } from "../utils/format";

// First screen for users without an organization: accept an invitation or create one (become Owner).
export default function Welcome() {
    const { user, applySession, logout } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const invites = useApi("/invitations/mine");
    const [form, setForm] = useState({ name: "", description: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async (action) => {
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const createOrg = (event) => {
        event.preventDefault();
        run(async () => {
            applySession(await api("/org", { method: "POST", body: form }));
            toast.success(`Welcome to ${form.name}!`, "You're the Owner. Invite your team from the Organization page.");
            navigate("/dashboard", { replace: true });
        });
    };

    const accept = (invite) => run(async () => {
        applySession(await api(`/invitations/${invite._id}/accept`, { method: "POST" }));
        toast.success(`You joined ${invite.org.name}`, `Your role: ${invite.role.name}`);
        navigate("/dashboard", { replace: true });
    });

    const decline = (id) => run(async () => {
        await api(`/invitations/${id}/decline`, { method: "POST" });
        await invites.reload();
        setBusy(false);
    });

    const list = invites.data?.invitations || [];

    return (
        <div className="relative min-h-screen overflow-hidden px-5 py-10">
            <div className="dot-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
            <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />

            <div className="relative mx-auto max-w-4xl animate-slide-up">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="" className="h-8 w-8" />
                        <span className="text-lg font-semibold tracking-tight">CollabOS</span>
                    </div>
                    <button onClick={logout} className="btn-ghost btn-sm"><Icon name="logout" className="text-base" />Log out</button>
                </div>

                <div className="mt-16 text-center">
                    <span className="chip border-primary/30 bg-primary/10 text-primary"><Icon name="waving_hand" className="text-[14px]" />Almost there</span>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Welcome, {user.fullName.split(" ")[0]}</h1>
                    <p className="mx-auto mt-3 max-w-lg text-[15px] text-muted">Join your team with an invitation, or create a new organization and invite people yourself.</p>
                </div>
                <div className="mt-6 flex justify-center"><ErrorText>{error}</ErrorText></div>

                <div className="mt-10 grid gap-5 md:grid-cols-2">
                    <section className="card p-6">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent"><Icon name="mark_email_unread" /></span>
                        <h2 className="mt-4 text-lg font-semibold text-white">Join your team</h2>
                        <p className="mt-1 text-[13px] text-muted">Invitations sent to <span className="text-zinc-200">{user.email}</span> appear here.</p>
                        <div className="mt-5 space-y-3">
                            {invites.loading ? <Skeleton className="h-28 rounded-xl" /> : list.length ? list.map((inv) => (
                                <div key={inv._id} className="rounded-xl border border-line bg-inset p-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/10 font-semibold text-primary">{inv.org.name[0]}</span>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-white">{inv.org.name}</p>
                                            <p className="text-xs text-faint">{inv.invitedBy?.fullName} invited you · expires {formatDate(inv.expiresAt)}</p>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-[13px] text-muted">Role: <span className="chip border-primary/30 text-primary">{inv.role.name}</span></p>
                                    <div className="mt-4 flex gap-2">
                                        <button disabled={busy} onClick={() => accept(inv)} className="btn-primary btn-sm flex-1"><Icon name="check" className="text-base" />Accept & join</button>
                                        <button disabled={busy} onClick={() => decline(inv._id)} className="btn-secondary btn-sm">Decline</button>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-dashed border-line p-5 text-center">
                                    <Icon name="inbox" className="text-faint" />
                                    <p className="mt-2 text-[13px] text-muted">No invitations yet. Ask your admin to invite <span className="text-zinc-200">{user.email}</span>.</p>
                                    <button onClick={invites.reload} className="btn-ghost btn-sm mt-3"><Icon name="refresh" className="text-base" />Check again</button>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="card p-6">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary"><Icon name="domain_add" /></span>
                        <h2 className="mt-4 text-lg font-semibold text-white">Create an organization</h2>
                        <p className="mt-1 text-[13px] text-muted">You'll be its <span className="text-zinc-200">Owner</span>, with full control over roles, permissions and people.</p>
                        <form onSubmit={createOrg} className="mt-5 space-y-4">
                            <Field label="Organization name">
                                <Input icon="corporate_fare" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="e.g. Acme Corp" aria-label="Organization name" />
                            </Field>
                            <Field label="What does your team do?">
                                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={250} className="field min-h-20" placeholder="Optional" aria-label="Description" />
                            </Field>
                            <button disabled={busy} className="btn-primary w-full">Create organization<Icon name="arrow_forward" className="text-[18px]" /></button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
}
