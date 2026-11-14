import { Router } from "express";
import * as meetings from "../controllers/meetingController.js";
import { protect, requireOrg } from "../middleware/auth.js";

const router = Router();

router.use(protect, requireOrg);
router.route("/").get(meetings.listMeetings).post(meetings.createMeeting);
router.get("/room/:roomId", meetings.getMeeting);
router.delete("/:id", meetings.cancelMeeting);

export default router;
