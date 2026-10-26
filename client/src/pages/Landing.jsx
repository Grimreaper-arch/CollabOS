import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/ui";

const FEATURES = [
    { icon: "folder_open", title: "Projects & tasks", text: "Create projects, assign tasks with priorities and due dates, and see what's pending or overdue at a glance." },
    { icon: "group_add", title: "Invite your team", text: "Bring people in by email. They accept the invite and get instant access to the project's work." },
    { icon: "forum", title: "Messages & comments", text: "A channel for every project, direct messages, and comment threads on each task." },
    { icon: "upload_file", title: "File sharing", text: "Share documents with the whole project or attach work to a specific task. Every download is permission-checked." },
    { icon: "insights", title: "Progress analytics", text: "Completion rates, overdue work and per-person progress, calculated live from your data." },
    { icon: "shield_lock", title: "Secure by default", text: "Encrypted passwords, token-based login and role-based access on every request." }
];

const STEPS = [
    { title: "Create a project", text: "Give it a name, a description and a deadline." },
    { title: "Invite your team", text: "Add people by email. They join with one click." },
    { title: "Track the work", text: "Assign tasks, share files and watch progress update live." }
];

const AUDIENCES = [
    { icon: "apartment", title: "Companies", text: "Coordinate teams and deliverables across departments." },
    { icon: "school", title: "Colleges", text: "Run course projects, assignments and submissions." },
    { icon: "rocket_launch", title: "Startups", text: "Move fast without losing track of who owns what." },
    { icon: "diversity_3", title: "Clubs & communities", text: "Organise events, volunteers and shared goals." }
];

