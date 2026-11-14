import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Icon, Popover } from "./ui";
import { timeAgo } from "../utils/format";
import { showDesktopAlert } from "../utils/desktopAlerts";
import { useSocketEvent } from "../context/RealtimeContext";

const KINDS = {
    reminder: { icon: "alarm", color: "tile-amber" },
    overdue: { icon: "error", color: "tile-red" },
    task: { icon: "task_alt", color: "tile-teal" },
    people: { icon: "group", color: "tile-green" },
    info: { icon: "notifications", color: "" }
};
const ALERT_KINDS = ["reminder", "overdue"];

export default function NotificationBell() {
    const navigate = useNavigate();
    const toast = useToast();
    const { organization, organizations, switchOrg } = useAuth();
    const anchor = useRef(null);
    const seen = useRef(null);
    const [data, setData] = useState({ notifications: [], unread: 0 });
    const [open, setOpen] = useState(false);

    // New due-date alerts pop up as a toast and (if enabled) a desktop notification.
    const load = useCallback(async () => {
        try {
            const result = await api("/notifications");
            const unreadAlerts = result.notifications.filter((n) => !n.read && ALERT_KINDS.includes(n.kind));
            if (seen.current === null) {
                // On first load, summarise unread alerts once per browser session.
                let shown = false;
                try { shown = sessionStorage.getItem("collabos_alert_summary") === "1"; sessionStorage.setItem("collabos_alert_summary", "1"); } catch { /* storage unavailable */ }
                if (unreadAlerts.length && !shown) {
                    toast.reminder(`${unreadAlerts.length} due-date alert${unreadAlerts.length === 1 ? "" : "s"}`, unreadAlerts[0].text);
                }
            } else {
                result.notifications
                    .filter((n) => !n.read && !seen.current.has(n._id))
                    .forEach((n) => {
                        if (ALERT_KINDS.includes(n.kind)) toast.reminder(n.kind === "overdue" ? "Task overdue" : "Due soon", n.text);
                        showDesktopAlert("CollabOS", n.text, n.link);
                    });
            }
            seen.current = new Set(result.notifications.map((n) => n._id));
            setData(result);
        } catch {
            // Ignore polling errors; the next poll will retry.
        }
    }, [toast]);

    // New notifications are pushed over Socket.io; the 60-second poll only covers a dropped connection.
    useSocketEvent("notification:new", () => load());
    useEffect(() => {
        load();
        const timer = setInterval(load, 60000);
        return () => clearInterval(timer);
    }, [load]);

    const markAllRead = async () => {
        await api("/notifications/read-all", { method: "PATCH" }).catch(() => {});
        setData((prev) => ({ unread: 0, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }));
    };

    // A notification from another organization switches to it before opening the link.
    const otherOrg = (n) => n.org && n.org._id !== organization?._id && organizations.some((o) => o._id === n.org._id);

    const openItem = async (n) => {
        setOpen(false);
        if (otherOrg(n)) {
            navigate("/dashboard");
            await switchOrg(n.org._id).catch(() => {});
        }
        if (n.link) navigate(n.link);
    };

    return (
        <>
            <button ref={anchor} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} className={`btn-icon relative ${open ? "bg-white/[0.07] text-white" : ""}`} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}>
                <Icon name="notifications" />
                {data.unread > 0 && (
                    <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11.5px] font-bold text-primary-ink tabular-nums ring-2 ring-page">
                        {data.unread > 9 ? "9+" : data.unread}
                    </span>
                )}
            </button>

            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="end" width={Math.min(400, window.innerWidth - 16)} className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">Notifications{data.unread > 0 && <span className="badge badge-teal">{data.unread} new</span>}</p>
                    {data.unread > 0 && <button onClick={markAllRead} className="btn-ghost btn-sm"><Icon name="done_all" className="text-[16px]" />Mark all read</button>}
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-1.5">
                    {data.notifications.length ? data.notifications.map((n) => {
                        const kind = KINDS[n.kind] || KINDS.info;
                        return (
                            <button key={n._id} onClick={() => openItem(n)} className={`relative flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-white/[0.05] ${n.read ? "" : "bg-accent/[0.04]"}`}>
                                <span className={`tile h-8 w-8 ${kind.color}`}><Icon name={kind.icon} className="text-[18px]" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-[14.5px] leading-snug ${n.read ? "text-muted" : "text-zinc-100"}`}>{n.text}</span>
                                    <span className="mt-1 block text-[12.5px] text-faint">
                                        {timeAgo(n.createdAt)}
                                        {n.org && n.org._id !== organization?._id && <> · <span className="text-muted">{n.org.name}</span></>}
                                    </span>
                                </span>
                                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                            </button>
                        );
                    }) : (
                        <div className="px-4 py-12 text-center">
                            <span className="tile mx-auto h-11 w-11 rounded-full"><Icon name="notifications" className="text-[22px]" /></span>
                            <p className="mt-3 text-[15px] font-medium text-zinc-100">You're all caught up</p>
                            <p className="mt-0.5 text-[14px] text-muted">Task updates, reminders and invitations will show up here.</p>
                        </div>
                    )}
                </div>
            </Popover>
        </>
    );
}
