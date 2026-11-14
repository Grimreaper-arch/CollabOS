import CodeFile, { MAX_FILE_BYTES, MAX_PROJECT_BYTES } from "../models/CodeFile.js";
import ApiError from "../utils/ApiError.js";
import { canManageProject, getProjectFor } from "../utils/access.js";
import { logActivity } from "../utils/events.js";
import CodeRun from "../models/CodeRun.js";
import { DOCKER_LANGUAGES, MAX_SOURCE_BYTES, MAX_STDIN_BYTES, runInDocker, runnerStatus } from "../services/codeRunner.js";
import { limitsOf, planError } from "../services/plans.js";
import { codeDocClosed, codeDocReplace, codeDocSaved, codePresence } from "../services/realtime.js";

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
        // Who has which file open right now (live editing).
        presence: codePresence(project._id),
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
    await file.populate("updatedBy", "fullName");
    if (req.body.content !== undefined) {
        // A save from outside the live editing session replaces what the live editors see.
        if (!req.body.live) codeDocReplace(file._id, file.content);
        codeDocSaved(file);
    }
    res.json({ file });
}

// DELETE /api/projects/:id/code/:fileId
export async function deleteFile(req, res) {
    const { project } = await loadProject(req, { write: true });
    const file = await loadFile(project, req.params.fileId);
    await file.deleteOne();
    codeDocClosed(file._id);
    await logActivity(project, req.user._id, `${req.user.fullName} deleted ${file.path}.`);
    res.json({ message: "File deleted." });
}

// ---------- Running code ----------

const BROWSER_LANGUAGES = { javascript: "JavaScript", python: "Python" };
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const runsToday = (orgId) => CodeRun.countDocuments({ org: orgId, createdAt: { $gte: startOfDay() } });
const clip = (text, max) => String(text ?? "").slice(0, max);

async function assertRunAllowed(req) {
    const limit = limitsOf(req.org).codeRunsPerDay;
    if (limit !== null && (await runsToday(req.org._id)) >= limit) throw planError(req.org, "codeRunsPerDay", limit);
}

function saveRun(req, project, run) {
    return CodeRun.create({
        org: req.org._id, project: project._id, user: req.user._id,
        path: clip(run.path, 200) || "untitled", language: run.language, runner: run.runner, status: run.status,
        exitCode: Number.isInteger(run.exitCode) ? run.exitCode : null, timeMs: Math.max(0, Math.round(Number(run.timeMs) || 0)),
        stdin: clip(run.stdin, 4000), stdout: clip(run.stdout, 20000), stderr: clip(run.stderr, 20000)
    });
}

// GET /api/projects/:id/code/runner — which languages can run, and today's usage.
export async function runnerInfo(req, res) {
    await loadProject(req);
    res.json({
        browser: BROWSER_LANGUAGES,
        docker: await runnerStatus(),
        limit: limitsOf(req.org).codeRunsPerDay,
        usedToday: await runsToday(req.org._id)
    });
}

// POST /api/projects/:id/code/run  body: { path, language, source, stdin }
// Compiles and runs a C, C++ or Java program in a sandboxed Docker container.
export async function runCode(req, res) {
    const { project } = await loadProject(req, { write: true });
    const { language } = req.body;
    const source = String(req.body.source ?? "");
    const stdin = String(req.body.stdin ?? "");
    if (!Object.hasOwn(DOCKER_LANGUAGES, language)) throw new ApiError(400, "This language runs in your browser, or isn't supported yet.");
    if (!source.trim()) throw new ApiError(400, "There's no code to run.");
    if (bytes(source) > MAX_SOURCE_BYTES) throw new ApiError(413, `Programs can be at most ${MAX_SOURCE_BYTES / 1024} KB.`);
    if (bytes(stdin) > MAX_STDIN_BYTES) throw new ApiError(413, `Input can be at most ${MAX_STDIN_BYTES / 1024} KB.`);
    await assertRunAllowed(req);

    const result = await runInDocker({ language, source, stdin });
    // Only real runs are kept in the history and counted against the plan.
    const saved = ["unavailable", "preparing", "busy"].includes(result.status)
        ? null
        : await saveRun(req, project, { ...result, path: req.body.path, language, runner: "docker", stdin });
    res.json({ run: { ...result, _id: saved?._id, createdAt: saved?.createdAt, path: req.body.path, language, runner: "docker", stdin } });
}

// POST /api/projects/:id/code/runs — records a run that happened in the browser (JavaScript, Python).
export async function recordRun(req, res) {
    const { project } = await loadProject(req, { write: true });
    if (!Object.hasOwn(BROWSER_LANGUAGES, req.body.language)) throw new ApiError(400, "Unknown language.");
    if (!["ok", "runtime_error", "timeout"].includes(req.body.status)) throw new ApiError(400, "Unknown status.");
    await assertRunAllowed(req);
    const run = await saveRun(req, project, { ...req.body, runner: "browser" });
    res.status(201).json({ run });
}

// GET /api/projects/:id/code/runs?path=src/main.cpp — the latest runs (of one file, or of the project).
export async function listRuns(req, res) {
    const { project } = await loadProject(req);
    const filter = { project: project._id };
    if (req.query.path) filter.path = String(req.query.path);
    const runs = await CodeRun.find(filter).populate("user", "fullName avatar").sort({ createdAt: -1 }).limit(30);
    res.json({ runs });
}
