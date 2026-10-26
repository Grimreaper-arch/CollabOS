// Due dates are stored as midnight UTC, so format them in UTC to avoid showing the previous day.
export function formatDate(value, fallback = "No due date") {
    if (!value) return fallback;
    return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export const plural = (count, word, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;

export function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(value) {
    const seconds = Math.floor((Date.now() - new Date(value)) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatDate(value);
}
