import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Avatar, Badge, Icon, Kbd, Popover, Tooltip } from "./ui";
import NotificationBell from "./NotificationBell";
import CommandPalette from "./CommandPalette";
import UpgradeDialog from "./UpgradeDialog";
import AssistantPanel from "./AssistantPanel";
import { RealtimeProvider, useRealtime, useSocketEvent } from "../context/RealtimeContext";

const NAV = [
    { section: "Workspace", items: [
        { to: "/dashboard", icon: "home", label: "Home" },
        { to: "/tasks", icon: "task_alt", label: "Tasks" },
        { to: "/calendar", icon: "calendar_today", label: "Calendar" },
        { to: "/messages", icon: "chat_bubble", label: "Messages" },
        { to: "/meetings", icon: "videocam", label: "Meetings" }
    ] },
    { section: "Work", items: [
        { to: "/projects", icon: "folder", label: "Projects" },
        { to: "/code", icon: "code", label: "Code" },
        { to: "/analytics", icon: "bar_chart", label: "Analytics" }
    ] },
    { section: "Administration", items: [
        { to: "/organization", icon: "apartment", label: "Organization" },
        { to: "/billing", icon: "credit_card", label: "Plan & billing" },
        { to: "/settings", icon: "settings", label: "Settings" }
    ] }
];

const ALL_ITEMS = NAV.flatMap((s) => s.items);
const PLAN_NAMES = { starter: "Starter", pro: "Pro", scale: "Scale" };
const COLLAPSE_KEY = "collabos_sidebar_collapsed";

// Pages call useCrumb("Website Redesign") to add their own name to the breadcrumb in the top bar.
export function useCrumb(label) {
    const setCrumb = useOutletContext()?.setCrumb;
    useEffect(() => {
        if (!setCrumb) return;
        setCrumb(label || null);
        return () => setCrumb(null);
    }, [label, setCrumb]);
}

