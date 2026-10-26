// Date helpers. Dates picked in the UI are "YYYY-MM-DD" strings.
// The server stores them as midnight UTC, so a due date's day is its ISO date part.

const pad = (n) => String(n).padStart(2, "0");

export const toYMD = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function parseYMD(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d);
}

// The calendar day of a stored due date, as "YYYY-MM-DD".
export const dueYMD = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

export const todayYMD = () => toYMD(new Date());

export function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);

// 6 weeks x 7 days, starting on Monday, covering the given month.
export function monthGrid(month) {
    const first = startOfMonth(month);
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const monthLabel = (date) => date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

// Whole days from today until the given "YYYY-MM-DD" (negative = in the past).
export function daysFromToday(ymd) {
    const ms = parseYMD(ymd) - parseYMD(todayYMD());
    return Math.round(ms / 864e5);
}

// Short human label for a due date: "Today", "Tomorrow", "2d overdue", "In 5 days", "12 Nov".
export function dueLabel(value, done = false) {
    const ymd = dueYMD(value);
    if (!ymd) return { text: "No date", tone: "none" };
    const days = daysFromToday(ymd);
    const short = parseYMD(ymd).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    if (done) return { text: short, tone: "done" };
    if (days < 0) return { text: `${-days}d overdue`, tone: "overdue" };
    if (days === 0) return { text: "Today", tone: "today" };
    if (days === 1) return { text: "Tomorrow", tone: "soon" };
    if (days < 7) return { text: `In ${days} days`, tone: "soon" };
    return { text: short, tone: "later" };
}
