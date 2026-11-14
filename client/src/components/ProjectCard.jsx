import { Link } from "react-router-dom";
import { Avatar, AvatarStack, Badge, DueChip, Icon, ProgressBar } from "./ui";
import { daysFromToday, dueYMD } from "../utils/dates";
import { timeAgo } from "../utils/format";

// Each project gets a cover drawn from its id: one of four palette colours and one of six
// geometric patterns. The same project always looks the same, so people learn to recognise it.
const PALETTE = ["#36c6b5", "#43c982", "#6fa8c9", "#8aa0b4"];
const hash = (text = "") => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function projectLook(project) {
    const h = hash(project._id || project.name);
    return { color: PALETTE[h % PALETTE.length], pattern: (h >>> 3) % 6 };
}

function CoverPattern({ id, pattern, color }) {
    const stroke = { stroke: color, strokeWidth: 1, fill: "none" };
    switch (pattern) {
        case 0: // diagonal hatching
            return <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="14" {...stroke} /></pattern>;
        case 1: // dot grid
            return <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill={color} /></pattern>;
        case 2: // square grid
            return <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" {...stroke} /></pattern>;
        case 3: // chevrons
            return <pattern id={id} width="24" height="14" patternUnits="userSpaceOnUse"><path d="M0 12 L12 2 L24 12" {...stroke} /></pattern>;
        case 4: // waves
            return <pattern id={id} width="40" height="14" patternUnits="userSpaceOnUse"><path d="M0 7 Q10 0 20 7 T40 7" {...stroke} /></pattern>;
        default: // plus signs
            return <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M10 6V14M6 10H14" {...stroke} /></pattern>;
    }
}

// The decorative header of a project card. Purely visual, so it is hidden from screen readers.
export function ProjectCover({ project, className = "h-[76px]" }) {
    const { color, pattern } = projectLook(project);
    const id = `cover-${project._id}`;
    return (
        <div className={`relative overflow-hidden ${className}`} aria-hidden="true"
            style={{ background: `linear-gradient(120deg, ${color}2e 0%, ${color}12 45%, transparent 100%)` }}>
            <svg className="absolute inset-0 h-full w-full opacity-[0.28]" style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 45%, black 100%)", WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 45%, black 100%)" }}>
                <defs><CoverPattern id={id} pattern={pattern} color={color} /></defs>
                <rect width="100%" height="100%" fill={`url(#${id})`} />
            </svg>
            {/* Two soft discs for depth */}
            <span className="absolute -top-10 right-10 h-28 w-28 rounded-full opacity-25" style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }} />
            <span className="absolute -right-6 -bottom-12 h-24 w-24 rounded-full border opacity-30" style={{ borderColor: color }} />
        </div>
    );
}

// The project's initial on a tile in its cover colour.
export function ProjectMark({ project, size = "h-10 w-10 text-[16px]" }) {
    const { color } = projectLook(project);
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-lg border font-semibold ${size}`}
            style={{ color, borderColor: `${color}55`, background: `linear-gradient(135deg, ${color}33, #0f1618 85%)` }} aria-hidden="true">
            {project.name?.trim()[0]?.toUpperCase() || "?"}
        </span>
    );
}

export const projectPercent = (p) => (p.taskCount ? Math.round((p.completedCount / p.taskCount) * 100) : 0);

// Where the project stands, worked out from its tasks and deadline.
export function projectHealth(project) {
    const days = project.dueDate ? daysFromToday(dueYMD(project.dueDate)) : null;
    const done = project.taskCount > 0 && project.completedCount === project.taskCount;
    if (done) return { label: "Completed", tone: "green", icon: "check_circle" };
    if (days !== null && days < 0) return { label: "Past deadline", tone: "red", icon: "error" };
    if (project.overdueCount > 0) return { label: `${project.overdueCount} overdue`, tone: "amber", icon: "schedule" };
    if (days !== null && days <= 7) return { label: days === 0 ? "Due today" : "Due this week", tone: "amber", icon: "schedule" };
    if (!project.taskCount) return { label: "Planning", tone: "steel", icon: "edit_note" };
    return { label: "On track", tone: "teal", icon: "trending_up" };
}

const roleOf = (project) => (project.isLead ? "You lead" : project.isMember ? "Member" : "View only");

