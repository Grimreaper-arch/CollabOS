import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { refreshToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import AuthLayout, { GoogleButton, PasswordInput } from "../components/AuthLayout";
import { ErrorText, Field, Icon, Input } from "../components/ui";

export default function Login() {
    const { login, refresh } = useAuth();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    // Back from "Continue with Google": the server set the refresh cookie, so exchange it for a session.
    useEffect(() => {
        if (params.get("google_error")) {
            setError(params.get("google_error"));
            setParams({}, { replace: true });
        }
        if (params.get("google") !== "signed-in") return;
        setBusy(true);
        refreshToken()
            .then(() => refresh())
            .then(() => navigate("/dashboard", { replace: true }))
            .catch(() => { setError("Google sign-in didn't finish. Please try again."); setBusy(false); setParams({}, { replace: true }); });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <GoogleButton />
            <form onSubmit={submit} className="mt-5 space-y-4">
                <Field label="Email">
                    <Input icon="mail" id="email" name="email" type="email" required autoComplete="email" autoFocus value={form.email} onChange={update} placeholder="you@company.com" aria-label="Email" />
                </Field>
                <Field label={<span className="flex items-center justify-between">Password<Link to="/forgot-password" className="text-[13.5px] font-normal text-muted hover:text-white">Forgot password?</Link></span>}>
                    <PasswordInput id="password" name="password" autoComplete="current-password" value={form.password} onChange={update} placeholder="Your password" aria-label="Password" />
                </Field>
                <ErrorText>{error}</ErrorText>
                <button disabled={busy} className="btn-primary h-10 w-full">
                    {busy ? <><Icon name="progress_activity" className="animate-spin text-[20px]" />Signing in…</> : <>Sign in<Icon name="arrow_forward" className="text-[20px]" /></>}
                </button>
            </form>
        </AuthLayout>
    );
}
