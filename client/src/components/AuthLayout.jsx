import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "./ui";

// Layout shared by the sign-in, sign-up, verification and password reset pages: one centred
// column, nothing competing with the form. (`title` and `text` are accepted for older callers.)
export default function AuthLayout({ heading, subheading, tabs = true, children }) {
    const { pathname } = useLocation();
    const signup = pathname.startsWith("/signup");
    return (
        <div className="flex min-h-screen flex-col bg-page">
            <header className="flex h-14 items-center px-6">
                <Link to="/" className="flex items-center gap-2.5">
                    <img src="/logo.svg" alt="" className="h-6 w-6" />
                    <span className="text-[16px] font-semibold text-white">CollabOS</span>
                </Link>
            </header>

            <main className="flex flex-1 items-start justify-center px-6 pt-[8vh] pb-16">
                <div className="w-full max-w-[380px]">
                    <h1 className="text-[24px] leading-tight font-semibold text-white">{heading}</h1>
                    {subheading && <p className="mt-1.5 text-[15px] text-muted">{subheading}</p>}
                    {children}
                    {tabs && (
                        <p className="mt-6 text-[14.5px] text-muted">
                            {signup ? "Already have an account? " : "New to CollabOS? "}
                            <Link to={signup ? "/login" : "/signup"} className="font-medium text-zinc-100 underline decoration-white/25 underline-offset-4 hover:decoration-white">
                                {signup ? "Sign in" : "Create an account"}
                            </Link>
                        </p>
                    )}
                </div>
            </main>

            <footer className="px-6 py-5 text-[13.5px] text-faint">© {new Date().getFullYear()} CollabOS</footer>
        </div>
    );
}

// Password box with a show/hide toggle.
export function PasswordInput(props) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Icon name="lock" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[18px] text-faint" />
            <input {...props} type={visible ? "text" : "password"} className="field pr-10 pl-9" required />
            <button type="button" onClick={() => setVisible((v) => !v)} className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:text-white" aria-label={visible ? "Hide password" : "Show password"}>
                <Icon name={visible ? "visibility" : "visibility_off"} className="text-[20px]" />
            </button>
        </div>
    );
}

// Six boxes for a one-time code. Typing moves to the next box; pasting fills them all.
// Calls onComplete(code) once all six digits are entered.
export function CodeInput({ value, onChange, onComplete, disabled }) {
    const boxes = useRef([]);
    const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

    const set = (next) => {
        const code = next.replace(/\D/g, "").slice(0, 6);
        onChange(code);
        if (code.length === 6) onComplete?.(code);
        return code;
    };

    const type = (index, event) => {
        const typed = event.target.value.replace(/\D/g, "");
        if (!typed) return;
        const code = set(value.slice(0, index) + typed + value.slice(index + typed.length));
        boxes.current[Math.min(code.length, 5)]?.focus();
    };

    const key = (index, event) => {
        if (event.key === "Backspace") {
            event.preventDefault();
            const at = digits[index] ? index : Math.max(0, index - 1);
            set(value.slice(0, at) + value.slice(at + 1));
            boxes.current[at]?.focus();
        } else if (event.key === "ArrowLeft") boxes.current[index - 1]?.focus();
        else if (event.key === "ArrowRight") boxes.current[index + 1]?.focus();
    };

    const paste = (event) => {
        event.preventDefault();
        const code = set(event.clipboardData.getData("text"));
        boxes.current[Math.min(code.length, 5)]?.focus();
    };

    return (
        <div className="flex justify-between gap-2" onPaste={paste}>
            {digits.map((digit, i) => (
                <input key={i} ref={(el) => (boxes.current[i] = el)} value={digit} disabled={disabled}
                    onChange={(e) => type(i, e)} onKeyDown={(e) => key(i, e)} onFocus={(e) => e.target.select()}
                    inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} aria-label={`Digit ${i + 1}`}
                    autoFocus={i === 0}
                    className="field h-12 w-full min-w-0 p-0 text-center text-[22px] font-semibold text-white tabular-nums" />
            ))}
        </div>
    );
}

// "Continue with Google". Google sends the browser back to /login?google=signed-in with a
// refresh cookie set; the login page then fetches the session.
export function GoogleButton({ label = "Continue with Google" }) {
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const start = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/google/login-url");
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            window.location.href = data.url;
        } catch (e) {
            setError(e.message || "Google sign-in isn't available.");
            setBusy(false);
        }
    };
    return (
        <div className="mt-7">
            <button type="button" onClick={start} disabled={busy} className="btn-secondary h-10 w-full">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.07-1.1-.16-1.6H12z" />
                </svg>
                {busy ? "Opening Google…" : label}
            </button>
            {error && <p className="mt-2 text-center text-[13px] text-danger">{error}</p>}
            <div className="mt-5 flex items-center gap-3 text-[13.5px] text-faint"><span className="h-px flex-1 bg-line-soft" />or<span className="h-px flex-1 bg-line-soft" /></div>
        </div>
    );
}
