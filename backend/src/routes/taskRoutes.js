import { Router } from "express";
import * as tasks from "../controllers/taskController.js";
import { protect, requireOrg, requirePermission } from "../middleware/auth.js";

const router = Router();

router.use(protect, requireOrg);

router.route("/")
    .get(tasks.listTasks)
    .post(requirePermission("tasks.assign"), tasks.createTask);

// Edit/delete: the assigner, the project lead, or "tasks.manage_all" (checked in the controller).
router.route("/:id")
    .put(tasks.updateTask)
    .delete(tasks.deleteTask);

router.patch("/:id/status", tasks.updateStatus);

router.route("/:id/comments")
    .get(tasks.listComments)
    .post(tasks.addComment);

export default router;
