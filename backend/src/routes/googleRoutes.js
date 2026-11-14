import { Router } from "express";
import * as google from "../controllers/googleController.js";
import { protect, requireOrg } from "../middleware/auth.js";
import { authLimiter } from "../middleware/security.js";

const router = Router();

// Public: start "Sign in with Google", and the page Google sends the browser back to.
router.get("/login-url", authLimiter, google.loginUrl);
router.get("/callback", authLimiter, google.callback);

router.use(protect);
router.get("/status", google.status);
router.get("/connect-url", google.connectUrl);
router.post("/disconnect", google.disconnect);
router.get("/events", google.events);
router.post("/sync", requireOrg, google.sync);

export default router;
