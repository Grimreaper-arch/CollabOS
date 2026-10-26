import Project from "../models/Project.js";
import ApiError from "./ApiError.js";
import { can } from "../middleware/auth.js";

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);

// Projects the user can see: ones they lead or are a member of,
// or every project in the organization with "projects.view_all".
export function visibleProjectFilter(req) {
    const base = { org: req.org._id };
    if (can(req, "projects.view_all")) return base;
    return { ...base, $or: [{ owner: req.user._id }, { members: req.user._id }] };
}

export async function visibleProjectIds(req) {
    const projects = await Project.find(visibleProjectFilter(req)).select("_id");
    return projects.map((p) => p._id);
}

// The project lead, or anyone with "projects.manage_all", can manage a project.
export function canManageProject(req, project) {
    return same(project.owner, req.user._id) || can(req, "projects.manage_all");
}

// Loads a project from the user's organization and checks they may see it.
// Pass { manage: true } for edit/delete/member changes.
export async function getProjectFor(req, projectId, { manage = false } = {}) {
    const project = await Project.findById(projectId);
    if (!project || !same(project.org, req.org._id)) throw new ApiError(404, "Project not found.");

    const canSee = project.hasAccess(req.user._id) || can(req, "projects.view_all");
    if (!canSee) throw new ApiError(403, "You are not a member of this project.");
    if (manage && !canManageProject(req, project)) {
        throw new ApiError(403, "Only the project lead or someone with the 'projects.manage_all' permission can do this.");
    }
    return project;
}

// Task managers: whoever assigned it, the project lead, or "tasks.manage_all".
export function canManageTask(req, task, project) {
    return same(task.assignedBy, req.user._id) || same(project.owner, req.user._id) || can(req, "tasks.manage_all");
}

export { same };
