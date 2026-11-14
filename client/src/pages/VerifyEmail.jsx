import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import AuthLayout, { CodeInput } from "../components/AuthLayout";
import { ErrorText, Icon } from "../components/ui";

const RESEND_SECONDS = 60;

// Shown after sign-up (and after changing the email) until the 6-digit code from the email is entered.
export default function VerifyEmail() {
    const { user, applySession, logout } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [wait, setWait] = useState(RESEND_SECONDS);

    // Countdown before "Send a new code" is allowed (the server enforces the same minute).
    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    if (user.emailVerified) return <Navigate to="/dashboard" replace />;

    const verify = async (value = code) => {
        if (value.length !== 6) return setError("Enter all 6 digits.");
        setBusy(true);
        setError("");
        try {
            const session = await api("/auth/verify-email", { method: "POST", body: { code: value } });
            applySession(session);
            toast.success("Email verified", "Welcome to CollabOS!");
            navigate(session.organization ? "/dashboard" : "/welcome", { replace: true });
        } catch (e) {
            setError(e.message);
            setCode("");
            setBusy(false);
        }
    };

    const resend = async () => {
        setError("");
        try {
            const { message } = await api("/auth/resend-code", { method: "POST" });
            toast.success("Code sent", message);
            setWait(RESEND_SECONDS);
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <AuthLayout
            tabs={false}
            heading="Check your email"
            subheading={<>We sent a 6-digit code to <span className="text-zinc-200">{user.email}</span>.</>}
            title="One last step."
            text="Verifying your email keeps accounts real: invitations, reminders and password resets all go to this address."
        >
            <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="mt-5 space-y-4">
                <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
                <ErrorText>{error}</ErrorText>
                <button disabled={busy || code.length !== 6} className="btn-primary h-10 w-full">
                    {busy ? <><Icon name="progress_activity" className="animate-spin text-[20px]" />Verifying…</> : <>Verify email<Icon name="arrow_forward" className="text-[20px]" /></>}
                </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-[14.5px]">
                <button onClick={resend} disabled={wait > 0} className="text-zinc-200 hover:text-white disabled:text-faint">
                    {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                </button>
                <button onClick={() => { logout(); navigate("/login"); }} className="text-muted hover:text-white">Use another account</button>
            </div>
            <p className="mt-6 rounded-lg border border-line bg-inset p-3.5 text-[13px] leading-relaxed text-faint">
                <Icon name="info" className="mr-1 align-[-3px] text-[16px]" />Can't find it? Check your spam folder. The code expires after 10 minutes.
            </p>
        </AuthLayout>
    );
}
