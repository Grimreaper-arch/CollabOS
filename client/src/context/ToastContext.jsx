import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/ui";

const ToastContext = createContext(null);

const STYLES = {
    success: { icon: "check_circle", color: "text-success", bar: "bg-success" },
    error: { icon: "error", color: "text-danger", bar: "bg-danger" },
    info: { icon: "info", color: "text-accent", bar: "bg-accent" },
    reminder: { icon: "alarm", color: "text-warning", bar: "bg-warning" }
};

// Small pop-up messages in the top-right corner, under the header.
// Usage: const toast = useToast(); toast.success("Saved"); toast.error("Something failed");
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

    const show = useCallback((tone, title, description) => {
        const id = Math.random().toString(36).slice(2);
        setToasts((list) => [...list.slice(-3), { id, tone, title, description }]);
        setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
    }, [dismiss]);

    const api = useMemo(() => ({
        success: (title, description) => show("success", title, description),
        error: (title, description) => show("error", title, description),
        info: (title, description) => show("info", title, description),
        reminder: (title, description) => show("reminder", title, description)
    }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {createPortal(
                <div className="pointer-events-none fixed top-16 right-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
                    {toasts.map((t) => {
                        const s = STYLES[t.tone];
                        return (
                            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="floating pointer-events-auto relative flex animate-slide-in items-start gap-3 overflow-hidden p-3.5 pl-4">
                                <span className={`absolute inset-y-0 left-0 w-[3px] ${s.bar}`} aria-hidden="true" />
                                <Icon name={s.icon} className={`mt-0.5 ${s.color}`} fill />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-medium text-white">{t.title}</p>
                                    {t.description && <p className="mt-0.5 text-[14.5px] text-muted">{t.description}</p>}
                                </div>
                                <button onClick={() => dismiss(t.id)} className="text-faint transition-colors hover:text-white" aria-label="Dismiss"><Icon name="close" className="text-[17px]" /></button>
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
