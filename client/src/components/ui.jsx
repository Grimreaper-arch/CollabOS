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

export const Skeleton = ({ className = "", style }) => <div className={`skeleton ${className}`} style={style} />;

// A page-shaped loading placeholder.
export function PageSkeleton() {
    return (
        <div className="space-y-6" aria-busy="true" aria-label="Loading">
            <div className="space-y-3"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}</div>
            <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
        </div>
    );
}

// Page title, one line of context and the page's actions.
export function PageHeader({ title, subtitle, children }) {
    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                <h1 className="text-[26px] leading-tight font-semibold text-ink">{title}</h1>
                {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </header>
    );
}

// Colour families used by tiles, badges and bars.
const TONES = {
    primary: { tile: "tile-teal", bar: "bg-accent", text: "text-accent", hex: "#36c6b5" },
    accent: { tile: "tile-teal", bar: "bg-accent", text: "text-accent", hex: "#36c6b5" },
    success: { tile: "tile-green", bar: "bg-success", text: "text-success", hex: "#43c982" },
    warning: { tile: "tile-amber", bar: "bg-warning", text: "text-warning", hex: "#e2ac4d" },
    danger: { tile: "tile-red", bar: "bg-danger", text: "text-danger", hex: "#f0736c" },
    steel: { tile: "tile-steel", bar: "bg-steel", text: "text-[#a9bccb]", hex: "#7f97a8" },
    default: { tile: "", bar: "bg-zinc-500", text: "text-muted", hex: "#738587" }
};
export const toneOf = (tone) => TONES[tone] || TONES.default;

