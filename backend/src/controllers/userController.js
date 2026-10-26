import fs from "node:fs/promises";
import path from "node:path";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { UPLOAD_ROOT } from "../middleware/upload.js";

const PROFILE_FIELDS = ["fullName", "email", "institution", "department", "phone", "bio"];

// PUT /api/users/me
export async function updateProfile(req, res) {
    PROFILE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) req.user[field] = String(req.body[field]).trim();
    });
    if (!req.user.fullName) throw new ApiError(400, "Full name is required.");

    const emailTaken = await User.exists({ email: req.user.email, _id: { $ne: req.user._id } });
    if (emailTaken) throw new ApiError(409, "That email is already in use.");

    await req.user.save();
    res.json({ user: req.user });
}

// PUT /api/users/me/password
export async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) throw new ApiError(400, "New password must be at least 8 characters.");

    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword || ""))) throw new ApiError(400, "Current password is incorrect.");

    user.password = newPassword;
    await user.save();
    res.json({ message: "Password updated." });
}

// POST /api/users/me/avatar  (multipart form, field "avatar")
export async function uploadAvatar(req, res) {
    if (!req.file) throw new ApiError(400, "Choose an image to upload.");

    const previous = req.user.avatar;
    req.user.avatar = `/uploads/avatars/${req.file.filename}`;
    await req.user.save();

    if (previous) await fs.rm(path.join(UPLOAD_ROOT, "avatars", path.basename(previous)), { force: true });
    res.json({ user: req.user });
}
