import { Router } from "express";
import * as auth from "../controllers/authController.js";
import { protectUnverified } from "../middleware/auth.js";
import { authLimiter, loginLimiter } from "../middleware/security.js";

const router = Router();

router.post("/register", authLimiter, auth.register);
router.post("/login", loginLimiter, auth.login);
router.post("/forgot-password", authLimiter, auth.forgotPassword);
router.post("/reset-password", authLimiter, auth.resetPassword);
router.post("/refresh", auth.refresh);
router.post("/logout", auth.logout);
router.post("/logout-all", protectUnverified, auth.logoutAll);

// These work before the email is verified.
router.get("/me", protectUnverified, auth.me);
router.post("/verify-email", authLimiter, protectUnverified, auth.verifyEmail);
router.post("/resend-code", authLimiter, protectUnverified, auth.resendCode);

export default router;
