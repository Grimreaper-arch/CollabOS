import { Router } from "express";
import { protect, requireOrg } from "../middleware/auth.js";
import { downloadFile, deleteFile } from "../controllers/fileController.js";
import { listNotifications, markAllRead } from "../controllers/notificationController.js";
import { listActivity } from "../controllers/activityController.js";
import { getAnalytics } from "../controllers/analyticsController.js";
import { listConversations, listMessages, sendMessage } from "../controllers/messageController.js";

const router = Router();

router.use(protect);

// Notifications work even before joining an organization (e.g. "you were invited").
router.get("/notifications", listNotifications);
router.patch("/notifications/read-all", markAllRead);

router.use(requireOrg);

router.get("/files/:id/download", downloadFile);
router.delete("/files/:id", deleteFile);

router.get("/activity", listActivity);
router.get("/analytics", getAnalytics);

router.get("/messages/conversations", listConversations);
router.get("/messages", listMessages);
router.post("/messages", sendMessage);

export default router;
