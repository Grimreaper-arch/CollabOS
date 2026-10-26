import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/ui";

const ToastContext = createContext(null);

const STYLES = {
    success: { icon: "check_circle", color: "text-success" },
    error: { icon: "error", color: "text-danger" },
    info: { icon: "info", color: "text-accent" },
    reminder: { icon: "alarm", color: "text-warning" }
};

// Small pop-up messages in the bottom-right corner.
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
                <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
                    {toasts.map((t) => {
                        const s = STYLES[t.tone];
                        return (
                            <div key={t.id} role="status" className="card pointer-events-auto flex animate-slide-up items-start gap-3 bg-[#151519]/95 p-3.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
                                <Icon name={s.icon} className={`mt-0.5 ${s.color}`} fill />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white">{t.title}</p>
                                    {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
                                </div>
                                <button onClick={() => dismiss(t.id)} className="text-faint hover:text-white" aria-label="Dismiss"><Icon name="close" className="text-base" /></button>
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
