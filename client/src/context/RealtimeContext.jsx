import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getToken, refreshToken } from "../api/client";
import { useAuth } from "./AuthContext";

const RealtimeContext = createContext({ socket: null, connected: false, online: new Set() });

// One Socket.io connection per tab for the active organization. Reconnects with a fresh token
// when the old one expires, and opens a new connection when you switch organization.
export function RealtimeProvider({ children }) {
    const { organization, refresh } = useAuth();
    const orgId = organization?._id;
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [online, setOnline] = useState(new Set());
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

    useEffect(() => {
        if (!orgId) return;
        const s = io({
            path: "/socket.io",
            withCredentials: true,
            // A function, so every (re)connect sends the current token.
            auth: (send) => send({ token: getToken(), orgId })
        });

        s.on("connect", () => setConnected(true));
        s.on("disconnect", (reason) => {
            setConnected(false);
            // The server closed it on purpose (e.g. removed from the organization): reload the session.
            if (reason === "io server disconnect") refreshRef.current().catch(() => {});
        });
        s.on("connect_error", async (error) => {
            if (error.message === "TOKEN_EXPIRED") {
                try {
                    await refreshToken();
                    s.connect();
                } catch { /* refresh failed: the API client will log the user out */ }
            }
        });

        s.on("presence:list", ({ userIds }) => setOnline(new Set(userIds)));
        s.on("presence", ({ userId, online: isOnline }) => setOnline((prev) => {
            const next = new Set(prev);
            if (isOnline) next.add(userId); else next.delete(userId);
            return next;
        }));
        // Role or membership changed somewhere else: pick up new permissions right away.
        s.on("session:changed", () => refreshRef.current().catch(() => {}));

        setSocket(s);
        return () => {
            s.disconnect();
            setSocket(null);
            setConnected(false);
            setOnline(new Set());
        };
    }, [orgId]);

    return <RealtimeContext.Provider value={{ socket, connected, online }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

// Runs `handler` whenever the server sends `event`. The latest handler is always used.
export function useSocketEvent(event, handler) {
    const { socket } = useRealtime();
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(() => {
        if (!socket) return;
        const listener = (...args) => ref.current(...args);
        socket.on(event, listener);
        return () => socket.off(event, listener);
    }, [socket, event]);
}

// Reloads a page's data when something changes in a project (tasks, files, comments...).
// Pass a project id to only react to that project. Bursts of changes cause one reload.
export function useLiveReload(reload, projectId) {
    const timer = useRef(null);
    useSocketEvent("project:changed", ({ project }) => {
        if (projectId && project !== projectId) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => reload(), 300);
    });
    useEffect(() => () => clearTimeout(timer.current), []);
}
