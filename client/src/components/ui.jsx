// CollabOS component library: small, reusable building blocks used by every page.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "../api/client";
import { WEEKDAYS, addDays, addMonths, dueLabel, monthGrid, monthLabel, parseYMD, startOfMonth, toYMD, todayYMD } from "../utils/dates";

// ---------- Basics ----------

export const Icon = ({ name, className = "", fill = false }) => (
    <span className={`icon ${className}`} style={fill ? { fontVariationSettings: '"FILL" 1' } : undefined} aria-hidden="true">{name}</span>
);

export const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;

export function Spinner({ full = false }) {
    const spinner = <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" role="status" aria-label="Loading" />;
    return full ? <div className="flex min-h-screen items-center justify-center">{spinner}</div> : <div className="flex justify-center py-10">{spinner}</div>;
}

export const Skeleton = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />;

// A page-shaped loading placeholder.
export function PageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-72" /></div>
            <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
            <Skeleton className="h-64 rounded-2xl" />
        </div>
    );
}

export function PageHeader({ eyebrow, title, subtitle, children }) {
    return (
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow && <p className="font-mono text-[11px] font-medium uppercase tracking-[.2em] text-primary/90">{eyebrow}</p>}
                <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-white">{title}</h1>
                {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </header>
    );
}

const TONES = {
    default: "bg-white/[0.05] text-zinc-300",
    primary: "bg-primary/12 text-primary",
    accent: "bg-accent/12 text-accent",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/12 text-danger"
};

export function StatCard({ label, value, icon, tone = "default", hint }) {
    return (
        <article className="card group relative overflow-hidden p-5 transition hover:border-[#2e2e36]">
            <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-medium text-muted">{label}</p>
                {icon && <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[tone]}`}><Icon name={icon} className="text-[18px]" /></span>}
            </div>
            <p className="mt-3 font-mono text-[32px] leading-none font-semibold tracking-tight text-white tabular-nums">{value}</p>
            {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
        </article>
    );
}

export function Panel({ title, description, action, children, className = "", bodyClassName = "" }) {
    return (
        <section className={`card ${className}`}>
            {(title || action) && (
                <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
                        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
                    </div>
                    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
                </div>
            )}
            <div className={`p-5 ${bodyClassName}`}>{children}</div>
        </section>
    );
}

export function Empty({ icon = "inbox", title, children, action }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-faint"><Icon name={icon} /></span>
            {title && <p className="mt-3 text-sm font-medium text-zinc-200">{title}</p>}
            {children && <p className="mt-1 max-w-sm text-[13px] text-muted">{children}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export const ErrorText = ({ children }) => (children ? (
    <p className="flex items-center gap-1.5 text-[13px] text-danger" role="alert"><Icon name="error" className="text-base" />{children}</p>
) : null);

const AVATAR_COLORS = ["from-violet-400 to-indigo-500", "from-cyan-400 to-sky-500", "from-emerald-400 to-teal-500", "from-amber-300 to-orange-500", "from-pink-400 to-rose-500"];

export function Avatar({ user, size = "h-8 w-8 text-xs", ring = false }) {
    const name = user?.fullName || "?";
    const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const ringClass = ring ? "ring-2 ring-panel" : "";
    if (user?.avatar) return <img src={assetUrl(user.avatar)} alt={name} title={name} className={`${size} ${ringClass} shrink-0 rounded-full object-cover`} />;
    const color = AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
    return (
        <div title={name} className={`${size} ${ringClass} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color} font-semibold text-black/80`}>
            {initials}
        </div>
    );
}

export function AvatarStack({ users, max = 4, size = "h-7 w-7 text-[10px]" }) {
    const shown = users.slice(0, max);
    return (
        <div className="flex -space-x-2">
            {shown.map((u) => <Avatar key={u._id} user={u} size={size} ring />)}
            {users.length > max && <div className={`${size} flex items-center justify-center rounded-full bg-raised font-medium text-muted ring-2 ring-panel`}>+{users.length - max}</div>}
        </div>
    );
}

export const PRIORITY = {
    high: { label: "High", dot: "bg-danger", text: "text-danger" },
    medium: { label: "Medium", dot: "bg-warning", text: "text-warning" },
    low: { label: "Low", dot: "bg-success", text: "text-success" }
};

export function PriorityBadge({ priority = "medium" }) {
    const p = PRIORITY[priority] || PRIORITY.medium;
    return <span className="chip"><span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label}</span>;
}

const DUE_TONES = {
    overdue: "border-danger/30 bg-danger/10 text-danger",
    today: "border-warning/30 bg-warning/10 text-warning",
    soon: "border-accent/25 bg-accent/10 text-accent",
    later: "",
    done: "text-faint",
    none: "text-faint"
};

export function DueChip({ date, done }) {
    const { text, tone } = dueLabel(date, done);
    return <span className={`chip ${DUE_TONES[tone]}`}><Icon name="event" className="text-[14px]" />{text}</span>;
}

export function ProgressBar({ percent, tone = "bg-primary" }) {
    return (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={`h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${percent}%` }} />
        </div>
    );
}

// ---------- Form building blocks ----------

export function Field({ label, hint, error, children, className = "" }) {
    return (
        <div className={className}>
            {label && <label className="label">{label}</label>}
            {children}
            {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
        </div>
    );
}

// Text input with an optional leading icon.
export function Input({ icon, className = "", ...props }) {
    if (!icon) return <input className={`field ${className}`} {...props} />;
    return (
        <div className="relative">
            <Icon name={icon} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-faint" />
            <input className={`field pl-10 ${className}`} {...props} />
        </div>
    );
}

// Pill-style switch between a few options.
export function Segmented({ options, value, onChange, ariaLabel }) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-full rounded-xl border border-line bg-inset p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition ${value === o.value ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-muted hover:text-zinc-200"}`}
                >
                    {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />}
                    {o.icon && <Icon name={o.icon} className="text-base" />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ checked, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition ${checked ? "border-primary/50 bg-primary" : "border-line bg-white/[0.06]"}`}>
            <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
        </button>
    );
}

// ---------- Overlays ----------

// Floating panel anchored to a trigger element. Rendered in a portal so it is never clipped.
export function Popover({ anchorRef, open, onClose, children, align = "start", width, className = "" }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const anchor = anchorRef.current?.getBoundingClientRect();
            if (!anchor) return;
            const w = width === "anchor" ? anchor.width : width || ref.current?.offsetWidth || 260;
            const h = ref.current?.offsetHeight || 300;
            const spaceBelow = window.innerHeight - anchor.bottom;
            const top = spaceBelow < h + 12 && anchor.top > h + 12 ? anchor.top - h - 6 : anchor.bottom + 6;
            let left = align === "end" ? anchor.right - w : anchor.left;
            left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
            setPos({ top, left, width: width ? w : undefined });
        };
        place();
        const frame = requestAnimationFrame(place);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, anchorRef, align, width]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
        };
        // Capture phase so Escape closes the popover without also closing a modal behind it.
        const onKey = (e) => {
            if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey, true);
        };
    }, [open, onClose, anchorRef]);

    if (!open) return null;
    return createPortal(
        <div
            ref={ref}
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width }}
            className={`z-[80] animate-pop-in rounded-xl border border-line bg-[#141418]/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl ${className}`}
        >
            {children}
        </div>,
        document.body
    );
}

