// Optional browser/desktop notifications (the pop-ups Windows shows in the corner).
// The on/off choice is a per-browser preference, so it lives in localStorage.
const KEY = "collabos_desktop_alerts";

export const desktopAlertsSupported = () => typeof window !== "undefined" && "Notification" in window;

export function desktopAlertsEnabled() {
    try {
        return desktopAlertsSupported() && Notification.permission === "granted" && localStorage.getItem(KEY) === "on";
    } catch {
        return false;
    }
}

// Asks the browser for permission. Returns true if alerts are now on.
export async function enableDesktopAlerts() {
    if (!desktopAlertsSupported()) return false;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    try { localStorage.setItem(KEY, permission === "granted" ? "on" : "off"); } catch { /* storage unavailable */ }
    return permission === "granted";
}

export function disableDesktopAlerts() {
    try { localStorage.setItem(KEY, "off"); } catch { /* storage unavailable */ }
}

export function showDesktopAlert(title, body, link) {
    if (!desktopAlertsEnabled()) return;
    const alert = new Notification(title, { body, icon: "/logo.svg", tag: body });
    alert.onclick = () => {
        window.focus();
        if (link) window.location.assign(link);
    };
}
