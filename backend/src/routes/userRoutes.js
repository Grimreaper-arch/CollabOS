import { Router } from "express";
import { updateProfile, changePassword, uploadAvatar } from "../controllers/userController.js";
import { protect } from "../middleware/auth.js";
import { uploadAvatar as avatarUpload } from "../middleware/upload.js";

const router = Router();

router.use(protect);
router.put("/me", updateProfile);
router.put("/me/password", changePassword);
router.post("/me/avatar", avatarUpload, uploadAvatar);

export default router;
