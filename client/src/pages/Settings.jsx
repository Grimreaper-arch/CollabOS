import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PasswordInput } from "../components/AuthLayout";
import { Avatar, ErrorText, Field, Icon, Input, PageHeader, Panel, Toggle } from "../components/ui";
import { formatDate } from "../utils/format";
import { desktopAlertsEnabled, desktopAlertsSupported, disableDesktopAlerts, enableDesktopAlerts } from "../utils/desktopAlerts";

const FIELDS = [
    ["fullName", "Full name", "text", "person"],
    ["email", "Email address", "email", "mail"],
    ["institution", "Company / institution", "text", "apartment"],
    ["department", "Department / team", "text", "groups"],
    ["phone", "Phone number", "tel", "call"]
];

function ProfileHeader() {
    const { user, role, organization, setUser } = useAuth();
    const toast = useToast();
    const fileInput = useRef(null);
    const [busy, setBusy] = useState(false);

    // Sends the image as multipart/form-data; Multer saves it on the server.
    const uploadAvatar = async (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        const form = new FormData();
        form.append("avatar", file);
        setBusy(true);
        try {
            const data = await api("/users/me/avatar", { method: "POST", form });
            setUser(data.user);
            toast.success("Profile photo updated");
        } catch (e) {
            toast.error("Upload failed", e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="card overflow-hidden">
            <div className="dot-bg relative h-28 bg-gradient-to-r from-primary/25 via-[#6d5dfc]/10 to-accent/20">
                <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent" />
            </div>
            <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end">
                <div className="relative -mt-12 w-fit">
                    <Avatar user={user} size="h-24 w-24 text-2xl ring-4 ring-panel" />
                    <button onClick={() => fileInput.current.click()} disabled={busy} aria-label="Change profile photo"
                        className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-raised text-zinc-200 shadow-lg transition hover:bg-primary hover:text-primary-ink">
                        <Icon name={busy ? "progress_activity" : "photo_camera"} className={`text-[16px] ${busy ? "animate-spin" : ""}`} />
                    </button>
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={uploadAvatar} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-semibold tracking-tight text-white">{user.fullName}</h2>
                    <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="chip border-primary/30 bg-primary/10 text-primary"><Icon name="badge" className="text-[14px]" />{role?.name}</span>
                    <span className="chip"><Icon name="corporate_fare" className="text-[14px]" />{organization?.name}</span>
                    <span className="chip"><Icon name="cake" className="text-[14px]" />Joined {formatDate(user.createdAt)}</span>
                </div>
            </div>
        </section>
    );
}

function ProfileForm() {
    const { user, setUser } = useAuth();
    const toast = useToast();
    const [form, setForm] = useState(() => Object.fromEntries([...FIELDS.map(([k]) => [k, user[k] || ""]), ["bio", user.bio || ""]]));
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const save = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const data = await api("/users/me", { method: "PUT", body: form });
            setUser(data.user);
            toast.success("Profile saved");
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel title="Personal information" description="This is how other people in your organization see you.">
            <form onSubmit={save} className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                    {FIELDS.map(([name, label, type, icon]) => (
                        <Field key={name} label={label} className={name === "phone" ? "md:col-span-2" : ""}>
                            <Input icon={icon} name={name} type={type} aria-label={label} value={form[name]} onChange={update} required={name === "fullName" || name === "email"} />
                        </Field>
                    ))}
                </div>
                <Field label="Bio" hint={`${form.bio.length}/250`}>
                    <textarea name="bio" value={form.bio} onChange={update} maxLength={250} className="field" placeholder="A short introduction: what you work on, what you're good at…" />
                </Field>
                <ErrorText>{error}</ErrorText>
                <div className="flex justify-end border-t border-line-soft pt-5">
                    <button disabled={busy} className="btn-primary"><Icon name="check" className="text-[18px]" />{busy ? "Saving…" : "Save changes"}</button>
                </div>
            </form>
        </Panel>
    );
}

function PasswordForm() {
    const toast = useToast();
    const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
    const [error, setError] = useState("");
    const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(form.newPassword)).length);

    const save = async (event) => {
        event.preventDefault();
        setError("");
        try {
            await api("/users/me/password", { method: "PUT", body: form });
            setForm({ currentPassword: "", newPassword: "" });
            toast.success("Password updated");
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <Panel title="Security" description="Change your password.">
            <form onSubmit={save} className="space-y-4">
                <Field label="Current password">
                    <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={update} />
                </Field>
                <Field label="New password">
                    <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={update} placeholder="At least 8 characters" />
                    {form.newPassword && (
                        <div className="mt-2 flex items-center gap-2">
                            <div className="flex flex-1 gap-1">
                                {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? ["bg-danger", "bg-warning", "bg-accent", "bg-success"][strength - 1] : "bg-white/[0.08]"}`} />)}
                            </div>
                            <span className="text-xs text-faint">{["Too weak", "Weak", "Okay", "Good", "Strong"][strength]}</span>
                        </div>
                    )}
                </Field>
                <ErrorText>{error}</ErrorText>
                <button className="btn-secondary w-full"><Icon name="lock_reset" className="text-[18px]" />Update password</button>
            </form>
        </Panel>
    );
}

function NotificationPrefs() {
    const toast = useToast();
    const [alerts, setAlerts] = useState(desktopAlertsEnabled());

    const toggle = async (on) => {
        if (!on) { disableDesktopAlerts(); setAlerts(false); return; }
        const granted = await enableDesktopAlerts();
        setAlerts(granted);
        if (!granted) toast.error("Alerts blocked", "Allow notifications for this site in your browser settings.");
    };

    return (
        <Panel title="Notifications">
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-zinc-200">Desktop alerts</p>
                        <p className="mt-0.5 text-[13px] text-muted">{desktopAlertsSupported() ? "Pop-ups for new notifications and due dates, even when this tab is in the background." : "Not supported in this browser."}</p>
                    </div>
                    <Toggle checked={alerts} onChange={toggle} label="Desktop alerts" />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-line-soft pt-4">
                    <div>
                        <p className="text-sm font-medium text-zinc-200">Due-date reminders</p>
                        <p className="mt-0.5 text-[13px] text-muted">Sent the day before a task is due and when it becomes overdue.</p>
                    </div>
                    <span className="chip border-success/30 text-success">Always on</span>
                </div>
            </div>
        </Panel>
    );
}

export default function Settings() {
    const { logout } = useAuth();
    const navigate = useNavigate();

    return (
        <>
            <PageHeader eyebrow="Account" title="Settings" subtitle="Manage your profile, security and notifications." />
            <div className="mt-8 space-y-6">
                <ProfileHeader />
                <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
                    <ProfileForm />
                    <div className="space-y-6">
                        <PasswordForm />
                        <NotificationPrefs />
                        <Panel title="Session">
                            <div className="flex items-center justify-between gap-4">
                                <p className="text-[13px] text-muted">Sign out of CollabOS on this device.</p>
                                <button onClick={() => { logout(); navigate("/login"); }} className="btn-danger btn-sm"><Icon name="logout" className="text-[18px]" />Log out</button>
                            </div>
                        </Panel>
                    </div>
                </div>
            </div>
        </>
    );
}