// One figure with its icon, a context line and (optionally) a small ring on the right:
//   <StatCard label="Open" value={4} icon="pending_actions" tone="primary" hint="2 due this week" percent={40} />
// Warning and danger tiles stay neutral while the number is zero, so colour always means something.
export function StatCard({ label, value, icon, tone = "default", hint, percent, visual, onClick }) {
    const alert = tone === "danger" || tone === "warning";
    const quiet = alert && !(Number.parseFloat(value) > 0);
    const t = toneOf(quiet ? "default" : tone);
    const Tag = onClick ? "button" : "article";
    return (
        <Tag onClick={onClick} className={`${onClick ? "card-link text-left" : "card"} flex items-start gap-2.5 p-3 sm:items-center sm:gap-3.5 sm:p-4`}>
            {icon && <span className={`tile h-8 w-8 sm:h-9 sm:w-9 ${t.tile}`}><Icon name={icon} className="text-[18px]" /></span>}
            <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-tight text-muted sm:truncate sm:text-[14px]">{label}</p>
                <p className={`mt-1 text-[26px] leading-none font-semibold tabular-nums ${alert && !quiet ? t.text : "text-ink"}`}>{value}</p>
                {hint && <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-faint sm:line-clamp-1">{hint}</p>}
            </div>
            <span className="hidden shrink-0 sm:block">{visual || (percent !== undefined && <Ring percent={percent} size={40} stroke={4} tone={quiet ? "default" : tone} />)}</span>
        </Tag>
    );
}

export function Panel({ title, description, action, children, className = "", bodyClassName = "", icon }) {
    return (
        <section className={`card ${className}`}>
            {(title || action) && (
                <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {icon && <Icon name={icon} className="text-[18px] text-faint" />}
                        <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-semibold text-zinc-100">{title}</h3>
                            {description && <p className="mt-0.5 text-[14px] text-muted">{description}</p>}
                        </div>
                    </div>
                    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
                </div>
            )}
            <div className={`p-4 ${bodyClassName}`}>{children}</div>
        </section>
    );
}

// Friendly placeholder for "nothing here yet": an icon in a soft halo, one line, one action.
export function Empty({ icon = "inbox", title, children, action, compact = false }) {
    return (
        <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-6" : "py-12"}`}>
            <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white/[0.03] text-muted">
                <span className="absolute -inset-2 rounded-full border border-line-soft" aria-hidden="true" />
                <Icon name={icon} className="text-[24px]" />
            </span>
            {title && <p className="mt-4 text-[15px] font-medium text-zinc-100">{title}</p>}
            {children && <p className="mt-1 max-w-sm text-[14.5px] leading-relaxed text-muted">{children}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export const ErrorText = ({ children }) => (children ? (
    <p className="flex items-center gap-1.5 text-[14.5px] text-danger" role="alert"><Icon name="error" className="text-[17px]" />{children}</p>
) : null);

// A tinted status pill: <Badge tone="green" dot>On track</Badge>
export function Badge({ tone = "", dot = false, icon, children, className = "" }) {
    return (
        <span className={`badge ${tone ? `badge-${tone}` : ""} ${className}`}>
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {icon && <Icon name={icon} className="text-[14.5px]" />}
            {children}
        </span>
    );
}

// Muted steel, teal and green tints: enough to tell people apart without competing with the content.
const AVATAR_COLORS = ["bg-[#1d4b4a]", "bg-[#24475c]", "bg-[#2c4a3a]", "bg-[#3b4658]", "bg-[#44503a]", "bg-[#3e3f5c]", "bg-[#4f4436]"];

export function Avatar({ user, size = "h-8 w-8 text-[13px]", ring = false, online }) {
    const name = user?.fullName || "?";
    const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    const ringClass = ring ? "ring-2 ring-panel" : "";
    const face = user?.avatar
        ? <img src={assetUrl(user.avatar)} alt={name} title={name} className={`${size} ${ringClass} shrink-0 rounded-full object-cover`} />
        : (
            <div title={name} className={`${size} ${ringClass} flex shrink-0 items-center justify-center rounded-full ${AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length]} font-semibold text-white/90`}>
                {initials}
            </div>
        );
    if (online === undefined) return face;
    return (
        <span className="relative shrink-0">
            {face}
            <span className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-panel ${online ? "bg-success" : "bg-zinc-600"}`} title={online ? "Online" : "Offline"} />
        </span>
    );
}

export function AvatarStack({ users, max = 4, size = "h-7 w-7 text-[11.5px]" }) {
    const shown = users.slice(0, max);
    return (
        <div className="flex -space-x-2">
            {shown.map((u) => <Avatar key={u._id} user={u} size={size} ring />)}
            {users.length > max && <div className={`${size} flex items-center justify-center rounded-full bg-raised font-medium text-muted ring-2 ring-panel`}>+{users.length - max}</div>}
        </div>
    );
}

export const PRIORITY = {
    high: { label: "High", dot: "bg-danger", text: "text-danger", bars: 3 },
    medium: { label: "Medium", dot: "bg-warning", text: "text-warning", bars: 2 },
    low: { label: "Low", dot: "bg-steel", text: "text-[#a9bccb]", bars: 1 }
};

// Priority as three rising bars (like a signal meter) plus its name.
export function PriorityBadge({ priority = "medium", label = true }) {
    const p = PRIORITY[priority] || PRIORITY.medium;
    return (
        <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted" title={`${p.label} priority`}>
            <span className="flex items-end gap-[2px]" aria-hidden="true">
                {[1, 2, 3].map((n) => <span key={n} className={`w-[3px] rounded-sm ${n <= p.bars ? p.dot : "bg-white/[0.12]"}`} style={{ height: 4 + n * 3 }} />)}
            </span>
            {label && p.label}
        </span>
    );
}

const DUE_TONES = {
    overdue: "text-danger",
    today: "text-warning",
    soon: "text-zinc-200",
    later: "text-muted",
    done: "text-faint",
    none: "text-faint"
};

export function DueChip({ date, done }) {
    const { text, tone } = dueLabel(date, done);
    return <span className={`inline-flex items-center gap-1 text-[13.5px] whitespace-nowrap ${DUE_TONES[tone]}`}><Icon name={tone === "overdue" ? "error" : "event"} className="text-[15px]" />{text}</span>;
}

// Thin progress bar. With no tone it runs teal to green, the product's "progress" colours.
export function ProgressBar({ percent, tone, className = "h-1.5" }) {
    return (
        <div className={`overflow-hidden rounded-full bg-white/[0.07] ${className}`} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone || "bg-gradient-to-r from-accent to-success"}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
    );
}

// Circular progress drawn in SVG. Children sit in the middle.
export function Ring({ percent, size = 44, stroke = 4, tone = "primary", children }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const value = Math.max(0, Math.min(100, percent || 0));
    return (
        <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(value)}%`}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneOf(tone).hex} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} style={{ transition: "stroke-dashoffset 0.7s ease-out" }} />
            </svg>
            {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
        </span>
    );
}

// Hover/focus hint, drawn in a portal so sidebars and scroll areas never clip it.
export function Tooltip({ label, side = "top", children, disabled = false }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    const show = () => {
        const el = ref.current?.firstElementChild || ref.current;
        const r = el?.getBoundingClientRect();
        if (!r || disabled || !label) return;
        setPos(side === "right" ? { top: r.top + r.height / 2, left: r.right + 8 } : side === "left" ? { top: r.top + r.height / 2, left: r.left - 8 } : { top: r.top - 8, left: r.left + r.width / 2 });
    };
    const hide = () => setPos(null);
    const shift = side === "right" ? "-translate-y-1/2" : side === "left" ? "-translate-x-full -translate-y-1/2" : "-translate-x-1/2 -translate-y-full";
    return (
        <span ref={ref} className="contents" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
            {children}
            {pos && createPortal(
                <span role="tooltip" style={{ top: pos.top, left: pos.left }}
                    className={`pointer-events-none fixed z-[95] ${shift} animate-fade-in rounded-md border border-line-strong bg-[#1b2629] px-2 py-1 text-[13px] font-medium whitespace-nowrap text-zinc-100 shadow-lg shadow-black/50`}>
                    {label}
                </span>,
                document.body
            )}
        </span>
    );
}

// ---------- Form building blocks ----------

export function Field({ label, hint, error, children, className = "" }) {
    return (
        <div className={className}>
            {label && <label className="label">{label}</label>}
            {children}
            {error ? <p className="mt-1.5 text-[13px] text-danger">{error}</p> : hint && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
        </div>
    );
}

// Text input with an optional leading icon.
export function Input({ icon, className = "", ...props }) {
    if (!icon) return <input className={`field ${className}`} {...props} />;
    return (
        <div className="relative">
            <Icon name={icon} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[18px] text-faint" />
            <input className={`field pl-9 ${className}`} {...props} />
        </div>
    );
}

// Pill-style switch between a few options.
export function Segmented({ options, value, onChange, ariaLabel }) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-full rounded-lg border border-line bg-inset p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={`flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[14px] font-medium whitespace-nowrap transition-colors ${value === o.value ? "bg-raised text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" : "text-muted hover:text-zinc-200"}`}
                >
                    {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} />}
                    {o.icon && <Icon name={o.icon} className={`text-[17px] ${value === o.value ? "text-accent" : ""}`} />}
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ checked, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent-strong" : "bg-white/[0.12]"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[18px]" : "left-0.5"}`} />
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
            className={`floating z-[80] animate-pop-in p-1 ${className}`}
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
            className="fixed inset-0 z-[60] flex animate-fade-in items-start justify-center overflow-y-auto bg-[#03070899] p-4 pt-[8vh] backdrop-blur-[3px]"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div role="dialog" aria-modal="true" aria-label={title} className={`floating w-full ${size} animate-slide-up bg-panel`}>
                <div className="flex items-start justify-between gap-4 px-5 pt-4">
                    <div>
                        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
                        {description && <p className="mt-1 text-[14.5px] text-muted">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="btn-icon -mt-1 -mr-2" aria-label="Close"><Icon name="close" /></button>
                </div>
                <div className="px-5 pt-4 pb-5">{children}</div>
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
            {o.user && <Avatar user={o.user} size="h-5 w-5 text-[10.5px]" />}
            {o.icon && <Icon name={o.icon} className="text-[20px] text-muted" />}
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
                className={`field flex items-center gap-2 text-left ${open ? "border-accent/70 ring-[3px] ring-accent/15" : ""} ${className}`}
            >
                <span className={`flex min-w-0 flex-1 items-center gap-2 ${selected ? "" : "text-faint"}`}>{selected ? optionContent(selected) : placeholder}</span>
                <Icon name="unfold_more" className="text-[20px] text-faint" />
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
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14.5px] ${i === active ? "bg-white/[0.06] text-white" : "text-zinc-300"}`}
                                >
                                    {optionContent(o)}
                                    {o.hint && <span className="ml-auto pl-3 text-[13px] text-faint">{o.hint}</span>}
                                    {isSelected && <Icon name="check" className={`${o.hint ? "" : "ml-auto"} text-[17px] text-accent`} />}
                                </button>
                            </li>
                        );
                    }) : <li className="px-3 py-2 text-[15px] text-faint">No options</li>}
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
                className={`field flex items-center gap-2.5 text-left ${open ? "border-accent/70 ring-[3px] ring-accent/15" : ""}`}>
                <Icon name="calendar_today" className="text-[17px] text-faint" />
                <span className={`flex-1 truncate ${value ? "" : "text-faint"}`}>{label}</span>
                {due && <span className="text-[13px] text-faint">{due.text}</span>}
            </button>
            <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={296} className="p-3">
                <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setView(addMonths(view, -1))} className="btn-icon h-8 w-8" aria-label="Previous month"><Icon name="chevron_left" /></button>
                    <span className="text-[15px] font-semibold text-white">{monthLabel(view)}</span>
                    <button type="button" onClick={() => setView(addMonths(view, 1))} className="btn-icon h-8 w-8" aria-label="Next month"><Icon name="chevron_right" /></button>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center text-[12.5px] text-faint">
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
                                className={`relative h-8 rounded-md text-[14px] tabular-nums transition-colors ${isSelected ? "bg-primary font-semibold text-primary-ink" : inMonth ? "text-zinc-200 hover:bg-white/[0.07]" : "text-faint/60 hover:bg-white/[0.04]"}`}>
                                {day.getDate()}
                                {isToday && !isSelected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3">
                    {shortcuts.map(([text, days]) => (
                        <button key={text} type="button" onClick={() => pick(toYMD(addDays(new Date(), days)))} className="chip hover:text-white">{text}</button>
                    ))}
                    {clearable && value && <button type="button" onClick={() => pick("")} className="ml-auto text-[13px] text-muted hover:text-danger">Clear</button>}
                </div>
            </Popover>
        </>
    );
}

