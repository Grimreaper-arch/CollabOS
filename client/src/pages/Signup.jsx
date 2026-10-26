import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { PasswordInput } from "../components/AuthLayout";
import { ErrorText, Field, Icon, Input } from "../components/ui";

const EMPTY = { fullName: "", email: "", institution: "", department: "", phone: "", password: "" };

export default function Signup() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState(EMPTY);
    const [terms, setTerms] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
    const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(form.password)).length);

    const submit = async (event) => {
        event.preventDefault();
        if (!form.fullName.trim()) return setError("Please enter your full name.");
        if (form.password.length < 8) return setError("Password must be at least 8 characters.");
        if (!terms) return setError("Please accept the Terms & Conditions.");

        setError("");
        setBusy(true);
        try {
            await register(form);
            navigate("/welcome", { replace: true });
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    const input = (name, label, icon, props = {}) => (
        <Field label={label}>
            <Input icon={icon} id={name} name={name} value={form[name]} onChange={update} aria-label={label} {...props} />
        </Field>
    );

    return (
        <AuthLayout
            heading="Create your account"
            subheading="Free forever for small teams. No credit card."
            title="One workspace for your whole team."
            text="Create your account, then start an organization or accept an invitation from your team."
        >
            <form onSubmit={submit} className="mt-8 space-y-4">
                {input("fullName", "Full name", "person", { placeholder: "Alex Mercer", required: true, autoComplete: "name", autoFocus: true })}
                {input("email", "Email", "mail", { type: "email", placeholder: "you@company.com", required: true, autoComplete: "email" })}
                <div className="grid gap-4 sm:grid-cols-2">
                    {input("institution", "Company / college", "apartment", { placeholder: "Acme Corp" })}
                    {input("department", "Team", "groups", { placeholder: "Engineering" })}
                </div>
                <Field label="Password">
                    <PasswordInput id="password" name="password" autoComplete="new-password" value={form.password} onChange={update} placeholder="At least 8 characters" minLength={8} aria-label="Password" />
                    {form.password && (
                        <div className="mt-2 flex gap-1">
                            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? ["bg-danger", "bg-warning", "bg-accent", "bg-success"][strength - 1] : "bg-white/[0.08]"}`} />)}
                        </div>
                    )}
                </Field>

                <label className="flex cursor-pointer items-start gap-3 text-[13px] text-muted">
                    <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#a8a4ff]" />
                    I agree to the Terms of Service and Privacy Policy.
                </label>

                <ErrorText>{error}</ErrorText>
                <button disabled={busy} className="btn-primary h-11 w-full">
                    {busy ? <><Icon name="progress_activity" className="animate-spin text-[18px]" />Creating account…</> : <>Create account<Icon name="arrow_forward" className="text-[18px]" /></>}
                </button>
            </form>
        </AuthLayout>
    );
}
