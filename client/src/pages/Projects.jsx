import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useApi from "../utils/useApi";
import { ProjectForm } from "../components/ProjectForms";
import { AvatarStack, DueChip, Empty, ErrorText, Icon, Input, Modal, PageHeader, PageSkeleton, ProgressBar, Segmented, StatCard } from "../components/ui";
import { daysFromToday, dueYMD } from "../utils/dates";
import { plural } from "../utils/format";

function ProjectCard({ project }) {
    const percent = project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
    const people = [project.owner, ...project.members];
    return (
        <Link to={`/projects/${project._id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-[#33333c]">
            <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-accent/10 text-lg font-semibold text-primary ring-1 ring-primary/20">
                    {project.name[0].toUpperCase()}
                </span>
                <div className="flex gap-1.5">
                    {project.isLead && <span className="chip border-primary/30 text-primary">Lead</span>}
                    {!project.isMember && <span className="chip text-faint">Viewing</span>}
                </div>
            </div>
            <h3 className="mt-4 truncate text-[16px] font-semibold tracking-tight text-white">{project.name}</h3>
            <p className="mt-1 line-clamp-2 min-h-[40px] text-[13px] text-muted">{project.description || "No description"}</p>
            <div className="mt-5 flex items-center justify-between text-xs">
                <span className="text-faint">{project.canManage ? "All tasks" : "Your tasks"}</span>
                <span className="font-mono text-zinc-300">{project.completedCount}/{project.taskCount} · {percent}%</span>
            </div>
            <div className="mt-2"><ProgressBar percent={percent} tone={percent === 100 ? "bg-success" : "bg-primary"} /></div>
            <div className="mt-5 flex items-center justify-between border-t border-line-soft pt-4">
                <AvatarStack users={people} />
                {project.dueDate ? <DueChip date={project.dueDate} /> : <span className="text-xs text-faint">No deadline</span>}
            </div>
        </Link>
    );
}

export default function Projects() {
    const { can } = useAuth();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const { data, error, loading } = useApi("/projects");
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const creating = params.get("new") === "1";

    if (loading) return <PageSkeleton />;

    const projects = data?.projects || [];
    const query = search.trim().toLowerCase();
    const matching = projects.filter((p) =>
        [p.name, p.description, p.owner?.fullName].join(" ").toLowerCase().includes(query) && (filter === "all" || (filter === "lead" && p.isLead) || (filter === "member" && p.isMember && !p.isLead)));
    const dueSoon = projects.filter((p) => { const d = p.dueDate && daysFromToday(dueYMD(p.dueDate)); return p.dueDate && d >= 0 && d <= 30; }).length;

    return (
        <>
            <PageHeader eyebrow="Workspace" title="Projects" subtitle={can("projects.view_all") ? "Every project in your organization." : "Projects you lead or are a member of."}>
                {can("projects.create") && <button onClick={() => setParams({ new: "1" })} className="btn-primary"><Icon name="add" className="text-[18px]" />New project</button>}
            </PageHeader>
            <ErrorText>{error}</ErrorText>

            <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Projects" value={projects.length} icon="folder_open" tone="primary" />
                <StatCard label="You lead" value={projects.filter((p) => p.isLead).length} icon="military_tech" tone="warning" />
                <StatCard label="Deadlines in 30 days" value={dueSoon} icon="flag" tone="accent" />
                <StatCard label="People involved" value={new Set(projects.flatMap((p) => [p.owner?._id, ...p.members.map((m) => m._id)])).size} icon="group" />
            </section>

            <section className="card mt-6 flex flex-col gap-3 p-3 md:flex-row md:items-center">
                <div className="flex-1"><Input icon="search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects or leads" aria-label="Search projects" /></div>
                <div className="md:w-80">
                    <Segmented value={filter} onChange={setFilter} ariaLabel="Filter projects" options={[{ value: "all", label: "All" }, { value: "lead", label: "Leading" }, { value: "member", label: "Member" }]} />
                </div>
            </section>

            <p className="mt-6 mb-3 text-[13px] text-faint">{matching.length} of {plural(projects.length, "project")}</p>
            {matching.length ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{matching.map((p) => <ProjectCard key={p._id} project={p} />)}</div>
            ) : (
                <Empty icon="folder_open" title={projects.length ? "No matching projects" : "No projects yet"}
                    action={can("projects.create") && !projects.length && <button onClick={() => setParams({ new: "1" })} className="btn-primary btn-sm">Create a project</button>}>
                    {projects.length ? "Try a different search or filter." : can("projects.create") ? "Create your first project to get started." : "You'll see projects here once someone adds you to one."}
                </Empty>
            )}

            <Modal open={creating} onClose={() => setParams({})} title="New project" description="You'll be the project lead.">
                <ProjectForm onCancel={() => setParams({})} onSaved={(p) => navigate(`/projects/${p._id}`)} />
            </Modal>
        </>
    );
}