// A small, static picture of the real dashboard, shown in the hero.
function AppPreview() {
    const tasks = [
        { title: "Design the database schema", who: "Aarav", done: true, tone: "text-red-300", priority: "High" },
        { title: "Build login API", who: "Meera", done: false, tone: "text-red-300", priority: "High" },
        { title: "Create dashboard UI", who: "Kabir", done: false, tone: "text-amber-300", priority: "Medium" }
    ];
    return (
        <div className="overflow-hidden rounded-xl border border-line bg-sidebar shadow-[0_30px_80px_rgba(0,0,0,.55)]">
            <div className="flex h-8 items-center gap-1.5 border-b border-line-soft bg-[#0d0e11] px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
                <span className="ml-3 hidden text-[11px] text-muted sm:inline">collabos.app/dashboard</span>
            </div>
            <div className="flex text-left">
                <div className="hidden w-40 shrink-0 space-y-1 border-r border-line-soft p-3 md:block">
                    {[["dashboard", "Overview", true], ["folder_open", "Projects"], ["assignment", "Tasks"], ["analytics", "Analytics"], ["forum", "Messages"]].map(([icon, label, active]) => (
                        <div key={label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${active ? "bg-accent-strong font-semibold text-accent-ink" : "text-muted"}`}>
                            <Icon name={icon} className="text-base" /> {label}
                        </div>
                    ))}
                </div>
                <div className="min-w-0 flex-1 bg-page p-4 sm:p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-accent">Workspace</p>
                    <p className="mt-1 text-lg font-semibold">Welcome back, Priya</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                        {[["Projects", "4", ""], ["Open tasks", "12", "text-amber-300"], ["Completed", "28", "text-accent"]].map(([label, value, tone]) => (
                            <div key={label} className="rounded-lg border border-line bg-panel p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                                <p className={`mt-2 text-xl font-semibold ${tone}`}>{value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_200px]">
                        <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
                            <p className="text-xs font-semibold">Your next tasks</p>
                            {tasks.map((t) => (
                                <div key={t.title} className={`flex items-center justify-between gap-2 rounded-md border bg-inset px-3 py-2 ${t.done ? "border-emerald-500/40" : "border-line"}`}>
                                    <div className="min-w-0">
                                        <p className={`truncate text-xs font-medium ${t.done ? "text-muted line-through" : ""}`}>{t.title}</p>
                                        <p className="text-[10px] text-muted">{t.who} · <span className={t.tone}>{t.priority}</span></p>
                                    </div>
                                    <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${t.done ? "bg-emerald-500/15 text-emerald-300" : "bg-accent text-accent-ink"}`}>{t.done ? "Done" : "Open"}</span>
                                </div>
                            ))}
                        </div>
                        <div className="hidden rounded-lg border border-line bg-panel p-3 lg:block">
                            <p className="text-xs font-semibold">Progress</p>
                            <div className="relative mx-auto mt-3 h-24 w-24 rounded-full" style={{ background: "conic-gradient(var(--color-accent) 252deg, var(--color-raised) 0)" }}>
                                <div className="absolute inset-2.5 flex items-center justify-center rounded-full bg-panel text-lg font-semibold">70%</div>
                            </div>
                            <p className="mt-3 text-center text-[10px] text-muted">28 of 40 tasks done</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Landing() {
    const { user } = useAuth();
    const primaryCta = user ? { to: "/dashboard", label: "Open dashboard" } : { to: "/signup", label: "Get started free" };

    return (
        <div className="min-h-screen bg-page text-[#e8e8ed]">
            <header className="sticky top-0 z-30 border-b border-line-soft bg-page/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
                    <Link to="/" className="flex items-center gap-2.5 font-semibold">
                        <img className="h-7 w-7" src="/logo.svg" alt="" />
                        CollabOS
                    </Link>
                    <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
                        <a href="#features" className="hover:text-white">Features</a>
                        <a href="#how" className="hover:text-white">How it works</a>
                        <a href="#teams" className="hover:text-white">Who it's for</a>
                    </nav>
                    <div className="flex items-center gap-3">
                        {!user && <Link to="/login" className="px-2 text-sm text-muted hover:text-white">Log in</Link>}
                        <Link to={primaryCta.to} className="btn-primary px-4 py-2">{user ? "Dashboard" : "Get started"}</Link>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative overflow-hidden">
                    <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
                    <div className="pointer-events-none absolute top-[-200px] left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />

                    <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-16 text-center sm:pt-28">
                        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Projects, tasks, chat and files in one place
                        </span>
                        <h1 className="mx-auto mt-6 max-w-4xl text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-6xl">
                            Where teams plan, build and{" "}
                            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ship together.</span>
                        </h1>
                        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                            CollabOS is the collaboration workspace for companies, colleges and every team in between. Organise projects, assign work, talk it through and track progress without juggling five different apps.
                        </p>
                        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                            <Link to={primaryCta.to} className="btn-primary px-6 py-3">
                                {primaryCta.label} <Icon name="arrow_forward" className="text-lg" />
                            </Link>
                            <a href="#features" className="btn-ghost px-6 py-3">See features</a>
                        </div>
                        <p className="mt-4 text-xs text-muted">Free to use · Set up in under a minute</p>

                        <div className="mx-auto mt-16 max-w-5xl">
                            <AppPreview />
                        </div>
                    </div>
                </section>

                <section id="features" className="scroll-mt-16 border-t border-line-soft bg-[#0c0d10]">
                    <div className="mx-auto max-w-6xl px-5 py-24">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Features</p>
                            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Everything your team needs</h2>
                            <p className="mt-4 text-muted">One workspace that replaces scattered spreadsheets, chat groups and shared drives.</p>
                        </div>
                        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map((f) => (
                                <article key={f.title} className="rounded-xl border border-line bg-panel p-6 transition hover:border-primary/50">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <Icon name={f.icon} className="text-2xl" />
                                    </div>
                                    <h3 className="mt-5 font-semibold text-white">{f.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="how" className="scroll-mt-16 border-t border-line-soft">
                    <div className="mx-auto max-w-6xl px-5 py-24">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">How it works</p>
                            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Up and running in three steps</h2>
                        </div>
                        <ol className="mt-14 grid gap-4 md:grid-cols-3">
                            {STEPS.map((s, i) => (
                                <li key={s.title} className="rounded-xl border border-line bg-panel p-6">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
                                    <h3 className="mt-5 font-semibold text-white">{s.title}</h3>
                                    <p className="mt-2 text-sm text-muted">{s.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section id="teams" className="scroll-mt-16 border-t border-line-soft bg-[#0c0d10]">
                    <div className="mx-auto max-w-6xl px-5 py-24">
                        <div className="mx-auto max-w-2xl text-center">
                            <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Who it's for</p>
                            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Built for every kind of team</h2>
                        </div>
                        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {AUDIENCES.map((a) => (
                                <article key={a.title} className="rounded-xl border border-line bg-panel p-6 text-center">
                                    <Icon name={a.icon} className="text-3xl text-accent" />
                                    <h3 className="mt-4 font-semibold text-white">{a.title}</h3>
                                    <p className="mt-2 text-sm text-muted">{a.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="border-t border-line-soft">
                    <div className="mx-auto max-w-6xl px-5 py-24">
                        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-panel to-accent/10 px-6 py-14 text-center">
                            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Bring your team together today</h2>
                            <p className="mx-auto mt-4 max-w-xl text-muted">Create a free account, start your first project and invite your team in minutes.</p>
                            <Link to={primaryCta.to} className="btn-primary mt-8 px-6 py-3">
                                {primaryCta.label} <Icon name="arrow_forward" className="text-lg" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-line-soft">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row">
                    <div className="flex items-center gap-2">
                        <img className="h-5 w-5" src="/logo.svg" alt="" />
                        <span>CollabOS</span>
                    </div>
                    <p>© {new Date().getFullYear()} CollabOS. Built with MongoDB, Express, React and Node.js.</p>
                </div>
            </footer>
        </div>
    );
}
