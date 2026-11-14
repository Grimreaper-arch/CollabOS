// Formatting for plans and prices. The plans themselves come from the server (GET /api/billing/plans).

// Prices are in paise: 49900 → "₹499". Shows paise only when there are some.
export function rupees(paise) {
    const value = paise / 100;
    return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function formatBytes(bytes) {
    if (bytes >= 1024 ** 4) return `${+(bytes / 1024 ** 4).toFixed(1)} TB`;
    if (bytes >= 1024 ** 3) return `${+(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${+(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${bytes} B`;
}

// One line per limit on a pricing card. null means unlimited.
export const FEATURE_ROWS = [
    ["projects", "folder_open", (v) => (v === null ? "Unlimited projects" : `${v} projects`)],
    ["members", "group", (v) => (v === null ? "Unlimited members" : `Up to ${v} members`)],
    ["customRoles", "admin_panel_settings", (v) => (v === null ? "Unlimited custom roles" : v === 0 ? "5 built-in roles" : `${v} custom roles`)],
    ["storageBytes", "cloud", (v) => `${formatBytes(v)} storage`],
    ["maxFileBytes", "upload_file", (v) => `Files up to ${formatBytes(v)}`],
    ["meetingMinutes", "videocam", (v, l) => `${v === null ? "Unlimited" : `${v}-minute`} meetings · ${l.meetingParticipants} people`],
    ["aiMessagesPerDay", "auto_awesome", (v) => (v === null ? "Unlimited AI assistant" : `${v} AI messages a day`)],
    ["codeRunsPerDay", "play_circle", (v) => (v === null ? "Unlimited code runs" : `${v} code runs a day`)],
    ["auditDays", "history", (v) => (v === null ? "Full activity history" : v >= 365 ? "1 year of activity history" : `${v} days of activity history`)]
];

// Usage bars on the billing page: [key in usage, key in limits, label, format]
export const USAGE_ROWS = [
    ["projects", "projects", "Projects", (v) => v],
    ["members", "members", "Members", (v) => v],
    ["customRoles", "customRoles", "Custom roles", (v) => v],
    ["storageBytes", "storageBytes", "Storage", formatBytes]
];

// Shown when something hits a plan limit; AppLayout listens and opens the upgrade dialog.
export const PLAN_LIMIT_EVENT = "collabos:plan-limit";
