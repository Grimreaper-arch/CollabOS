import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { PasswordInput } from "../components/AuthLayout";
import { ErrorText, Field, Icon, Input } from "../components/ui";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            await login(form.email, form.password);
            navigate(location.state?.from || "/dashboard", { replace: true });
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <AuthLayout
            heading="Welcome back"
            subheading="Sign in to pick up where your team left off."
            title="Your team's work, in one place."
            text="Projects, tasks, deadlines, files and conversations, with access controlled by the roles your organization defines."
        >
            <form onSubmit={submit} className="mt-8 space-y-5">
                <Field label="Email">
                    <Input icon="mail" id="email" name="email" type="email" required autoComplete="email" autoFocus value={form.email} onChange={update} placeholder="you@company.com" aria-label="Email" />
                </Field>
                <Field label="Password">
                    <PasswordInput id="password" name="password" autoComplete="current-password" value={form.password} onChange={update} placeholder="Your password" aria-label="Password" />
                </Field>
                <ErrorText>{error}</ErrorText>
                <button disabled={busy} className="btn-primary h-11 w-full">
                    {busy ? <><Icon name="progress_activity" className="animate-spin text-[18px]" />Signing in…</> : <>Sign in<Icon name="arrow_forward" className="text-[18px]" /></>}
                </button>
            </form>
        </AuthLayout>
    );
}
