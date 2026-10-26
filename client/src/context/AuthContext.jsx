import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

const EMPTY = { user: null, organization: null, role: null, permissions: [] };

export function AuthProvider({ children }) {
    // { user, organization, role, permissions } — exactly what /api/auth/me returns.
    const [session, setSession] = useState(EMPTY);
    // True until we know whether a saved token is still valid.
    const [loading, setLoading] = useState(Boolean(getToken()));

    const logout = useCallback(() => {
        setToken(null);
        setSession(EMPTY);
    }, []);

    const applySession = useCallback((data) => {
        if (data.token) setToken(data.token);
        setSession({ user: data.user, organization: data.organization, role: data.role, permissions: data.permissions || [] });
    }, []);

    // Re-reads role and permissions from the server (e.g. after joining an org or a role change).
    const refresh = useCallback(() => api("/auth/me").then(applySession), [applySession]);

    useEffect(() => {
        setUnauthorizedHandler(logout);
        if (!getToken()) return;
        refresh().catch(logout).finally(() => setLoading(false));
    }, [logout, refresh]);

    const login = async (email, password) => applySession(await api("/auth/login", { method: "POST", body: { email, password } }));
    const register = async (details) => applySession(await api("/auth/register", { method: "POST", body: details }));
    const setUser = (user) => setSession((prev) => ({ ...prev, user }));

    // can("tasks.assign") → true/false. Only hides UI; the server enforces the real rules.
    const can = useCallback((permission) => session.permissions.includes(permission), [session.permissions]);

    const value = { ...session, loading, login, register, logout, refresh, applySession, setUser, can, isOwner: session.role?.level === 0 };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
