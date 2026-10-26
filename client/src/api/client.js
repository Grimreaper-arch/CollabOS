// Small wrapper around fetch that adds the login token and turns API errors into exceptions.
const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "collabos_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

// Lets the auth context log the user out when the server says the token is no longer valid.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => { onUnauthorized = handler; };

export async function api(path, { method = "GET", body, form } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${API_URL}/api${path}`, {
        method,
        headers,
        // FormData is used for file uploads (Multer on the server reads it).
        body: form || (body ? JSON.stringify(body) : undefined)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 && token) onUnauthorized();
        throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
}

// Downloads a protected file: fetch it with the token, then save it via a temporary link.
export async function downloadFile(fileId, filename) {
    const response = await fetch(`${API_URL}/api/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) throw new Error("Download failed.");

    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    URL.revokeObjectURL(url);
}

export const assetUrl = (path) => (path ? `${API_URL}${path}` : "");
