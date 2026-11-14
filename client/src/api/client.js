// Small wrapper around fetch that adds the login token and turns API errors into exceptions.
const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "collabos_token";

const ORG_KEY = "collabos_org";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

// The organization this browser is working in. Sent with every request as "X-Org-Id".
export const getActiveOrg = () => localStorage.getItem(ORG_KEY);
export const setActiveOrg = (id) => (id ? localStorage.setItem(ORG_KEY, id) : localStorage.removeItem(ORG_KEY));

function authHeaders() {
    const headers = {};
    const token = getToken();
    const org = getActiveOrg();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (org) headers["X-Org-Id"] = org;
    return headers;
}

// Lets the auth context log the user out when the server says the token is no longer valid.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => { onUnauthorized = handler; };

// The access token lasts 15 minutes. When it expires, the httpOnly refresh cookie (which this
// code can't read; the browser sends it) gets a new one. Parallel requests share one refresh.
let refreshing = null;
export function refreshToken() {
    refreshing ??= fetch(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Session ended"))))
        .then(({ token }) => { setToken(token); return token; })
        .finally(() => { refreshing = null; });
    return refreshing;
}

// fetch with the login headers; on an expired token, refresh once and try again.
async function send(path, init = {}) {
    const go = () => fetch(`${API_URL}/api${path}`, { ...init, headers: { ...authHeaders(), ...init.headers }, credentials: "include" });
    let response = await go();
    if (response.status === 401 && getToken()) {
        const data = await response.clone().json().catch(() => ({}));
        if (data.code === "TOKEN_EXPIRED" && (await refreshToken().catch(() => null))) response = await go();
    }
    return response;
}

export async function api(path, { method = "GET", body, form } = {}) {
    const token = getToken();
    const response = await send(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        // FormData is used for file uploads (Multer on the server reads it).
        body: form || (body ? JSON.stringify(body) : undefined)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 && token) onUnauthorized();
        // A plan limit opens the upgrade dialog (components/UpgradeDialog.jsx) wherever it happens.
        if (data.code === "PLAN_LIMIT") window.dispatchEvent(new CustomEvent("collabos:plan-limit", { detail: data.message }));
        throw Object.assign(new Error(data.message || `Request failed (${response.status})`), { status: response.status, code: data.code });
    }
    return data;
}

// Downloads a protected file: fetch it with the token, then save it via a temporary link.
export async function downloadFile(fileId, filename) {
    const response = await send(`/files/${fileId}/download`);
    if (!response.ok) throw new Error("Download failed.");

    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
}

export const assetUrl = (path) => (path ? `${API_URL}${path}` : "");

// POST that answers with Server-Sent Events (used by the AI assistant).
// Calls onEvent(object) for every "data: {...}" line as it arrives.
export async function streamApi(path, body, onEvent, { signal } = {}) {
    const response = await send(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.code === "PLAN_LIMIT") window.dispatchEvent(new CustomEvent("collabos:plan-limit", { detail: data.message }));
        throw Object.assign(new Error(data.message || `Request failed (${response.status})`), { status: response.status, code: data.code });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const event of events) {
            const line = event.split("\n").find((l) => l.startsWith("data: "));
            if (line) onEvent(JSON.parse(line.slice(6)));
        }
    }
}