export function Modal({ open, onClose, title, description, children, size = "max-w-lg" }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex animate-fade-in items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div role="dialog" aria-modal="true" aria-label={title} className={`card w-full ${size} animate-pop-in bg-[#121216] shadow-2xl shadow-black/60`}>
                <div className="flex items-start justify-between gap-4 px-6 pt-5">
                    <div>
                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="btn-icon -mt-1 -mr-2" aria-label="Close"><Icon name="close" /></button>
                </div>
                <div className="px-6 pt-5 pb-6">{children}</div>
            </div>
        </div>,
        document.body
    );
}

// ---------- Select (custom dropdown) ----------
// options: [{ value, label, hint?, icon?, dot?, user? }]
export function Select({ value, onChange, options, placeholder = "Select…", ariaLabel, disabled, className = "", align, width = "anchor" }) {
    const anchor = useRef(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const selected = options.find((o) => String(o.value) === String(value));

    const choose = (option) => {
        onChange(option.value);
        setOpen(false);
        anchor.current?.focus();
    };

    const onKeyDown = (e) => {
        if (!open && ["ArrowDown", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            setActive(Math.max(0, options.indexOf(selected)));
            setOpen(true);
        } else if (open && e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
        else if (open && e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (open && e.key === "Enter") { e.preventDefault(); if (options[active]) choose(options[active]); }
    };

    const optionContent = (o) => (
        <>
            {o.user && <Avatar user={o.user} size="h-5 w-5 text-[9px]" />}
            {o.icon && <Icon name={o.icon} className="text-[18px] text-muted" />}
            {o.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} />}
            <span className="truncate">{o.label}</span>
        </>
    );

    return (
        <>
            <button
                ref={anchor}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => { setActive(Math.max(0, options.indexOf(selected))); setOpen((o) => !o); }}
                onKeyDown={onKeyDown}
                className={`field flex items-center gap-2 text-left ${open ? "border-primary/60 ring-4 ring-primary/10" : ""} ${className}`}
            >
                <span className={`flex min-w-0 flex-1 items-center gap-2 ${selected ? "" : "text-faint"}`}>{selected ? optionContent(selected) : placeholder}</span>
                <Icon name="unfold_more" className="text-[18px] text-faint" />
            </button>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={width} align={align}>
                <ul role="listbox" className="max-h-72 overflow-y-auto">
                    {options.length ? options.map((o, i) => {
                        const isSelected = String(o.value) === String(value);
                        return (
                            <li key={o.value} role="option" aria-selected={isSelected}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => choose(o)}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-white/[0.06] text-white" : "text-zinc-300"}`}
                                >
                                    {optionContent(o)}
                                    {o.hint && <span className="ml-auto pl-3 text-xs text-faint">{o.hint}</span>}
                                    {isSelected && <Icon name="check" className={`${o.hint ? "" : "ml-auto"} text-[18px] text-primary`} />}
                                </button>
                            </li>
                        );
                    }) : <li className="px-3 py-2 text-sm text-faint">No options</li>}
                </ul>
            </Popover>
        </>
    );
}

// ---------- Date picker ----------
// value / onChange use "YYYY-MM-DD" strings ("" = no date).
export function DatePicker({ value, onChange, placeholder = "Pick a date", ariaLabel = "Date", clearable = true }) {
    const anchor = useRef(null);
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => startOfMonth(value ? parseYMD(value) : new Date()));
    const today = todayYMD();

    const openPicker = () => {
        setView(startOfMonth(value ? parseYMD(value) : new Date()));
        setOpen((o) => !o);
    };
    const pick = (ymd) => { onChange(ymd); setOpen(false); };
    const shortcuts = [["Today", 0], ["Tomorrow", 1], ["Next week", 7]];

    const label = value ? parseYMD(value).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : placeholder;
    const due = value ? dueLabel(new Date(`${value}T00:00:00Z`)) : null;

    return (
        <>
            <button ref={anchor} type="button" aria-label={ariaLabel} aria-haspopup="dialog" onClick={openPicker}
                className={`field flex items-center gap-2.5 text-left ${open ? "border-primary/60 ring-4 ring-primary/10" : ""}`}>
                <Icon name="calendar_month" className="text-[18px] text-primary" />
                <span className={`flex-1 truncate ${value ? "" : "text-faint"}`}>{label}</span>
                {due && <span className="text-xs text-faint">{due.text}</span>}
            </button>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={296} className="p-3">
                <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setView(addMonths(view, -1))} className="btn-icon h-8 w-8" aria-label="Previous month"><Icon name="chevron_left" /></button>
                    <span className="text-sm font-semibold text-white">{monthLabel(view)}</span>
                    <button type="button" onClick={() => setView(addMonths(view, 1))} className="btn-icon h-8 w-8" aria-label="Next month"><Icon name="chevron_right" /></button>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center font-mono text-[10px] uppercase text-faint">
                    {WEEKDAYS.map((d) => <span key={d} className="py-1">{d.slice(0, 2)}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                    {monthGrid(view).map((day) => {
                        const ymd = toYMD(day);
                        const inMonth = day.getMonth() === view.getMonth();
                        const isSelected = ymd === value;
                        const isToday = ymd === today;
                        return (
                            <button key={ymd} type="button" onClick={() => pick(ymd)}
                                className={`relative h-9 rounded-lg text-[13px] tabular-nums transition ${isSelected ? "bg-primary font-semibold text-primary-ink" : inMonth ? "text-zinc-200 hover:bg-white/[0.07]" : "text-faint/60 hover:bg-white/[0.04]"}`}>
                                {day.getDate()}
                                {isToday && !isSelected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3">
                    {shortcuts.map(([text, days]) => (
                        <button key={text} type="button" onClick={() => pick(toYMD(addDays(new Date(), days)))} className="chip hover:border-primary/40 hover:text-white">{text}</button>
                    ))}
                    {clearable && value && <button type="button" onClick={() => pick("")} className="ml-auto text-xs text-muted hover:text-danger">Clear</button>}
                </div>
            </Popover>
        </>
    );
}

// ---------- Tabs ----------
export function Tabs({ items, value, onChange }) {
    return (
        <nav className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {items.map((t) => (
                <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
                    className={`relative -mb-px inline-flex shrink-0 items-center gap-2 px-3.5 py-3 text-sm transition ${value === t.value ? "font-medium text-white" : "text-muted hover:text-zinc-200"}`}>
                    {t.icon && <Icon name={t.icon} className="text-[18px]" />}
                    {t.label}
                    {t.count !== undefined && <span className="rounded-md bg-white/[0.06] px-1.5 font-mono text-[11px] text-muted">{t.count}</span>}
                    {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
            ))}
        </nav>
    );
}
