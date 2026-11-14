import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/ui";
import PricingTable from "../components/PricingTable";

const FEATURES = [
    { icon: "task_alt", title: "Projects and tasks", text: "Assign work with priorities and due dates, then move it across a Kanban board from to-do to done." },
    { icon: "chat_bubble", title: "Real-time chat", text: "A channel for every project and direct messages, with typing indicators and read receipts." },
    { icon: "videocam", title: "Video meetings", text: "Start a call in the browser, share your screen, or schedule one and invite the team." },
    { icon: "code", title: "Code workspace", text: "Edit the same file together, live, and run JavaScript, Python, C, C++ and Java without leaving the page." },
    { icon: "auto_awesome", title: "An assistant that acts", text: "Ask what's overdue, or tell it to create tasks, schedule a meeting or write a program. It asks before anything risky." },
    { icon: "shield", title: "Roles and permissions", text: "Design your own roles from a permission catalog. Every request is checked on the server." },
    { icon: "folder", title: "Files", text: "Share documents with a project or hand in work on a task. Downloads are permission-checked." },
    { icon: "calendar_today", title: "Calendar", text: "Deadlines and meetings in one view, with reminders, and two-way Google Calendar sync." },
    { icon: "bar_chart", title: "Analytics", text: "Completion, overdue work and each person's progress, calculated live from your data." }
];

const STEPS = [
    { title: "Create an organization", text: "You become its Owner. Five roles are ready to use, or design your own." },
    { title: "Invite your team", text: "Add people by email with a role. They join in one click." },
    { title: "Run the work", text: "Plan tasks, talk, meet and build in one place, and watch progress update live." }
];

const ROLES = [
    ["Owner", [true, true, true, true]],
    ["Admin", [true, true, true, true]],
    ["Manager", [true, true, false, false]],
    ["Member", [false, false, false, false]],
    ["Viewer", [false, false, false, false]]
];
const ROLE_COLUMNS = ["Assign tasks", "Invite people", "Manage roles", "Billing"];

const PREVIEW_TASKS = [
    ["Build login API", "High", "bg-danger", "2d overdue", "text-danger", false],
    ["Fix navbar on mobile", "Medium", "bg-warning", "Today", "text-warning", false],
    ["Write API documentation", "Low", "bg-success", "Tomorrow", "text-zinc-300", false],
    ["Design the database schema", "High", "bg-danger", "Done", "text-faint", true]
];

