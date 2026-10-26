import { Router } from "express";
import { myInvitations, acceptInvitation, declineInvitation } from "../controllers/invitationController.js";
import { protect } from "../middleware/auth.js";

// For the invited person. These work before the user belongs to any organization.
const router = Router();

router.use(protect);
router.get("/mine", myInvitations);
router.post("/:id/accept", acceptInvitation);
router.post("/:id/decline", declineInvitation);

export default router;
