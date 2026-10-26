import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Icon, Popover } from "./ui";
import { timeAgo } from "../utils/format";
import { showDesktopAlert } from "../utils/desktopAlerts";

const KINDS = {
    reminder: { icon: "alarm", color: "bg-warning/12 text-warning" },
    overdue: { icon: "running_with_errors", color: "bg-danger/12 text-danger" },
    task: { icon: "task_alt", color: "bg-primary/12 text-primary" },
    people: { icon: "group", color: "bg-accent/12 text-accent" },
    info: { icon: "notifications", color: "bg-white/[0.06] text-muted" }
};
const ALERT_KINDS = ["reminder", "overdue"];

export default function NotificationBell() {
    const navigate = useNavigate();
    const toast = useToast();
    const anchor = useRef(null);
    const seen = useRef(null);
    const [data, setData] = useState({ notifications: [], unread: 0 });
    const [open, setOpen] = useState(false);

    // Polls every 20s. New due-date alerts pop up as a toast and (if enabled) a desktop notification.
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

    useEffect(() => {
        load();
        const timer = setInterval(load, 20000);
        return () => clearInterval(timer);
    }, [load]);

    const markAllRead = async () => {
        await api("/notifications/read-all", { method: "PATCH" }).catch(() => {});
        setData((prev) => ({ unread: 0, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }));
    };

    const openItem = (n) => {
        setOpen(false);
        if (n.link) navigate(n.link);
    };

    return (
        <>
            <button ref={anchor} onClick={() => setOpen((o) => !o)} className="btn-icon relative" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}>
                <Icon name="notifications" />
                {data.unread > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-ink ring-2 ring-page">
                        {data.unread > 9 ? "9+" : data.unread}
                    </span>
                )}
            </button>

            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="end" width={380} className="p-0">
                <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                    <p className="text-sm font-semibold text-white">Notifications</p>
                    {data.unread > 0 && <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all as read</button>}
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-1.5">
                    {data.notifications.length ? data.notifications.map((n) => {
                        const kind = KINDS[n.kind] || KINDS.info;
                        return (
                            <button key={n._id} onClick={() => openItem(n)} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left hover:bg-white/[0.04]">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kind.color}`}><Icon name={kind.icon} className="text-[18px]" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-[13px] leading-snug ${n.read ? "text-muted" : "text-zinc-100"}`}>{n.text}</span>
                                    <span className="mt-1 block text-[11px] text-faint">{timeAgo(n.createdAt)}</span>
                                </span>
                                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                            </button>
                        );
                    }) : (
                        <div className="px-4 py-10 text-center">
                            <Icon name="notifications_off" className="text-faint" />
                            <p className="mt-2 text-sm text-muted">You're all caught up.</p>
                        </div>
                    )}
                </div>
            </Popover>
        </>
    );
}