// A still of the real task list, drawn with the product's own styles.
function Preview() {
    return (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
                <p className="text-[14.5px] font-semibold text-zinc-100">Website Redesign <span className="ml-2 font-normal text-faint">Up next</span></p>
                <p className="hidden text-[13.5px] text-faint sm:block">4 of 9 done</p>
            </div>
            <div className="divide-y divide-line-soft px-4">
                {PREVIEW_TASKS.map(([title, priority, dot, due, dueTone, done]) => (
                    <div key={title} className="flex items-center gap-3 py-2.5">
                        <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${done ? "border-success bg-success text-black" : "border-[#4f5f62]"}`}>{done && <Icon name="check" className="text-[14.5px]" />}</span>
                        <span className={`min-w-0 flex-1 truncate text-[15px] ${done ? "text-faint line-through" : "font-medium text-zinc-100"}`}>{title}</span>
                        <span className="hidden w-20 items-center gap-1.5 text-[13.5px] text-muted sm:inline-flex"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{priority}</span>
                        <span className={`w-20 text-right text-[13.5px] ${dueTone}`}>{due}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Landing() {
    const { user } = useAuth();
    const cta = user ? { to: "/dashboard", label: "Open CollabOS" } : { to: "/signup", label: "Get started free" };

    return (
        <div className="min-h-screen bg-page">
            <header className="sticky top-0 z-30 border-b border-line-soft bg-page">
                <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
                    <Link to="/" className="flex items-center gap-2.5 text-[16px] font-semibold text-white">
                        <img className="h-6 w-6" src="/logo.svg" alt="" />CollabOS
                    </Link>
                    <nav className="hidden items-center gap-7 text-[14.5px] text-muted md:flex">
                        <a href="#features" className="transition-colors hover:text-white">Features</a>
                        <a href="#how" className="transition-colors hover:text-white">How it works</a>
                        <a href="#security" className="transition-colors hover:text-white">Access control</a>
                        <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
                    </nav>
                    <div className="flex items-center gap-1.5">
                        {!user && <Link to="/login" className="btn-ghost btn-sm">Sign in</Link>}
                        <Link to={cta.to} className="btn-primary btn-sm">{user ? "Open app" : "Get started"}</Link>
                    </div>
                </div>
            </header>

            <main>
                {/* Hero */}
                <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 pt-20 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-28">
                    <div>
                        <p className="text-[14.5px] text-muted">The collaboration workspace for teams</p>
                        <h1 className="mt-4 text-[46px] leading-[1.05] font-semibold text-white sm:text-[58px]" style={{ letterSpacing: "-0.035em" }}>
                            Plan, build and ship.<br />In one place.
                        </h1>
                        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
                            Tasks, chat, meetings, files and code in a single workspace, with roles that decide who can do what.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-2">
                            <Link to={cta.to} className="btn-primary h-10 px-4">{cta.label}</Link>
                            <a href="#features" className="btn-secondary h-10 px-4">See what's inside</a>
                        </div>
                        <p className="mt-4 text-[14px] text-faint">Free for small teams. No card needed.</p>
                    </div>
                    <Preview />
                </section>

                {/* Features */}
                <section id="features" className="scroll-mt-14 border-t border-line-soft">
                    <div className="mx-auto max-w-[1120px] px-6 py-20">
                        <h2 className="max-w-xl text-[30px] leading-tight font-semibold text-white">Everything a team uses in a day, without switching tabs.</h2>
                        <div className="mt-10 grid overflow-hidden rounded-xl border border-line sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map((f) => (
                                <article key={f.title} className="-mr-px -mb-px border-r border-b border-line p-6">
                                    <Icon name={f.icon} className="text-[22px] text-zinc-300" />
                                    <h3 className="mt-4 text-[15px] font-semibold text-white">{f.title}</h3>
                                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How it works */}
                <section id="how" className="scroll-mt-14 border-t border-line-soft">
                    <div className="mx-auto max-w-[1120px] px-6 py-20">
                        <h2 className="text-[30px] leading-tight font-semibold text-white">Up and running in three steps.</h2>
                        <ol className="mt-10 grid gap-10 md:grid-cols-3">
                            {STEPS.map((step, i) => (
                                <li key={step.title} className="border-t border-line pt-5">
                                    <p className="text-[14.5px] text-faint tabular-nums">0{i + 1}</p>
                                    <h3 className="mt-3 text-[16px] font-semibold text-white">{step.title}</h3>
                                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* Access control */}
                <section id="security" className="scroll-mt-14 border-t border-line-soft">
                    <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-20 lg:grid-cols-2">
                        <div>
                            <h2 className="text-[30px] leading-tight font-semibold text-white">The right access for every person.</h2>
                            <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
                                Roles are built from a catalog of permissions and ranked by seniority. People can only manage those below them, and can never grant a permission they don't have themselves.
                            </p>
                            <ul className="mt-6 space-y-2.5 text-[15px] text-zinc-300">
                                {["Verified email, encrypted passwords and short-lived sessions", "Login rate limits and automatic account lockout", "Every organization's data is isolated from the others"].map((line) => (
                                    <li key={line} className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 text-[17px] text-success" />{line}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-line bg-panel">
                            <div className="grid grid-cols-[1fr_repeat(4,72px)] border-b border-line-soft px-4 py-2.5 text-[13px] text-faint">
                                <span>Role</span>{ROLE_COLUMNS.map((c) => <span key={c} className="text-center leading-tight">{c}</span>)}
                            </div>
                            {ROLES.map(([role, allowed]) => (
                                <div key={role} className="grid grid-cols-[1fr_repeat(4,72px)] items-center border-b border-line-soft px-4 py-2.5 last:border-0">
                                    <span className="text-[15px] font-medium text-zinc-100">{role}</span>
                                    {allowed.map((yes, i) => <span key={i} className="flex justify-center">{yes ? <Icon name="check" className="text-[17px] text-zinc-200" /> : <span className="h-px w-3 bg-[#36464a]" />}</span>)}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Pricing */}
                <section id="pricing" className="scroll-mt-14 border-t border-line-soft">
                    <div className="mx-auto max-w-[1120px] px-6 py-20">
                        <h2 className="text-[30px] leading-tight font-semibold text-white">Start free. Upgrade when the team grows.</h2>
                        <p className="mt-3 max-w-lg text-[15.5px] text-muted">A plan covers the whole organization. Pay by UPI, card or net banking.</p>
                        <div className="mt-10">
                            <PricingTable renderAction={(plan) => (
                                <Link to={user ? "/billing" : "/signup"} className={plan.id === "pro" ? "btn-primary w-full" : "btn-secondary w-full"}>
                                    {plan.id === "starter" ? "Start for free" : `Get ${plan.name}`}
                                </Link>
                            )} />
                        </div>
                    </div>
                </section>

                {/* Closing */}
                <section className="border-t border-line-soft">
                    <div className="mx-auto flex max-w-[1120px] flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-[26px] leading-tight font-semibold text-white">Bring your team together.</h2>
                            <p className="mt-2 text-[15px] text-muted">Create an account and your first project in a couple of minutes.</p>
                        </div>
                        <Link to={cta.to} className="btn-primary h-10 px-4">{cta.label}</Link>
                    </div>
                </section>
            </main>

            <footer className="border-t border-line-soft">
                <div className="mx-auto flex max-w-[1120px] flex-col justify-between gap-3 px-6 py-6 text-[14px] text-faint sm:flex-row">
                    <span>© {new Date().getFullYear()} CollabOS</span>
                    <span>Built with MongoDB, Express, React and Node.js</span>
                </div>
            </footer>
        </div>
    );
}
