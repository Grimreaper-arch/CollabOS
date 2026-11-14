import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Membership from "../models/Membership.js";
import Activity from "../models/Activity.js";
import ApiError from "../utils/ApiError.js";
import { canManageProject, getProjectFor, same, visibleProjectFilter } from "../utils/access.js";
import { logActivity, notify } from "../utils/events.js";
import { deleteProjects } from "../services/orgService.js";
import { assertWithinLimit } from "../services/plans.js";
import { joinProjectRoom, leaveProjectRoom } from "../services/realtime.js";

const PERSON = "fullName email avatar";

const taskStats = (match) => Task.aggregate([
    { $match: match },
    { $group: { _id: "$project", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } }
]);

// Adds task counts and permission flags to each project.
// People who manage a project see all its tasks counted; members see only their own.
async function withDetails(req, projects) {
    const ids = projects.map((p) => p._id);
    const now = new Date();
    const [all, mine, recent, late] = await Promise.all([
        taskStats({ project: { $in: ids } }),
        taskStats({ project: { $in: ids }, assignee: req.user._id }),
        // Most recent activity per project, for "updated 2h ago".
        Activity.aggregate([{ $match: { project: { $in: ids } } }, { $group: { _id: "$project", at: { $max: "$createdAt" } } }]),
        Task.aggregate([{ $match: { project: { $in: ids }, status: "pending", dueDate: { $ne: null, $lt: now } } }, { $group: { _id: "$project", count: { $sum: 1 }, mine: { $sum: { $cond: [{ $eq: ["$assignee", req.user._id] }, 1, 0] } } } }])
    ]);
    const recentMap = new Map(recent.map((r) => [String(r._id), r.at]));
    const lateMap = new Map(late.map((r) => [String(r._id), r]));
    const allMap = new Map(all.map((s) => [String(s._id), s]));
    const mineMap = new Map(mine.map((s) => [String(s._id), s]));

    return projects.map((project) => {
        const canManage = canManageProject(req, project);
        const s = (canManage ? allMap : mineMap).get(String(project._id));
        return {
            ...project.toObject(),
            taskCount: s?.total || 0,
            completedCount: s?.completed || 0,
            overdueCount: (canManage ? lateMap.get(String(project._id))?.count : lateMap.get(String(project._id))?.mine) || 0,
            lastActivityAt: recentMap.get(String(project._id)) || project.updatedAt,
            isLead: same(project.owner, req.user._id),
            isMember: project.hasAccess(req.user._id),
            canManage
        };
    });
}

// GET /api/projects
export async function listProjects(req, res) {
    const projects = await Project.find(visibleProjectFilter(req))
        .populate("owner", PERSON)
        .populate("members", PERSON)
        .sort({ createdAt: -1 });
    res.json({ projects: await withDetails(req, projects) });
}

// POST /api/projects  (projects.create) — the creator becomes the project lead.
export async function createProject(req, res) {
    const { name, description, dueDate, repoUrl } = req.body;
    await assertWithinLimit(req.org, "projects");
    const project = await Project.create({ name, description, repoUrl, dueDate: dueDate || null, org: req.org._id, owner: req.user._id });
    joinProjectRoom(req.user._id, project._id);
    await logActivity(project, req.user._id, `${req.user.fullName} created ${project.name}.`);
    res.status(201).json({ project });
}

// GET /api/projects/:id
export async function getProject(req, res) {
    const project = await getProjectFor(req, req.params.id);
    await project.populate([{ path: "owner", select: PERSON }, { path: "members", select: PERSON }]);
    const [details] = await withDetails(req, [project]);
    res.json({ project: details });
}

// PUT /api/projects/:id  (lead or projects.manage_all)
export async function updateProject(req, res) {
    const project = await getProjectFor(req, req.params.id, { manage: true });
    ["name", "description", "repoUrl"].forEach((field) => {
        if (req.body[field] !== undefined) project[field] = req.body[field];
    });
    if (req.body.dueDate !== undefined) project.dueDate = req.body.dueDate || null;
    await project.save();
    await logActivity(project, req.user._id, `${req.user.fullName} updated project details.`);
    res.json({ project });
}

// DELETE /api/projects/:id  (lead or projects.manage_all) — removes everything in the project.
export async function deleteProject(req, res) {
    const project = await getProjectFor(req, req.params.id, { manage: true });
    await deleteProjects([project._id]);
    res.json({ message: "Project deleted." });
}

// POST /api/projects/:id/members  body: { userIds: [...] }  (lead or projects.manage_all)
// Anyone in the organization can be added; no acceptance needed since they're already in the org.
export async function addMembers(req, res) {
    const project = await getProjectFor(req, req.params.id, { manage: true });
    const requested = [...new Set((req.body.userIds || []).map(String))];
    const orgMembers = await Membership.find({ org: req.org._id, user: { $in: requested } }).populate("user", "fullName");

    const toAdd = orgMembers.map((m) => m.user).filter((u) => !project.hasAccess(u._id));
    if (!toAdd.length) throw new ApiError(400, "Choose at least one person from your organization who isn't in this project yet.");

    project.members.push(...toAdd.map((u) => u._id));
    await project.save();
    toAdd.forEach((u) => joinProjectRoom(u._id, project._id));
    await Promise.all(toAdd.map((u) => notify(u._id, `${req.user.fullName} added you to ${project.name}.`, `/projects/${project._id}`, "people", project.org)));
    await logActivity(project, req.user._id, `${req.user.fullName} added ${toAdd.map((u) => u.fullName).join(", ")}.`);
    res.json({ added: toAdd.length });
}

// DELETE /api/projects/:id/members/:userId  (lead or projects.manage_all)
export async function removeMember(req, res) {
    const project = await getProjectFor(req, req.params.id, { manage: true });
    if (same(project.owner, req.params.userId)) throw new ApiError(400, "The project lead can't be removed.");
    project.members = project.members.filter((m) => String(m) !== req.params.userId);
    await project.save();
    leaveProjectRoom(req.params.userId, project._id);
    await logActivity(project, req.user._id, `${req.user.fullName} removed a member.`);
    res.json({ message: "Removed." });
}
