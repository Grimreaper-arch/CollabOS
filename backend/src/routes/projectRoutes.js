import { Router } from "express";
import * as projects from "../controllers/projectController.js";
import { uploadProjectFile, listProjectFiles } from "../controllers/fileController.js";
import * as code from "../controllers/codeController.js";
import { protect, requireOrg, requirePermission } from "../middleware/auth.js";
import { uploadFile } from "../middleware/upload.js";

const router = Router();

router.use(protect, requireOrg);

router.route("/")
    .get(projects.listProjects)
    .post(requirePermission("projects.create"), projects.createProject);

// Editing, deleting and member changes are checked inside the controller:
// allowed for the project lead or anyone with "projects.manage_all".
router.route("/:id")
    .get(projects.getProject)
    .put(projects.updateProject)
    .delete(projects.deleteProject);

router.post("/:id/members", projects.addMembers);
router.delete("/:id/members/:userId", projects.removeMember);

router.route("/:id/files")
    .get(listProjectFiles)
    .post(uploadFile, uploadProjectFile);

// Code workspace: text files stored in MongoDB (checked in the controller).
router.route("/:id/code")
    .get(code.listFiles)
    .post(code.createFile);
router.route("/:id/code/:fileId")
    .get(code.getFile)
    .put(code.updateFile)
    .delete(code.deleteFile);

export default router;
