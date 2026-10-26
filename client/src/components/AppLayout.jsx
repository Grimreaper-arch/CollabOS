import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Avatar, Icon, Kbd, Popover } from "./ui";
import NotificationBell from "./NotificationBell";
import CommandPalette from "./CommandPalette";

const NAV = [
    { section: "Workspace", items: [
        { to: "/dashboard", icon: "space_dashboard", label: "Overview" },
        { to: "/calendar", icon: "calendar_month", label: "My Calendar" },
        { to: "/projects", icon: "folder_open", label: "Projects" },
        { to: "/tasks", icon: "checklist", label: "Tasks" },
        { to: "/code", icon: "code", label: "Code" },
        { to: "/messages", icon: "forum", label: "Messages" },
        { to: "/analytics", icon: "monitoring", label: "Analytics" }
    ] },
    { section: "Organization", items: [
        { to: "/organization", icon: "corporate_fare", label: "Organization" },
        { to: "/settings", icon: "settings", label: "Settings" }
    ] }
];

const ALL_ITEMS = NAV.flatMap((s) => s.items);

const linkClass = ({ isActive }) =>
    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition ${isActive ? "bg-white/[0.06] font-medium text-white" : "text-muted hover:bg-white/[0.03] hover:text-zinc-100"}`;

function NavItem({ item, onNavigate }) {
    return (
        <NavLink to={item.to} className={linkClass} onClick={onNavigate}>
            {({ isActive }) => (
                <>
                    {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-primary" />}
                    <Icon name={item.icon} className={`text-[20px] ${isActive ? "text-primary" : "text-faint group-hover:text-muted"}`} fill={isActive} />
                    <span>{item.label}</span>
                </>
            )}
        </NavLink>
    );
}

function UserMenu() {
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const anchor = useRef(null);
    const [open, setOpen] = useState(false);

    return (
        <>
            <button ref={anchor} onClick={() => setOpen((o) => !o)} className="rounded-full ring-offset-2 ring-offset-page transition hover:ring-2 hover:ring-line" aria-label="Account menu">
                <Avatar user={user} size="h-8 w-8 text-[11px]" />
            </button>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="end" width={240}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar user={user} size="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                        <p className="truncate text-xs text-muted">{role?.name} · {user.email}</p>
                    </div>
                </div>
                <div className="my-1 h-px bg-line-soft" />
                {[["person", "Profile & settings", "/settings"], ["corporate_fare", "Organization", "/organization"]].map(([icon, label, to]) => (
                    <button key={to} onClick={() => { setOpen(false); navigate(to); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white">
                        <Icon name={icon} className="text-[18px] text-faint" />{label}
                    </button>
                ))}
                <div className="my-1 h-px bg-line-soft" />
                <button onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10">
                    <Icon name="logout" className="text-[18px]" />Log out
                </button>
            </Popover>
        </>
    );
}

export default function AppLayout() {
    const { organization, role, refresh } = useAuth();
    const location = useLocation();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);

    // Re-check role and permissions every 30 seconds and when the tab regains focus,
    // so changes made by an admin show up without logging out.
    useEffect(() => {
        const update = () => refresh().catch(() => {});
        const timer = setInterval(update, 30000);
        window.addEventListener("focus", update);
        return () => { clearInterval(timer); window.removeEventListener("focus", update); };
    }, [refresh]);

    // Ctrl+K / ⌘K opens the command palette.
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setPaletteOpen((o) => !o);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => setMobileNav(false), [location.pathname]);

    // Removed from the organization while using the app.
    if (!organization) return <Navigate to="/welcome" replace />;

    const current = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to));

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-2">
                <img src="/logo.svg" alt="" className="h-8 w-8" />
                <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-tight text-white">{organization.name}</p>
                    <p className="truncate text-xs text-faint">CollabOS · {role?.name}</p>
                </div>
            </div>

            <button onClick={() => setPaletteOpen(true)} className="mt-5 flex h-9 items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-3 text-left text-[13px] text-faint transition hover:border-[#2e2e36] hover:text-muted">
                <Icon name="search" className="text-[18px]" />
                <span className="flex-1">Search…</span>
                <Kbd>Ctrl K</Kbd>
            </button>

            <nav className="mt-5 flex-1 space-y-6 overflow-y-auto">
                {NAV.map((section) => (
                    <div key={section.section}>
                        <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[.2em] text-faint">{section.section}</p>
                        <div className="space-y-0.5">
                            {section.items.map((item) => <NavItem key={item.to} item={item} />)}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="mt-4 rounded-xl border border-line bg-gradient-to-br from-primary/10 to-transparent p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-white"><Icon name="bolt" className="text-[18px] text-primary" fill />Pro tip</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">Press <Kbd>Ctrl K</Kbd> to jump anywhere or add a task in seconds.</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen lg:flex">
            {/* Desktop sidebar */}
            <aside className="hidden w-64 shrink-0 border-r border-line-soft bg-sidebar px-4 py-5 lg:sticky lg:top-0 lg:block lg:h-screen">
                {sidebar}
            </aside>

            {/* Mobile drawer */}
            {mobileNav && (
                <div className="fixed inset-0 z-50 animate-fade-in bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileNav(false)}>
                    <aside className="h-full w-72 animate-slide-up border-r border-line bg-sidebar px-4 py-5" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
                </div>
            )}

            <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line-soft bg-page/75 px-4 backdrop-blur-xl sm:px-8">
                    <button onClick={() => setMobileNav(true)} className="btn-icon -ml-2 lg:hidden" aria-label="Open menu"><Icon name="menu" /></button>
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="hidden text-faint sm:inline">{organization.name}</span>
                        <Icon name="chevron_right" className="hidden text-base text-faint sm:inline" />
                        <span className="truncate font-medium text-white">{current?.label || "CollabOS"}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => setPaletteOpen(true)} className="btn-icon lg:hidden" aria-label="Search"><Icon name="search" /></button>
                        <NotificationBell />
                        <div className="ml-1"><UserMenu /></div>
                    </div>
                </header>

                <main className="relative px-4 py-8 sm:px-8 lg:px-10">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(168,164,255,0.07),transparent_70%)]" />
                    <div className="relative mx-auto max-w-[1400px] animate-fade-in" key={location.pathname}>
                        <Outlet />
                    </div>
                </main>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </div>
    );
}
