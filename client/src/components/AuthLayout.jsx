import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "./ui";

const tabClass = ({ isActive }) =>
    `flex-1 rounded-lg py-2 text-center text-sm font-medium transition ${isActive ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-muted hover:text-zinc-200"}`;

// Floating product snippets on the left side of the auth screens.
function Showcase() {
    return (
        <div className="relative mx-auto h-[340px] w-full max-w-md">
            <div className="card absolute top-0 left-0 w-[78%] -rotate-2 p-4 shadow-2xl shadow-black/50">
                <div className="flex items-center gap-2 text-xs text-muted"><Icon name="checklist" className="text-base text-primary" />Website Redesign</div>
                {[["Design the database schema", true], ["Build login API", false], ["Fix navbar on mobile", false]].map(([t, done]) => (
                    <div key={t} className="mt-3 flex items-center gap-2.5">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${done ? "border-success bg-success text-black" : "border-[#3a3a44]"}`}>{done && <Icon name="check" className="text-[11px]" />}</span>
                        <span className={`text-[13px] ${done ? "text-faint line-through" : "text-zinc-200"}`}>{t}</span>
                    </div>
                ))}
            </div>
            <div className="card absolute top-28 right-0 w-[56%] rotate-2 p-4 shadow-2xl shadow-black/50">
                <p className="text-xs text-muted">Completion</p>
                <p className="mt-1 font-mono text-3xl font-semibold text-white">72%</p>
                <div className="mt-3 flex h-12 items-end gap-1.5">
                    {[30, 55, 40, 70, 60, 85, 72].map((h, i) => <span key={i} className={`flex-1 rounded-sm ${i === 6 ? "bg-primary" : "bg-white/10"}`} style={{ height: `${h}%` }} />)}
                </div>
            </div>
            <div className="card absolute bottom-0 left-8 flex items-center gap-3 p-3 pr-5 shadow-2xl shadow-black/50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/15 text-warning"><Icon name="alarm" /></span>
                <div>
                    <p className="text-[13px] font-medium text-white">“Build login API” is due tomorrow</p>
                    <p className="text-xs text-faint">Reminder · just now</p>
                </div>
            </div>
        </div>
    );
}

// Split-screen layout shared by the login and signup pages.
export default function AuthLayout({ heading, subheading, title, text, children }) {
    return (
        <div className="flex min-h-screen bg-page">
            <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-line-soft bg-sidebar p-12 lg:flex xl:p-16">
                <div className="dot-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
                <div className="pointer-events-none absolute -top-40 -left-20 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[120px]" />
                <div className="pointer-events-none absolute -right-20 -bottom-40 h-[380px] w-[380px] rounded-full bg-accent/10 blur-[120px]" />

                <Link to="/" className="relative z-10 flex items-center gap-3">
                    <img src="/logo.svg" alt="" className="h-9 w-9" />
                    <span className="text-xl font-semibold tracking-tight">CollabOS</span>
                </Link>
                <div className="relative z-10 my-10"><Showcase /></div>
                <div className="relative z-10 max-w-lg">
                    <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-white">{title}</h2>
                    <p className="mt-4 text-[15px] leading-relaxed text-muted">{text}</p>
                </div>
            </section>

            <section className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
                <div className="w-full max-w-[400px] animate-slide-up">
                    <Link to="/" className="mb-10 flex items-center gap-3 lg:hidden">
                        <img src="/logo.svg" alt="" className="h-8 w-8" />
                        <span className="text-lg font-semibold">CollabOS</span>
                    </Link>
                    <h1 className="text-[28px] font-semibold tracking-tight text-white">{heading}</h1>
                    {subheading && <p className="mt-1.5 text-[15px] text-muted">{subheading}</p>}
                    <div className="mt-8 flex rounded-xl border border-line bg-inset p-1">
                        <NavLink to="/login" className={tabClass}>Sign in</NavLink>
                        <NavLink to="/signup" className={tabClass}>Create account</NavLink>
                    </div>
                    {children}
                </div>
            </section>
        </div>
    );
}

// Password box with a show/hide toggle.
export function PasswordInput(props) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Icon name="lock" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-faint" />
            <input {...props} type={visible ? "text" : "password"} className="field pr-11 pl-10" required />
            <button type="button" onClick={() => setVisible((v) => !v)} className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:text-white" aria-label={visible ? "Hide password" : "Show password"}>
                <Icon name={visible ? "visibility" : "visibility_off"} className="text-[18px]" />
            </button>
        </div>
    );
}