// A project as a card. The whole card is one link into the project workspace.
export function ProjectCard({ project }) {
    const percent = projectPercent(project);
    const health = projectHealth(project);
    const people = [project.owner, ...project.members].filter(Boolean);

    return (
        <Link to={`/projects/${project._id}`} aria-label={`Open project ${project.name}`}
            className="card-link group relative flex flex-col overflow-hidden focus-visible:outline-offset-4">
            <div className="relative">
                <ProjectCover project={project} />
                <div className="absolute top-3 left-4"><Badge tone={health.tone} icon={health.icon} className="backdrop-blur-sm">{health.label}</Badge></div>
                {/* The "open" affordance: appears and slides in on hover or keyboard focus. */}
                <span className="absolute top-3 right-3 flex h-7 w-7 translate-y-1 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    <Icon name="arrow_outward" className="text-[17px]" />
                </span>
            </div>

            <div className="flex flex-1 flex-col px-4 pb-4">
                <div className="-mt-5 flex items-end justify-between gap-3">
                    <ProjectMark project={project} size="h-11 w-11 text-[18px] ring-4 ring-panel" />
                    <span className="mb-0.5 text-[13px] text-faint">{roleOf(project)}</span>
                </div>

                <h3 className="mt-3 truncate text-[16px] font-semibold text-ink transition-colors group-hover:text-white">{project.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-[38px] text-[14.5px] leading-[19px] text-muted">{project.description || "No description yet."}</p>

                <div className="mt-4">
                    <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[13.5px] text-faint">{project.taskCount ? (project.canManage ? `${project.completedCount} of ${project.taskCount} tasks done` : `${project.completedCount} of your ${project.taskCount} tasks done`) : "No tasks yet"}</span>
                        <span className="text-[14.5px] font-semibold text-zinc-100 tabular-nums">{percent}%</span>
                    </div>
                    <ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : undefined} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
                    <span className="flex min-w-0 items-center gap-2" title={`Led by ${project.owner?.fullName}`}>
                        <Avatar user={project.owner} size="h-6 w-6 text-[10.5px]" />
                        <span className="truncate text-[14px] text-zinc-300">{project.owner?.fullName}</span>
                    </span>
                    <AvatarStack users={people} max={4} size="h-6 w-6 text-[10.5px]" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[13.5px]">
                    {project.dueDate ? <DueChip date={project.dueDate} done={percent === 100} /> : <span className="inline-flex items-center gap-1 text-faint"><Icon name="event" className="text-[15px]" />No deadline</span>}
                    <span className="inline-flex items-center gap-1 text-faint"><Icon name="history" className="text-[15px]" />{timeAgo(project.lastActivityAt || project.updatedAt)}</span>
                </div>
            </div>
        </Link>
    );
}

// The same project as one compact, fully clickable row.
export function ProjectListRow({ project }) {
    const percent = projectPercent(project);
    const health = projectHealth(project);
    const people = [project.owner, ...project.members].filter(Boolean);
    return (
        <Link to={`/projects/${project._id}`} aria-label={`Open project ${project.name}`}
            className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 py-3 transition-colors hover:bg-white/[0.03] lg:grid-cols-[minmax(0,1.5fr)_130px_150px_90px_150px_110px_20px]">
            <div className="flex min-w-0 items-center gap-3">
                <ProjectMark project={project} size="h-9 w-9 text-[15px]" />
                <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-zinc-100 group-hover:text-white">{project.name}</p>
                    <p className="truncate text-[13.5px] text-faint">{project.description || roleOf(project)}</p>
                </div>
            </div>
            <span className="hidden lg:block"><Badge tone={health.tone} dot>{health.label}</Badge></span>
            <span className="hidden min-w-0 items-center gap-2 lg:flex"><Avatar user={project.owner} size="h-5 w-5 text-[9.5px]" /><span className="truncate text-[14px] text-muted">{project.owner?.fullName}</span></span>
            <span className="hidden lg:block"><AvatarStack users={people} max={3} size="h-5 w-5 text-[9.5px]" /></span>
            <div className="hidden lg:block">
                <div className="mb-1 flex justify-between text-[13px] text-faint tabular-nums"><span>{project.completedCount}/{project.taskCount}</span><span className="text-zinc-300">{percent}%</span></div>
                <ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : undefined} className="h-1" />
            </div>
            <span className="text-right lg:text-left">{project.dueDate ? <DueChip date={project.dueDate} done={percent === 100} /> : <span className="text-[13.5px] text-faint">No deadline</span>}</span>
            <Icon name="chevron_right" className="hidden text-[18px] text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent lg:block" />
        </Link>
    );
}
