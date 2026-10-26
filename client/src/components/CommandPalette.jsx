import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Icon, Kbd } from "./ui";

// Ctrl+K / ⌘K quick switcher: jump to a page or project, or start a common action.
export default function CommandPalette({ open, onClose }) {
    const navigate = useNavigate();
    const { can } = useAuth();
    const input = useRef(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActive(0);
        api("/projects").then((d) => setProjects(d.projects)).catch(() => {});
        setTimeout(() => input.current?.focus(), 0);
    }, [open]);

    const items = useMemo(() => {
        const all = [
            { group: "Actions", icon: "add_task", label: "Add a task", to: "/tasks?new=1", show: can("tasks.assign") },
            { group: "Actions", icon: "create_new_folder", label: "New project", to: "/projects?new=1", show: can("projects.create") },
            { group: "Actions", icon: "person_add", label: "Invite people", to: "/organization?tab=invitations", show: can("members.invite") },
            { group: "Actions", icon: "badge", label: "Manage roles", to: "/organization?tab=roles", show: true },
            { group: "Go to", icon: "space_dashboard", label: "Overview", to: "/dashboard" },
            { group: "Go to", icon: "calendar_month", label: "My Calendar", to: "/calendar" },
            { group: "Go to", icon: "folder_open", label: "Projects", to: "/projects" },
            { group: "Go to", icon: "checklist", label: "Tasks", to: "/tasks" },
            { group: "Go to", icon: "code", label: "Code editor", to: "/code" },
            { group: "Actions", icon: "open_in_new", label: "Open VS Code online (vscode.dev)", href: "https://vscode.dev" },
            { group: "Go to", icon: "forum", label: "Messages", to: "/messages" },
            { group: "Go to", icon: "monitoring", label: "Analytics", to: "/analytics" },
            { group: "Go to", icon: "corporate_fare", label: "Organization", to: "/organization" },
            { group: "Go to", icon: "settings", label: "Settings", to: "/settings" },
            ...projects.map((p) => ({ group: "Projects", icon: "folder", label: p.name, to: `/projects/${p._id}`, hint: p.owner?.fullName }))
        ].filter((i) => i.show !== false);
        const q = query.trim().toLowerCase();
        return q ? all.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)) : all;
    }, [projects, query, can]);

    const go = (item) => {
        onClose();
        if (item.href) window.open(item.href, "_blank", "noopener");
        else navigate(item.to);
    };

    const onKeyDown = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === "Enter" && items[active]) go(items[active]);
        else if (e.key === "Escape") onClose();
    };

    if (!open) return null;

    let lastGroup = null;
    return createPortal(
        <div className="fixed inset-0 z-[70] flex animate-fade-in items-start justify-center bg-black/60 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="card w-full max-w-xl animate-pop-in overflow-hidden bg-[#121216] shadow-2xl shadow-black/70" role="dialog" aria-label="Command palette">
                <div className="flex items-center gap-3 border-b border-line-soft px-4">
                    <Icon name="search" className="text-faint" />
                    <input
                        ref={input}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Search pages, projects and actions…"
                        className="h-14 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-faint"
                        aria-label="Search"
                    />
                    <Kbd>Esc</Kbd>
                </div>
                <ul className="max-h-[50vh] overflow-y-auto p-2">
                    {items.length ? items.map((item, i) => {
                        const header = item.group !== lastGroup ? item.group : null;
                        lastGroup = item.group;
                        return (
                            <li key={`${item.group}-${item.to || item.href}`}>
                                {header && <p className="px-2.5 pt-3 pb-1.5 font-mono text-[10px] uppercase tracking-[.18em] text-faint">{header}</p>}
                                <button
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => go(item)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm ${i === active ? "bg-white/[0.06] text-white" : "text-zinc-300"}`}
                                >
                                    <Icon name={item.icon} className={`text-[18px] ${i === active ? "text-primary" : "text-faint"}`} />
                                    <span className="flex-1 truncate">{item.label}</span>
                                    {item.hint && <span className="text-xs text-faint">{item.hint}</span>}
                                    {i === active && <Icon name="keyboard_return" className="text-base text-faint" />}
                                </button>
                            </li>
                        );
                    }) : <li className="px-3 py-8 text-center text-sm text-muted">No results for “{query}”.</li>}
                </ul>
                <div className="flex items-center gap-4 border-t border-line-soft px-4 py-2.5 text-[11px] text-faint">
                    <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
                    <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
                </div>
            </div>
        </div>,
        document.body
    );
}
