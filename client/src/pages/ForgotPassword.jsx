import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import AuthLayout, { CodeInput, PasswordInput } from "../components/AuthLayout";
import { ErrorText, Field, Icon, Input } from "../components/ui";

// Two steps: enter your email → enter the code we emailed plus a new password.
export default function ForgotPassword() {
    const { applySession } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [step, setStep] = useState("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async (action) => {
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const requestCode = (event) => {
        event?.preventDefault();
        run(async () => {
            const { message } = await api("/auth/forgot-password", { method: "POST", body: { email } });
            toast.success("Check your email", message);
            setStep("code");
        });
    };

    const reset = (event) => {
        event.preventDefault();
        if (code.length !== 6) return setError("Enter the 6-digit code from the email.");
        run(async () => {
            applySession(await api("/auth/reset-password", { method: "POST", body: { email, code, password } }));
            toast.success("Password changed", "You're signed in with your new password.");
            navigate("/dashboard", { replace: true });
        });
    };

    return (
        <AuthLayout
            tabs={false}
            heading={step === "email" ? "Forgot your password?" : "Choose a new password"}
            subheading={step === "email" ? "We'll email you a code to reset it." : <>Enter the code sent to <span className="text-zinc-200">{email}</span>.</>}
            title="Locked out? No problem."
            text="Reset codes expire after 10 minutes, and changing your password signs out every other device."
        >
            {step === "email" ? (
                <form onSubmit={requestCode} className="mt-5 space-y-4">
                    <Field label="Email">
                        <Input icon="mail" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" aria-label="Email" />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <button disabled={busy} className="btn-primary h-10 w-full">Send reset code<Icon name="arrow_forward" className="text-[20px]" /></button>
                </form>
            ) : (
                <form onSubmit={reset} className="mt-5 space-y-4">
                    <Field label="Code"><CodeInput value={code} onChange={setCode} disabled={busy} /></Field>
                    <Field label="New password">
                        <PasswordInput id="new-password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" aria-label="New password" />
                    </Field>
                    <ErrorText>{error}</ErrorText>
                    <button disabled={busy} className="btn-primary h-10 w-full">Reset password<Icon name="check" className="text-[20px]" /></button>
                    <button type="button" disabled={busy} onClick={() => requestCode()} className="w-full text-[14.5px] text-muted hover:text-white">Send a new code</button>
                </form>
            )}
            <p className="mt-6 text-center text-[14.5px] text-muted">
                <Link to="/login" className="hover:text-white"><Icon name="arrow_back" className="mr-1 align-[-3px] text-[16px]" />Back to sign in</Link>
            </p>
        </AuthLayout>
    );
}
