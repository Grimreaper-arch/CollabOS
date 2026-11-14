import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setActiveOrg, setToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

const EMPTY = { user: null, organization: null, role: null, permissions: [], organizations: [] };

export function AuthProvider({ children }) {
    // { user, organization, role, permissions, organizations } — exactly what /api/auth/me returns.
    // `organization` is the active one; `organizations` lists every one the user belongs to.
    const [session, setSession] = useState(EMPTY);
    // True until we know whether a saved token is still valid.
    const [loading, setLoading] = useState(Boolean(getToken()));

    const logout = useCallback(() => {
        // Clears the httpOnly refresh cookie on the server (the page can't touch it itself).
        if (getToken()) api("/auth/logout", { method: "POST" }).catch(() => {});
        setToken(null);
        setActiveOrg(null);
        setSession(EMPTY);
    }, []);

    const applySession = useCallback((data) => {
        if (data.token) setToken(data.token);
        // The server may have picked a different organization (e.g. after leaving one), so follow it.
        setActiveOrg(data.organization?._id || null);
        setSession({
            user: data.user, organization: data.organization, role: data.role,
            permissions: data.permissions || [], organizations: data.organizations || []
        });
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

    // Switches the active organization: later requests carry its id, and the session is reloaded.
    const switchOrg = useCallback(async (orgId) => {
        setActiveOrg(orgId);
        await refresh();
    }, [refresh]);

    // can("tasks.assign") → true/false. Only hides UI; the server enforces the real rules.
    const can = useCallback((permission) => session.permissions.includes(permission), [session.permissions]);

    const value = { ...session, loading, login, register, logout, refresh, applySession, setUser, switchOrg, can, isOwner: session.role?.level === 0 };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