// ---------- Tabs ----------
export function Tabs({ items, value, onChange }) {
    return (
        <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line-soft" role="tablist">
            {items.map((t) => {
                const on = value === t.value;
                return (
                    <button key={t.value} role="tab" aria-selected={on} onClick={() => onChange(t.value)}
                        className={`relative -mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2.5 text-[14.5px] font-medium transition-colors ${on ? "text-white" : "text-muted hover:bg-white/[0.03] hover:text-zinc-200"}`}>
                        {t.icon && <Icon name={t.icon} className={`text-[17px] ${on ? "text-accent" : ""}`} />}
                        {t.label}
                        {t.count !== undefined && <span className={`rounded-full px-1.5 text-[12.5px] font-medium tabular-nums ${on ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-faint"}`}>{t.count}</span>}
                        {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
                    </button>
                );
            })}
        </nav>
    );
}

// ---------- Drawer ----------
// A panel that slides in from the right for details (a task, a person) without leaving the page.
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-[480px]" }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[55] flex animate-fade-in justify-end bg-[#03070880] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <aside role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} className={`flex h-full w-full ${width} animate-slide-in flex-col border-l border-line-strong bg-panel shadow-2xl shadow-black/60`}>
                <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
                    <div className="min-w-0 flex-1">
                        {subtitle && <p className="mb-1 truncate text-[13.5px] text-faint">{subtitle}</p>}
                        <h2 className="text-[17px] leading-snug font-semibold text-ink">{title}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="btn-icon -mt-1 -mr-2" aria-label="Close"><Icon name="close" /></button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <footer className="border-t border-line-soft px-5 py-3">{footer}</footer>}
            </aside>
        </div>,
        document.body
    );
}
