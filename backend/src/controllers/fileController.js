import fs from "node:fs/promises";
import path from "node:path";
import File from "../models/File.js";
import Task from "../models/Task.js";
import ApiError from "../utils/ApiError.js";
import { can } from "../middleware/auth.js";
import { canManageProject, canManageTask, getProjectFor, same } from "../utils/access.js";
import { logActivity, notify } from "../utils/events.js";
import { UPLOAD_ROOT } from "../middleware/upload.js";

const filePath = (file) => path.join(UPLOAD_ROOT, "files", file.storedName);

// POST /api/projects/:id/files  (multipart form: field "file", optional "taskId")
// Shared project files need "files.upload". With taskId it's a task submission,
// which the assignee can always make (so even junior roles can hand in their work).
export async function uploadProjectFile(req, res) {
    if (!req.file) throw new ApiError(400, "Choose a file to upload.");

    try {
        const project = await getProjectFor(req, req.params.id);

        let task = null;
        if (req.body.taskId) {
            task = await Task.findOne({ _id: req.body.taskId, project: project._id });
            if (!task) throw new ApiError(404, "Task not found in this project.");
            if (!same(task.assignee, req.user._id) && !canManageTask(req, task, project)) {
                throw new ApiError(403, "You can only attach files to your own tasks.");
            }
        } else if (!can(req, "files.upload")) {
            throw new ApiError(403, `Your role (${req.role.name}) can't upload shared project files.`);
        }

        const file = await File.create({
            project: project._id,
            task: task?._id || null,
            uploadedBy: req.user._id,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            mimeType: req.file.mimetype,
            size: req.file.size
        });

        await logActivity(project, req.user._id, `${req.user.fullName} uploaded ${file.originalName}${task ? ` for "${task.title}"` : ""}.`);
        if (task && !same(task.assignedBy, req.user._id)) {
            await notify(task.assignedBy, `${req.user.fullName} submitted ${file.originalName} for "${task.title}".`, `/projects/${project._id}`, "task");
        }

        res.status(201).json({ file: await file.populate("uploadedBy", "fullName") });
    } catch (error) {
        // The upload was rejected, so don't leave the file sitting on disk.
        await fs.rm(req.file.path, { force: true });
        throw error;
    }
}

// GET /api/projects/:id/files
// Project managers see everything; others see shared files plus submissions for their own tasks.
export async function listProjectFiles(req, res) {
    const project = await getProjectFor(req, req.params.id);
    const filter = { project: project._id };

    if (!canManageProject(req, project) && !can(req, "tasks.manage_all")) {
        const visibleTasks = await Task.find({ project: project._id, $or: [{ assignee: req.user._id }, { assignedBy: req.user._id }] }).select("_id");
        filter.$or = [{ task: null }, { task: { $in: visibleTasks.map((t) => t._id) } }];
    }

    const files = await File.find(filter)
        .populate("uploadedBy", "fullName")
        .populate("task", "title assignee")
        .sort({ createdAt: -1 });

    res.json({
        files: files.map((f) => ({
            ...f.toObject(),
            canDelete: same(f.uploadedBy, req.user._id) || canManageProject(req, project) || can(req, "files.delete_any")
        }))
    });
}

async function getFileFor(req, fileId) {
    const file = await File.findById(fileId).populate("task", "assignee assignedBy");
    if (!file) throw new ApiError(404, "File not found.");

    const project = await getProjectFor(req, file.project);
    if (file.task && !same(file.task.assignee, req.user._id) && !canManageTask(req, file.task, project) && !canManageProject(req, project)) {
        throw new ApiError(403, "You do not have access to this file.");
    }
    return { file, project };
}

// GET /api/files/:id/download
export async function downloadFile(req, res) {
    const { file } = await getFileFor(req, req.params.id);
    res.download(filePath(file), file.originalName);
}

// DELETE /api/files/:id  (uploader, project manager, or files.delete_any)
export async function deleteFile(req, res) {
    const { file, project } = await getFileFor(req, req.params.id);
    const allowed = same(file.uploadedBy, req.user._id) || canManageProject(req, project) || can(req, "files.delete_any");
    if (!allowed) throw new ApiError(403, "Only the uploader, the project lead, or someone with 'files.delete_any' can delete this file.");

    await fs.rm(filePath(file), { force: true });
    await file.deleteOne();
    res.json({ message: "File deleted." });
}