function NavItem({ item, collapsed }) {
    return (
        <Tooltip label={item.label} side="right" disabled={!collapsed}>
            <NavLink to={item.to} aria-label={item.label}
                className={({ isActive }) => `group relative flex h-[38px] items-center gap-2.5 rounded-lg text-[14.5px] transition-colors duration-150 ${collapsed ? "justify-center px-0" : "px-2.5"} ${isActive ? "bg-accent/[0.09] font-medium text-white" : "text-muted hover:bg-white/[0.045] hover:text-zinc-100"}`}>
                {({ isActive }) => (
                    <>
                        {isActive && <span className="absolute top-1/2 -left-2.5 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden="true" />}
                        <Icon name={item.icon} fill={isActive} className={`text-[20px] transition-colors ${isActive ? "text-accent" : "text-faint group-hover:text-zinc-300"}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                    </>
                )}
            </NavLink>
        </Tooltip>
    );
}

// Someone started a meeting and invited you: show a "ringing" card with Join / Dismiss.
function MeetingRinger() {
    const navigate = useNavigate();
    const { organization } = useAuth();
    const [ring, setRing] = useState(null);
    useSocketEvent("meeting:ring", (event) => {
        if (event.orgId !== organization._id) return;
        setRing(event);
        setTimeout(() => setRing((current) => (current === event ? null : current)), 30000);
    });
    if (!ring) return null;
    return (
        <div className="fixed top-16 right-4 z-[85] w-[min(360px,calc(100%-2rem))] animate-slide-up">
            <div className="floating flex items-center gap-3 border-accent/40 p-4">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" aria-hidden="true" />
                    <Icon name="videocam" fill />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{ring.host} is calling</p>
                    <p className="truncate text-[13px] text-muted">{ring.title}</p>
                </div>
                <button onClick={() => setRing(null)} className="btn-icon" aria-label="Dismiss"><Icon name="close" /></button>
                <button onClick={() => { setRing(null); navigate(`/meet/${ring.roomId}`); }} className="btn-primary btn-sm">Join</button>
            </div>
        </div>
    );
}

const orgInitial = (name) => name?.trim()[0]?.toUpperCase() || "?";

// The organization's mark: its initial on a teal-to-green tile.
function OrgBadge({ name, size = "h-7 w-7 text-[13.5px]" }) {
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#2a9d7c] font-bold text-primary-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] ${size}`}>
            {orgInitial(name)}
        </span>
    );
}

// Top of the sidebar: the active organization and its plan; opens the list of your organizations.
function OrgSwitcher({ collapsed, onNavigate }) {
    const { organization, organizations, switchOrg } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const anchor = useRef(null);
    const [open, setOpen] = useState(false);
    const [invites, setInvites] = useState(0);

    // Pending invitations, so people know there's an organization waiting for them.
    useEffect(() => {
        if (!open) return;
        api("/invitations/mine").then((d) => setInvites(d.invitations.length)).catch(() => {});
    }, [open]);

    const choose = async (org) => {
        setOpen(false);
        if (org._id === organization._id) return;
        // Leave the current page first: it may belong to the old organization.
        navigate("/dashboard");
        onNavigate?.();
        try {
            await switchOrg(org._id);
            toast.success(`Switched to ${org.name}`, `Your role: ${org.role}`);
        } catch (e) {
            toast.error("Couldn't switch", e.message);
        }
    };

    const go = (to) => { setOpen(false); onNavigate?.(); navigate(to); };
    const planName = organization.plan?.name || "Starter";

    return (
        <>
            <Tooltip label={`${organization.name} · ${planName}`} side="right" disabled={!collapsed}>
                <button ref={anchor} onClick={() => setOpen((o) => !o)} aria-label="Switch organization" aria-haspopup="menu" aria-expanded={open}
                    className={`flex w-full items-center gap-2.5 rounded-lg border border-transparent text-left transition-colors hover:border-line hover:bg-white/[0.04] ${collapsed ? "h-10 justify-center" : "h-12 px-2"} ${open ? "border-line bg-white/[0.04]" : ""}`}>
                    <OrgBadge name={organization.name} />
                    {!collapsed && (
                        <>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] leading-tight font-semibold text-ink">{organization.name}</span>
                                <span className="mt-0.5 flex items-center gap-1 text-[12.5px] leading-tight text-faint">
                                    <span className={`h-1.5 w-1.5 rounded-full ${planName === "Starter" ? "bg-steel" : "bg-success"}`} />{planName} plan
                                </span>
                            </span>
                            <Icon name="unfold_more" className="text-[17px] text-faint" />
                        </>
                    )}
                </button>
            </Tooltip>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={272}>
                <p className="eyebrow px-2.5 pt-2 pb-1.5">Your organizations</p>
                <div className="max-h-72 overflow-y-auto">
                    {organizations.map((org) => {
                        const active = org._id === organization._id;
                        return (
                            <button key={org._id} onClick={() => choose(org)}
                                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors ${active ? "bg-accent/[0.08]" : "hover:bg-white/[0.05]"}`}>
                                <OrgBadge name={org.name} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-white">{org.name}</span>
                                    <span className="block truncate text-[13px] text-faint">{org.role} · {PLAN_NAMES[org.plan] || "Starter"}</span>
                                </span>
                                {active && <Icon name="check" className="text-[17px] text-accent" />}
                            </button>
                        );
                    })}
                </div>
                <div className="my-1 h-px bg-line-soft" />
                <button onClick={() => go("/billing")} className="menu-item"><Icon name="credit_card" className="text-[18px] text-faint" />Plan & billing</button>
                <button onClick={() => go("/join")} className="menu-item">
                    <Icon name="add" className="text-[18px] text-faint" />
                    <span className="flex-1">Create or join an organization</span>
                    {invites > 0 && <span className="rounded-full bg-accent px-1.5 text-[11.5px] font-bold text-primary-ink tabular-nums">{invites}</span>}
                </button>
            </Popover>
        </>
    );
}

// Bottom of the sidebar: who you are, your role, and the account menu.
function UserMenu({ collapsed }) {
    const { user, role, logout } = useAuth();
    const { connected } = useRealtime();
    const navigate = useNavigate();
    const anchor = useRef(null);
    const [open, setOpen] = useState(false);
    const go = (to) => { setOpen(false); navigate(to); };

    return (
        <>
            <Tooltip label={`${user.fullName} · ${role?.name}`} side="right" disabled={!collapsed}>
                <button ref={anchor} onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}
                    className={`flex w-full items-center gap-2.5 rounded-lg border border-transparent text-left transition-colors hover:border-line hover:bg-white/[0.04] ${collapsed ? "h-10 justify-center" : "h-12 px-2"} ${open ? "border-line bg-white/[0.04]" : ""}`}>
                    <Avatar user={user} size="h-7 w-7 text-[11.5px]" online={connected} />
                    {!collapsed && (
                        <>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14.5px] leading-tight font-medium text-zinc-100">{user.fullName}</span>
                                <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-faint">{role?.name}</span>
                            </span>
                            <Icon name="more_horiz" className="text-[17px] text-faint" />
                        </>
                    )}
                </button>
            </Tooltip>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={248}>
                <div className="flex items-center gap-3 px-2.5 pt-2 pb-2.5">
                    <Avatar user={user} size="h-9 w-9 text-[13px]" />
                    <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-medium text-white">{user.fullName}</p>
                        <p className="truncate text-[13px] text-faint">{user.email}</p>
                    </div>
                </div>
                <div className="px-2.5 pb-2"><Badge tone="teal" icon="badge">{role?.name}</Badge></div>
                <div className="my-1 h-px bg-line-soft" />
                <button onClick={() => go("/settings")} className="menu-item"><Icon name="person" className="text-[18px] text-faint" />Profile & settings</button>
                <button onClick={() => go("/organization")} className="menu-item"><Icon name="apartment" className="text-[18px] text-faint" />Organization</button>
                <button onClick={() => go("/billing")} className="menu-item"><Icon name="credit_card" className="text-[18px] text-faint" />Plan & billing</button>
                <div className="my-1 h-px bg-line-soft" />
                <button onClick={() => { logout(); navigate("/login"); }} className="menu-item text-danger hover:bg-danger/10 hover:text-danger">
                    <Icon name="logout" className="text-[18px]" />Log out
                </button>
            </Popover>
        </>
    );
}

function Sidebar({ collapsed, onToggle, onSearch, onNavigate, mobile = false }) {
    return (
        <div className="flex h-full flex-col">
            <OrgSwitcher collapsed={collapsed} onNavigate={onNavigate} />

            <Tooltip label="Search (Ctrl K)" side="right" disabled={!collapsed}>
                <button onClick={onSearch} aria-label="Search"
                    className={`mt-2.5 flex h-[38px] items-center gap-2.5 rounded-lg border border-line bg-inset text-left text-[14.5px] text-faint transition-colors hover:border-line-strong hover:text-zinc-200 ${collapsed ? "justify-center px-0" : "px-2.5"}`}>
                    <Icon name="search" className="text-[18px]" />
                    {!collapsed && <><span className="flex-1">Search</span><Kbd>Ctrl K</Kbd></>}
                </button>
            </Tooltip>

            <nav className="-mx-2.5 mt-3 flex-1 overflow-x-hidden overflow-y-auto px-2.5" aria-label="Main">
                {NAV.map((section, i) => (
                    <div key={section.section} className={i ? "mt-4" : ""}>
                        {collapsed ? (i > 0 && <div className="mx-2 mb-3 h-px bg-line-soft" />) : <p className="eyebrow mb-1.5 px-2.5">{section.section}</p>}
                        <div className="space-y-0.5">
                            {section.items.map((item) => <NavItem key={item.to} item={item} collapsed={collapsed} />)}
                        </div>
                    </div>
                ))}
            </nav>

            {!mobile && (
                <Tooltip label="Expand sidebar" side="right" disabled={!collapsed}>
                    <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className={`mb-1.5 flex h-8 items-center gap-2.5 rounded-lg text-[14px] text-faint transition-colors hover:bg-white/[0.045] hover:text-zinc-200 ${collapsed ? "justify-center" : "px-2.5"}`}>
                        <Icon name={collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"} className="text-[18px]" />
                        {!collapsed && "Collapse"}
                    </button>
                </Tooltip>
            )}
            <div className="border-t border-line-soft pt-2"><UserMenu collapsed={collapsed} /></div>
        </div>
    );
}

export default function AppLayout() {
    const { organization, refresh } = useAuth();
    const location = useLocation();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);
    const [crumb, setCrumbState] = useState(null);
    const setCrumb = useCallback((value) => setCrumbState(value), []);
    const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } });
    const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ } return !c; });

    // Role changes arrive instantly over Socket.io ("session:changed"); as a fallback, re-check
    // every 2 minutes and when the tab regains focus.
    useEffect(() => {
        const update = () => refresh().catch(() => {});
        const timer = setInterval(update, 120000);
        window.addEventListener("focus", update);
        return () => { clearInterval(timer); window.removeEventListener("focus", update); };
    }, [refresh]);

    // Ctrl+K / ⌘K opens the command palette; Ctrl+B / ⌘B collapses the sidebar.
    useEffect(() => {
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => setMobileNav(false), [location.pathname]);

    // Removed from the organization while using the app.
    if (!organization) return <Navigate to="/welcome" replace />;

    const current = ALL_ITEMS.find((i) => location.pathname.startsWith(i.to))
        || (location.pathname.startsWith("/meet/") ? { label: "Meetings", to: "/meetings", icon: "videocam" } : null);
    const openAssistant = () => window.dispatchEvent(new CustomEvent("collabos:ask-ai", { detail: {} }));

    return (
        <RealtimeProvider>
        <div className="min-h-screen lg:flex">
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99] focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-ink">Skip to content</a>

            {/* Desktop sidebar */}
            <aside className={`hidden shrink-0 border-r border-line-soft bg-sidebar/85 p-2.5 backdrop-blur transition-[width] duration-200 lg:sticky lg:top-0 lg:block lg:h-screen ${collapsed ? "w-[64px]" : "w-[264px]"}`}>
                <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} onSearch={() => setPaletteOpen(true)} />
            </aside>

            {/* Mobile drawer */}
            {mobileNav && (
                <div className="fixed inset-0 z-50 animate-fade-in bg-[#030708b3] backdrop-blur-[2px] lg:hidden" onClick={() => setMobileNav(false)}>
                    <aside className="h-full w-[272px] animate-slide-up border-r border-line bg-sidebar p-2.5" onClick={(e) => e.stopPropagation()}>
                        <Sidebar collapsed={false} mobile onSearch={() => { setMobileNav(false); setPaletteOpen(true); }} onNavigate={() => setMobileNav(false)} />
                    </aside>
                </div>
            )}

            <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line-soft bg-page/80 px-4 backdrop-blur-md sm:px-6">
                    <button onClick={() => setMobileNav(true)} className="btn-icon -ml-2 lg:hidden" aria-label="Open menu"><Icon name="menu" /></button>
                    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14.5px]">
                        <Link to="/dashboard" className="hidden shrink-0 text-faint transition-colors hover:text-zinc-200 sm:inline">{organization.name}</Link>
                        <Icon name="chevron_right" className="hidden text-[16px] text-faint/60 sm:inline-block" />
                        {current?.to && crumb ? (
                            <>
                                <Link to={current.to} className="shrink-0 text-faint transition-colors hover:text-zinc-200">{current.label}</Link>
                                <Icon name="chevron_right" className="text-[16px] text-faint/60" />
                                <span className="truncate font-medium text-zinc-100" aria-current="page">{crumb}</span>
                            </>
                        ) : (
                            <span className="flex min-w-0 items-center gap-1.5 font-medium text-zinc-100" aria-current="page">
                                {current?.icon && <Icon name={current.icon} className="text-[17px] text-accent" />}
                                <span className="truncate">{current?.label || "CollabOS"}</span>
                            </span>
                        )}
                    </nav>
                    <div className="ml-auto flex items-center gap-1.5">
                        <button onClick={() => setPaletteOpen(true)} className="btn-icon lg:hidden" aria-label="Search"><Icon name="search" /></button>
                        <button onClick={openAssistant} className="group flex h-8 items-center gap-2 rounded-lg border border-line bg-white/[0.03] pr-1.5 pl-2.5 text-[14px] font-medium text-zinc-200 transition-colors hover:border-accent/40 hover:bg-accent/[0.07] hover:text-white" title="Open the assistant (Ctrl+J)">
                            <Icon name="auto_awesome" fill className="text-[16px] text-accent" />
                            <span className="hidden sm:inline">Assistant</span>
                            <span className="hidden sm:inline"><Kbd>Ctrl J</Kbd></span>
                        </button>
                        <NotificationBell />
                    </div>
                </header>

                <main id="main" className="px-4 pt-6 pb-24 sm:px-6 lg:px-8 lg:pt-7">
                    <div className="mx-auto max-w-[1280px] animate-fade-in" key={`${organization._id}:${location.pathname}`}>
                        <Outlet context={{ setCrumb }} />
                    </div>
                </main>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <UpgradeDialog />
            <MeetingRinger />
            <AssistantPanel />
        </div>
        </RealtimeProvider>
    );
}
