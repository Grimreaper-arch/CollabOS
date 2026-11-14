import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import { ProjectForm } from "../components/ProjectForms";
import { ProjectCard, ProjectListRow, projectPercent } from "../components/ProjectCard";
import { AvatarStack, Empty, ErrorText, Icon, Input, Modal, PageHeader, PageSkeleton, Segmented, Select, StatCard } from "../components/ui";
import { daysFromToday, dueYMD } from "../utils/dates";
import { plural } from "../utils/format";
import { useLiveReload } from "../context/RealtimeContext";

const SORTS = [
    { value: "recent", label: "Recently updated", icon: "history" },
    { value: "name", label: "Name", icon: "sort_by_alpha" },
    { value: "deadline", label: "Deadline", icon: "event" },
    { value: "progress", label: "Progress", icon: "trending_up" }
];

const SORTERS = {
    recent: (a, b) => new Date(b.lastActivityAt || b.updatedAt) - new Date(a.lastActivityAt || a.updatedAt),
    name: (a, b) => a.name.localeCompare(b.name),
    // Projects without a deadline go last.
    deadline: (a, b) => (a.dueDate ? new Date(a.dueDate) : Infinity) - (b.dueDate ? new Date(b.dueDate) : Infinity),
    progress: (a, b) => projectPercent(b) - projectPercent(a)
};

const remembered = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

