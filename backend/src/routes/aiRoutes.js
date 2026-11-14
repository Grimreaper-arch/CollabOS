import { Router } from "express";
import * as ai from "../controllers/aiController.js";
import { protect, requireOrg } from "../middleware/auth.js";

const router = Router();

router.use(protect, requireOrg);
router.get("/status", ai.status);
router.post("/chat", ai.chat);
router.post("/confirm", ai.confirm);
router.get("/conversations", ai.listConversations);
router.route("/conversations/:id").get(ai.getConversation).delete(ai.deleteConversation);

export default router;
