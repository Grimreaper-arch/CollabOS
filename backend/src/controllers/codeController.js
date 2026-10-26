import CodeFile, { MAX_FILE_BYTES, MAX_PROJECT_BYTES } from "../models/CodeFile.js";
import ApiError from "../utils/ApiError.js";
import { canManageProject, getProjectFor } from "../utils/access.js";
import { logActivity } from "../utils/events.js";

const LIST_FIELDS = "path size createdAt updatedAt updatedBy";

// "src//App.jsx " → "src/App.jsx". Rejects "..", absolute paths and odd characters.
function cleanPath(raw) {
    const path = String(raw || "").trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
    if (!path) throw new ApiError(400, "File name is required.");
    if (path.length > 200) throw new ApiError(400, "File path is too long.");
    if (path.split("/").length > 8) throw new ApiError(400, "Folders can be at most 8 levels deep.");
    if (path.split("/").some((part) => !part || part === "." || part === "..")) throw new ApiError(400, "Invalid file path.");
    if (!/^[\w\-. /@()+]+$/.test(path)) throw new ApiError(400, "Use letters, numbers, spaces and - _ . / @ ( ) + in file names.");
    return path;
}

const bytes = (text) => Buffer.byteLength(text || "", "utf8");

async function projectUsage(projectId, excludeFileId) {
    const [result] = await CodeFile.aggregate([
        { $match: { project: projectId, ...(excludeFileId ? { _id: { $ne: excludeFileId } } : {}) } },
        { $group: { _id: null, total: { $sum: "$size" } } }
    ]);
    return result?.total || 0;
}

async function checkLimits(project, content, excludeFileId) {
    const size = bytes(content);
    if (size > MAX_FILE_BYTES) throw new ApiError(413, `Files can be at most ${MAX_FILE_BYTES / 1024} KB.`);
    if ((await projectUsage(project._id, excludeFileId)) + size > MAX_PROJECT_BYTES) {
        throw new ApiError(413, `This project has reached its ${MAX_PROJECT_BYTES / 1024 / 1024} MB code limit.`);
    }
}

// Reading needs project access; editing needs to be in the project (or manage it).
async function loadProject(req, { write = false } = {}) {
    const project = await getProjectFor(req, req.params.id);
    const canEdit = project.hasAccess(req.user._id) || canManageProject(req, project);
    if (write && !canEdit) throw new ApiError(403, "Only people in this project can edit its code.");
    return { project, canEdit };
}

async function loadFile(project, fileId) {
    const file = await CodeFile.findOne({ _id: fileId, project: project._id });
    if (!file) throw new ApiError(404, "File not found. Someone may have deleted or renamed it.");
    return file;
}

// GET /api/projects/:id/code — file list (no contents) and storage usage.
export async function listFiles(req, res) {
    const { project, canEdit } = await loadProject(req);
    const files = await CodeFile.find({ project: project._id }).select(LIST_FIELDS).populate("updatedBy", "fullName").sort({ path: 1 });
    res.json({
        files,
        canEdit,
        usage: { used: files.reduce((sum, f) => sum + f.size, 0), limit: MAX_PROJECT_BYTES, fileLimit: MAX_FILE_BYTES }
    });
}

// GET /api/projects/:id/code/:fileId — one file with its content.
export async function getFile(req, res) {
    const { project } = await loadProject(req);
    const file = await loadFile(project, req.params.fileId);
    res.json({ file: await file.populate("updatedBy", "fullName") });
}

// POST /api/projects/:id/code  body: { path, content }
export async function createFile(req, res) {
    const { project } = await loadProject(req, { write: true });
    const path = cleanPath(req.body.path);
    const content = String(req.body.content ?? "");
    await checkLimits(project, content);

    if (await CodeFile.exists({ project: project._id, path })) throw new ApiError(409, `${path} already exists.`);
    const file = await CodeFile.create({ org: req.org._id, project: project._id, path, content, createdBy: req.user._id, updatedBy: req.user._id });
    await logActivity(project, req.user._id, `${req.user.fullName} created ${path}.`);
    res.status(201).json({ file: await file.populate("updatedBy", "fullName") });
}

// PUT /api/projects/:id/code/:fileId  body: { content?, path?, baseVersion? }
// baseVersion is the file's updatedAt when the editor loaded it. If someone else saved
// since then, we refuse (409) instead of silently overwriting their work.
export async function updateFile(req, res) {
    const { project } = await loadProject(req, { write: true });
    const file = await loadFile(project, req.params.fileId);

    if (req.body.baseVersion && !req.body.force && new Date(req.body.baseVersion).getTime() !== file.updatedAt.getTime()) {
        await file.populate("updatedBy", "fullName");
        return res.status(409).json({ message: `${file.updatedBy?.fullName || "Someone"} saved a newer version of this file.`, file });
    }

    if (req.body.path !== undefined) {
        const path = cleanPath(req.body.path);
        if (path !== file.path && (await CodeFile.exists({ project: project._id, path }))) throw new ApiError(409, `${path} already exists.`);
        if (path !== file.path) await logActivity(project, req.user._id, `${req.user.fullName} renamed ${file.path} to ${path}.`);
        file.path = path;
    }
    if (req.body.content !== undefined) {
        const content = String(req.body.content);
        await checkLimits(project, content, file._id);
        file.content = content;
    }
    file.updatedBy = req.user._id;
    await file.save();
    res.json({ file: await file.populate("updatedBy", "fullName") });
}

// DELETE /api/projects/:id/code/:fileId
export async function deleteFile(req, res) {
    const { project } = await loadProject(req, { write: true });
    const file = await loadFile(project, req.params.fileId);
    await file.deleteOne();
    await logActivity(project, req.user._id, `${req.user.fullName} deleted ${file.path}.`);
    res.json({ message: "File deleted." });
}