export default function Projects() {
    const { can } = useAuth();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { data, error, loading, reload } = useApi("/projects");
    useLiveReload(reload);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [sort, setSortState] = useState(() => remembered("collabos_projects_sort", "recent"));
    const [view, setViewState] = useState(() => remembered("collabos_projects_view", "grid"));
    const setSort = (v) => { setSortState(v); remember("collabos_projects_sort", v); };
    const setView = (v) => { setViewState(v); remember("collabos_projects_view", v); };
    const creating = params.get("new") === "1";

    const projects = useMemo(() => data?.projects || [], [data]);
    const matching = useMemo(() => {
        const query = search.trim().toLowerCase();
        return projects
            .filter((p) => [p.name, p.description, p.owner?.fullName].join(" ").toLowerCase().includes(query)
                && (filter === "all" || (filter === "lead" && p.isLead) || (filter === "member" && p.isMember && !p.isLead)))
            .sort(SORTERS[sort] || SORTERS.recent);
    }, [projects, search, filter, sort]);

    if (loading && !data) return <PageSkeleton />;

    const leading = projects.filter((p) => p.isLead).length;
    const finished = projects.filter((p) => p.taskCount > 0 && p.completedCount === p.taskCount).length;
    const upcoming = projects
        .filter((p) => { const d = p.dueDate && daysFromToday(dueYMD(p.dueDate)); return p.dueDate && d >= 0 && d <= 30; })
        .sort(SORTERS.deadline);
    const people = [...new Map(projects.flatMap((p) => [p.owner, ...p.members]).filter(Boolean).map((u) => [u._id, u])).values()];
    const nextDays = upcoming[0] ? daysFromToday(dueYMD(upcoming[0].dueDate)) : null;
    const counts = { all: projects.length, lead: leading, member: projects.filter((p) => p.isMember && !p.isLead).length };

    return (
        <>
            <PageHeader title="Projects" subtitle={can("projects.view_all") ? "Every project in your organization. Open one to see its board, tasks, people and files." : "The projects you lead or belong to. Open one to see its board, tasks, people and files."}>
                {can("projects.create") && <button onClick={() => setParams({ new: "1" })} className="btn-primary"><Icon name="add" className="text-[18px]" />New project</button>}
            </PageHeader>
            <ErrorText>{error}</ErrorText>

            <section className="mt-6 stats">
                <StatCard label="Total projects" value={projects.length} icon="folder" tone="primary"
                    hint={projects.length ? `${projects.length - finished} active · ${finished} completed` : "None yet"}
                    percent={projects.length ? (finished / projects.length) * 100 : undefined} />
                <StatCard label="Projects you lead" value={leading} icon="flag" tone="success"
                    hint={projects.length ? `${Math.round((leading / projects.length) * 100)}% of what you can see` : "You'll lead the ones you create"} />
                <StatCard label="Upcoming deadlines" value={upcoming.length} icon="event_upcoming" tone="warning"
                    hint={upcoming[0] ? `Next: ${upcoming[0].name} ${nextDays === 0 ? "today" : `in ${plural(nextDays, "day")}`}` : "Nothing due in the next 30 days"} />
                <StatCard label="People" value={people.length} icon="group" tone="steel"
                    hint={`Across ${plural(projects.length, "project")}`}
                    visual={people.length > 0 && <AvatarStack users={people} max={3} size="h-7 w-7 text-[11.5px]" />} />
            </section>

            <section className="mt-6 flex flex-col gap-2 lg:flex-row lg:items-center" aria-label="Find projects">
                <div className="lg:w-72"><Input icon="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or leads" aria-label="Search projects" /></div>
                <div className="lg:w-[300px]">
                    <Segmented value={filter} onChange={setFilter} ariaLabel="Filter projects"
                        options={[{ value: "all", label: `All ${counts.all}` }, { value: "lead", label: `Leading ${counts.lead}` }, { value: "member", label: `Member ${counts.member}` }]} />
                </div>
                <div className="flex items-center gap-2 lg:ml-auto">
                    <div className="w-52"><Select value={sort} onChange={setSort} ariaLabel="Sort projects" options={SORTS} /></div>
                    <div className="w-[84px] shrink-0">
                        <Segmented value={view} onChange={setView} ariaLabel="View" options={[{ value: "grid", label: <span className="sr-only">Grid</span>, icon: "grid_view" }, { value: "list", label: <span className="sr-only">List</span>, icon: "view_list" }]} />
                    </div>
                </div>
            </section>

            {matching.length ? (
                view === "grid" ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {matching.map((p) => <ProjectCard key={p._id} project={p} />)}
                        {can("projects.create") && !search && filter === "all" && (
                            <button onClick={() => setParams({ new: "1" })}
                                className="group flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-muted transition-colors hover:border-accent/50 hover:bg-accent/[0.04] hover:text-white">
                                <span className="tile transition-colors group-hover:border-accent/40 group-hover:text-accent"><Icon name="add" /></span>
                                <span className="text-[15px] font-medium">New project</span>
                                <span className="text-[13.5px] text-faint">You'll be its lead</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="rows-card mt-4">
                        <div className="hidden grid-cols-[minmax(0,1.5fr)_130px_150px_90px_150px_110px_20px] gap-x-5 bg-white/[0.015] py-2.5 text-[13px] font-medium text-faint lg:grid">
                            <span>{plural(matching.length, "project")}</span><span>Status</span><span>Lead</span><span>People</span><span>Progress</span><span>Deadline</span><span />
                        </div>
                        {matching.map((p) => <ProjectListRow key={p._id} project={p} />)}
                    </div>
                )
            ) : (
                <div className="card mt-4">
                    <Empty icon={projects.length ? "search_off" : "create_new_folder"} title={projects.length ? "No projects match" : "Start your first project"}
                        action={projects.length
                            ? <button onClick={() => { setSearch(""); setFilter("all"); }} className="btn-secondary btn-sm">Clear filters</button>
                            : can("projects.create") && <button onClick={() => setParams({ new: "1" })} className="btn-primary"><Icon name="add" className="text-[18px]" />Create a project</button>}>
                        {projects.length ? "Try a different search, or clear the filters to see everything."
                            : can("projects.create") ? "A project gives your team a board, a task list, a chat channel, shared files and a code workspace."
                            : "You'll see projects here as soon as someone adds you to one."}
                    </Empty>
                </div>
            )}

            <Modal open={creating} onClose={() => setParams({})} title="New project" description="You'll be the project lead. You can add people once it's created.">
                <ProjectForm onCancel={() => setParams({})} onSaved={(p) => navigate(`/projects/${p._id}`)} />
            </Modal>
        </>
    );
}
