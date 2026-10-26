import Task from "../models/Task.js";
import Comment from "../models/Comment.js";
import Project from "../models/Project.js";
import ApiError from "../utils/ApiError.js";
import { can } from "../middleware/auth.js";
import { canManageTask, getProjectFor, same } from "../utils/access.js";
import { logActivity, notify } from "../utils/events.js";

const POPULATE = [
    { path: "project", select: "name owner" },
    { path: "assignee", select: "fullName email avatar" },
    { path: "assignedBy", select: "fullName email" }
];

// Loads a task and checks access: the assignee, or anyone who manages it.
async function getTaskFor(req, taskId) {
    const task = await Task.findById(taskId);
    if (!task || !same(task.org, req.org._id)) throw new ApiError(404, "Task not found.");

    const project = await Project.findById(task.project);
    const isAssignee = same(task.assignee, req.user._id);
    const canManage = Boolean(project) && canManageTask(req, task, project);
    if (!isAssignee && !canManage) throw new ApiError(403, "You do not have access to this task.");

    return { task, project, isAssignee, canManage };
}

// GET /api/tasks?project=<id>&status=pending|completed
// You see tasks assigned to you, tasks you assigned, and tasks in projects you lead.
// "tasks.manage_all" shows every task in the organization.
export async function listTasks(req, res) {
    const filter = { org: req.org._id };
    if (!can(req, "tasks.manage_all")) {
        const ledProjects = await Project.find({ org: req.org._id, owner: req.user._id }).select("_id");
        filter.$or = [
            { assignee: req.user._id },
            { assignedBy: req.user._id },
            { project: { $in: ledProjects.map((p) => p._id) } }
        ];
    }
    if (req.query.project) filter.project = req.query.project;
    if (["pending", "completed"].includes(req.query.status)) filter.status = req.query.status;

    const tasks = await Task.find(filter).populate(POPULATE).sort({ status: -1, dueDate: 1, createdAt: -1 });

    const counts = await Comment.aggregate([
        { $match: { task: { $in: tasks.map((t) => t._id) } } },
        { $group: { _id: "$task", count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
        tasks: tasks.map((t) => ({
            ...t.toObject(),
            commentCount: countMap.get(String(t._id)) || 0,
            isMine: same(t.assignee, req.user._id),
            canManage: Boolean(t.project) && canManageTask(req, t, t.project)
        }))
    });
}

// Project lead or projects.manage_all may assign in a project even without being a member.
const canManageTaskProject = (req, project) => same(project.owner, req.user._id) || can(req, "projects.manage_all");

// POST /api/tasks  (tasks.assign)
// body: { projectId, title, description, priority, dueDate, assignees: [userId] }
// Creates one task per person so each one tracks their own progress.
export async function createTask(req, res) {
    const { projectId, title, description, priority, dueDate, assignees = [] } = req.body;
    const project = await getProjectFor(req, projectId);
    if (!project.hasAccess(req.user._id) && !canManageTaskProject(req, project)) {
        throw new ApiError(403, "You can only assign tasks in projects you are part of.");
    }

    const people = [...new Set(assignees.map(String))].filter((id) => project.hasAccess(id));
    if (!people.length) throw new ApiError(400, "Choose at least one person from this project.");
    if (!title?.trim()) throw new ApiError(400, "Task title is required.");

    const tasks = await Task.insertMany(people.map((assignee) => ({
        title, description, priority, dueDate: dueDate || null,
        org: req.org._id, project: project._id, assignee, assignedBy: req.user._id
    })));

    await Promise.all(people.filter((id) => id !== String(req.user._id))
        .map((id) => notify(id, `${req.user.fullName} assigned you "${title}" in ${project.name}.`, "/tasks", "task")));
    await logActivity(project, req.user._id, `${req.user.fullName} assigned "${title}" to ${people.length} ${people.length === 1 ? "person" : "people"}.`);

    res.status(201).json({ tasks });
}

// PATCH /api/tasks/:id/status  body: { status }
// Only the person the task is assigned to marks it done (or reopens it).
export async function updateStatus(req, res) {
    const { task, project, isAssignee } = await getTaskFor(req, req.params.id);
    if (!isAssignee) throw new ApiError(403, "Only the person this task is assigned to can change its status.");

    const { status } = req.body;
    if (!["pending", "completed"].includes(status)) throw new ApiError(400, "Status must be pending or completed.");
    if (task.status === status) return res.json({ task });

    task.status = status;
    task.completedAt = status === "completed" ? new Date() : null;
    await task.save();

    const verb = status === "completed" ? "completed" : "reopened";
    if (!same(task.assignedBy, req.user._id)) {
        await notify(task.assignedBy, `${req.user.fullName} ${verb} "${task.title}" in ${project.name}.`, "/tasks", "task");
    }
    await logActivity(project, req.user._id, `${req.user.fullName} ${verb} "${task.title}".`);
    res.json({ task: await task.populate(POPULATE) });
}

// PUT /api/tasks/:id  (assigner, project lead, or tasks.manage_all)
export async function updateTask(req, res) {
    const { task, canManage } = await getTaskFor(req, req.params.id);
    if (!canManage) throw new ApiError(403, "Only whoever assigned this task, the project lead, or someone with 'tasks.manage_all' can edit it.");

    ["title", "description", "priority"].forEach((field) => {
        if (req.body[field] !== undefined) task[field] = req.body[field];
    });
    if (req.body.dueDate !== undefined) {
        task.dueDate = req.body.dueDate || null;
        // New deadline: reminders should fire again.
        task.dueSoonNotifiedAt = null;
        task.overdueNotifiedAt = null;
    }
    await task.save();
    res.json({ task: await task.populate(POPULATE) });
}

// DELETE /api/tasks/:id  (assigner, project lead, or tasks.manage_all)
export async function deleteTask(req, res) {
    const { task, project, canManage } = await getTaskFor(req, req.params.id);
    if (!canManage) throw new ApiError(403, "Only whoever assigned this task, the project lead, or someone with 'tasks.manage_all' can delete it.");

    await Comment.deleteMany({ task: task._id });
    await task.deleteOne();
    await logActivity(project, req.user._id, `${req.user.fullName} deleted "${task.title}".`);
    res.json({ message: "Task deleted." });
}

// GET /api/tasks/:id/comments
export async function listComments(req, res) {
    await getTaskFor(req, req.params.id);
    const comments = await Comment.find({ task: req.params.id }).populate("author", "fullName avatar").sort({ createdAt: 1 });
    res.json({ comments });
}

// POST /api/tasks/:id/comments  body: { text }
export async function addComment(req, res) {
    const { task, project, isAssignee } = await getTaskFor(req, req.params.id);
    const comment = await Comment.create({ task: task._id, author: req.user._id, text: req.body.text });

    // Tell the other side of the conversation.
    const recipient = isAssignee ? task.assignedBy : task.assignee;
    if (!same(recipient, req.user._id)) await notify(recipient, `${req.user.fullName} commented on "${task.title}".`, "/tasks", "task");
    await logActivity(project, req.user._id, `${req.user.fullName} commented on "${task.title}".`);

    res.status(201).json({ comment: await comment.populate("author", "fullName avatar") });
}
