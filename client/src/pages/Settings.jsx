import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { PasswordInput } from "../components/AuthLayout";
import { Avatar, Badge, ErrorText, Field, Icon, Input, PageHeader, Toggle } from "../components/ui";
import { formatDate } from "../utils/format";
import { desktopAlertsEnabled, desktopAlertsSupported, disableDesktopAlerts, enableDesktopAlerts } from "../utils/desktopAlerts";

const FIELDS = [
    ["fullName", "Full name", "text", "person"],
    ["email", "Email address", "email", "mail"],
    ["institution", "Company / institution", "text", "apartment"],
    ["department", "Department / team", "text", "groups"],
    ["phone", "Phone number", "tel", "call"]
];

const SECTIONS = [
    ["profile", "Profile", "person"],
    ["security", "Security", "lock"],
    ["notifications", "Notifications", "notifications"],
    ["sessions", "Sessions", "devices"]
];

// A titled block of settings with its explanation on the left (on wide screens).
function Section({ id, title, description, children }) {
    return (
        <section id={id} className="scroll-mt-20 grid gap-x-8 gap-y-4 border-t border-line-soft py-7 first:border-0 first:pt-0 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
                <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
                <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{description}</p>
            </div>
            <div className="min-w-0">{children}</div>
        </section>
    );
}

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

    const facts = [
        ["apartment", "Organization", organization?.name],
        ["badge", "Role", role?.name],
        ["event", "Joined", formatDate(user.createdAt)]
    ];

    return (
        <section className="card relative overflow-hidden">
            <div className="h-20" aria-hidden="true" style={{ background: "linear-gradient(110deg, rgb(54 198 181 / 0.22), rgb(67 201 130 / 0.08) 45%, transparent 80%)" }} />
            <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
                <div className="relative -mt-10 w-fit">
                    <Avatar user={user} size="h-20 w-20 text-2xl ring-4 ring-panel" />
                    <button onClick={() => fileInput.current.click()} disabled={busy} aria-label="Change profile photo" title="Change profile photo"
                        className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-raised text-zinc-200 shadow-lg transition-colors hover:border-accent/50 hover:text-accent">
                        <Icon name={busy ? "progress_activity" : "photo_camera"} className={`text-[16px] ${busy ? "animate-spin" : ""}`} />
                    </button>
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={uploadAvatar} />
                </div>
                <div className="min-w-0 flex-1 sm:pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-[21px] font-semibold text-ink">{user.fullName}</h2>
                        <Badge tone="green" icon="verified">Verified</Badge>
                    </div>
                    <p className="truncate text-[14.5px] text-muted">{user.email}</p>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 sm:pb-1">
                    {facts.map(([icon, label, value]) => (
                        <div key={label}>
                            <dt className="flex items-center gap-1 text-[13px] text-faint"><Icon name={icon} className="text-[14.5px]" />{label}</dt>
                            <dd className="mt-0.5 text-[14.5px] font-medium text-zinc-100">{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}

function ProfileForm() {
    const { user, setUser } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const initial = () => Object.fromEntries([...FIELDS.map(([k]) => [k, user[k] || ""]), ["bio", user.bio || ""]]);
    const [form, setForm] = useState(initial);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const dirty = Object.entries(initial()).some(([k, v]) => form[k] !== v);
    const emailChanged = form.email.trim().toLowerCase() !== user.email;

    const save = async (event) => {
        event.preventDefault();
        if (emailChanged && !confirm(`Change your email to ${form.email}? We'll send a code there, and you'll need to verify it before you can keep using CollabOS.`)) return;
        setBusy(true);
        setError("");
        try {
            const data = await api("/users/me", { method: "PUT", body: form });
            setUser(data.user);
            if (data.emailChanged) {
                toast.success("Verify your new email", `We sent a code to ${data.user.email}.`);
                navigate("/verify-email");
                return;
            }
            toast.success("Profile saved");
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={save} className="card p-5">
            <div className="grid gap-5 md:grid-cols-2">
                {FIELDS.map(([name, label, type, icon]) => (
                    <Field key={name} label={label} className={name === "phone" ? "md:col-span-2 md:max-w-[calc(50%-0.625rem)]" : ""}
                        hint={name === "email" && emailChanged ? "You'll be asked to verify the new address with a code." : undefined}>
                        <Input icon={icon} name={name} type={type} aria-label={label} value={form[name]} onChange={update} required={name === "fullName" || name === "email"} />
                    </Field>
                ))}
            </div>
            <Field label="Bio" hint={`${form.bio.length}/250 · shown to people in your organization`} className="mt-5">
                <textarea name="bio" value={form.bio} onChange={update} maxLength={250} className="field" placeholder="A short introduction: what you work on, what you're good at…" aria-label="Bio" />
            </Field>
            <div className="mt-3"><ErrorText>{error}</ErrorText></div>
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-line-soft pt-4">
                {dirty && <button type="button" onClick={() => setForm(initial())} className="btn-ghost">Discard</button>}
                <button disabled={busy || !dirty} className="btn-primary"><Icon name="check" className="text-[17px]" />{busy ? "Saving…" : "Save changes"}</button>
            </div>
        </form>
    );
}

const RULES = [
    ["At least 8 characters", /.{8,}/],
    ["A letter", /[A-Za-z]/],
    ["A number", /\d/]
];

function PasswordForm() {
    const toast = useToast();
    const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
    const [error, setError] = useState("");
    const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(form.newPassword)).length);
    const meets = RULES.every(([, rule]) => rule.test(form.newPassword));

    const save = async (event) => {
        event.preventDefault();
        setError("");
        try {
            const data = await api("/users/me/password", { method: "PUT", body: form });
            // The password change signs out other devices; this one keeps working with a new token.
            setToken(data.token);
            setForm({ currentPassword: "", newPassword: "" });
            toast.success("Password updated", "Other devices have been signed out.");
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <form onSubmit={save} className="card p-5">
            <div className="grid gap-5 md:grid-cols-2">
                <Field label="Current password">
                    <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" value={form.currentPassword} onChange={update} />
                </Field>
                <Field label="New password">
                    <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={update} placeholder="Choose a new password" />
                </Field>
            </div>
            <div className="mt-4 grid gap-4 rounded-lg border border-line bg-inset p-3.5 md:grid-cols-2">
                <div>
                    <p className="mb-2 text-[13.5px] font-medium text-zinc-300">Requirements</p>
                    <ul className="space-y-1.5">
                        {RULES.map(([label, rule]) => {
                            const ok = rule.test(form.newPassword);
                            return <li key={label} className={`flex items-center gap-2 text-[14px] ${ok ? "text-success" : "text-faint"}`}><Icon name={ok ? "check_circle" : "radio_button_unchecked"} fill={ok} className="text-[16px]" />{label}</li>;
                        })}
                    </ul>
                </div>
                <div>
                    <p className="mb-2 flex justify-between text-[13.5px] font-medium text-zinc-300">Strength<span className="font-normal text-muted">{form.newPassword ? ["Too weak", "Weak", "Okay", "Good", "Strong"][strength] : "Not set"}</span></p>
                    <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${form.newPassword && i < strength ? ["bg-danger", "bg-warning", "bg-accent", "bg-success"][strength - 1] : "bg-white/[0.08]"}`} />)}
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-faint">Mixing capitals and symbols makes it stronger. Changing your password signs out your other devices.</p>
                </div>
            </div>
            <div className="mt-3"><ErrorText>{error}</ErrorText></div>
            <div className="mt-5 flex justify-end border-t border-line-soft pt-4">
                <button disabled={!form.currentPassword || !meets} className="btn-primary"><Icon name="lock_reset" className="text-[17px]" />Update password</button>
            </div>
        </form>
    );
}

function SettingRow({ icon, title, description, children, tone = "" }) {
    return (
        <div className="flex items-start gap-3.5 px-5 py-4">
            <span className={`tile ${tone}`}><Icon name={icon} className="text-[20px]" /></span>
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-zinc-100">{title}</p>
                <p className="mt-0.5 text-[14.5px] leading-relaxed text-muted">{description}</p>
            </div>
            <div className="shrink-0 pt-1">{children}</div>
        </div>
    );
}

function NotificationPrefs() {
    const { user, setUser } = useAuth();
    const toast = useToast();
    const [alerts, setAlerts] = useState(desktopAlertsEnabled());
    const emailOn = user.emailReminders !== false;

    const toggleEmail = async (on) => {
        try {
            const data = await api("/users/me", { method: "PUT", body: { emailReminders: on } });
            setUser(data.user);
            toast.success(on ? "Email reminders on" : "Email reminders off");
        } catch (e) {
            toast.error("Couldn't save", e.message);
        }
    };

    const toggle = async (on) => {
        if (!on) { disableDesktopAlerts(); setAlerts(false); return; }
        const granted = await enableDesktopAlerts();
        setAlerts(granted);
        if (granted) toast.success("Desktop alerts on");
        else toast.error("Alerts blocked", "Allow notifications for this site in your browser settings.");
    };

    return (
        <div className="card divide-y divide-line-soft">
            <SettingRow icon={alerts ? "notifications_active" : "notifications_off"} tone={alerts ? "tile-teal" : ""} title="Desktop alerts"
                description={desktopAlertsSupported() ? "Pop-ups for new notifications and due dates, even when this tab is in the background. Saved for this browser only." : "Not supported in this browser."}>
                <span className="flex items-center gap-2.5"><span className={`text-[13.5px] ${alerts ? "text-success" : "text-faint"}`}>{alerts ? "On" : "Off"}</span><Toggle checked={alerts} onChange={toggle} label="Desktop alerts" /></span>
            </SettingRow>
            <SettingRow icon="alarm" tone="tile-green" title="Due-date reminders"
                description="A notification inside CollabOS the day before a task is due, and again when it becomes overdue.">
                <Badge tone="green" icon="lock">Always on</Badge>
            </SettingRow>
            <SettingRow icon="mail" tone={emailOn ? "tile-teal" : ""} title="Email reminders"
                description={<>The same due-date reminders, also sent to <span className="font-medium text-zinc-200">{user.email}</span>.</>}>
                <span className="flex items-center gap-2.5"><span className={`text-[13.5px] ${emailOn ? "text-success" : "text-faint"}`}>{emailOn ? "On" : "Off"}</span><Toggle checked={emailOn} onChange={toggleEmail} label="Email reminders" /></span>
            </SettingRow>
        </div>
    );
}

function SessionPanel() {
    const { logout } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const signOutEverywhere = async () => {
        if (!confirm("Sign out of CollabOS on every device, including this one?")) return;
        try {
            await api("/auth/logout-all", { method: "POST" });
            logout();
            navigate("/login");
        } catch (e) {
            toast.error("Couldn't sign out", e.message);
        }
    };

    return (
        <div className="card divide-y divide-line-soft">
            <SettingRow icon="logout" title="This device" description="Sign out of CollabOS in this browser. Your other devices stay signed in.">
                <button onClick={() => { logout(); navigate("/login"); }} className="btn-secondary btn-sm">Log out</button>
            </SettingRow>
            <SettingRow icon="devices" tone="tile-red" title="Every device" description="Lost a device or used a shared computer? End every session at once, including this one.">
                <button onClick={signOutEverywhere} className="btn-danger btn-sm">Sign out everywhere</button>
            </SettingRow>
        </div>
    );
}

export default function Settings() {
    return (
        <>
            <PageHeader title="Settings" subtitle="Your profile, password, notifications and sessions. These apply to your account in every organization." />
            <div className="mt-6"><ProfileHeader /></div>

            <nav className="sticky top-14 z-20 -mx-1 mt-4 flex gap-1 overflow-x-auto bg-page/85 px-1 py-2 backdrop-blur-md" aria-label="Settings sections">
                {SECTIONS.map(([id, label, icon]) => (
                    <a key={id} href={`#${id}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white/[0.02] px-3 text-[14px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-white">
                        <Icon name={icon} className="text-[16px]" />{label}
                    </a>
                ))}
            </nav>

            <div className="mt-4">
                <Section id="profile" title="Personal information" description="How other people in your organization see you: in tasks, messages, meetings and the team list."><ProfileForm /></Section>
                <Section id="security" title="Security" description="Change the password you use to sign in. You'll need your current password to confirm it's you."><PasswordForm /></Section>
                <Section id="notifications" title="Notifications" description="Choose how CollabOS tells you about deadlines and new activity."><NotificationPrefs /></Section>
                <Section id="sessions" title="Sessions" description="Sign out here, or everywhere at once if a device is lost."><SessionPanel /></Section>
            </div>
        </>
    );
}
