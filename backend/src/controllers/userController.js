import fs from "node:fs/promises";
import path from "node:path";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { setRefreshCookie, signToken } from "../middleware/auth.js";
import { assertStrongPassword } from "../utils/password.js";
import { matchesType } from "../utils/fileSignature.js";
import { UPLOAD_ROOT } from "../middleware/upload.js";
import { sendNewVerificationCode } from "./authController.js";

const PROFILE_FIELDS = ["fullName", "email", "institution", "department", "phone", "bio"];

// PUT /api/users/me
// Changing the email address means it has to be verified again.
export async function updateProfile(req, res) {
    PROFILE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) req.user[field] = String(req.body[field]).trim();
    });
    if (req.body.emailReminders !== undefined) req.user.emailReminders = Boolean(req.body.emailReminders);
    if (!req.user.fullName) throw new ApiError(400, "Full name is required.");
    req.user.email = req.user.email.toLowerCase();

    const emailTaken = await User.exists({ email: req.user.email, _id: { $ne: req.user._id } });
    if (emailTaken) throw new ApiError(409, "That email is already in use.");

    const emailChanged = req.user.isModified("email");
    if (emailChanged) req.user.emailVerified = false;
    await req.user.save();
    if (emailChanged) await sendNewVerificationCode(req.user);
    res.json({ user: req.user, emailChanged });
}

// PUT /api/users/me/password
export async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword || ""))) throw new ApiError(400, "Current password is incorrect.");
    assertStrongPassword(newPassword, user);
    if (currentPassword === newPassword) throw new ApiError(400, "The new password must be different from the current one.");

    user.password = newPassword;
    await user.save();
    // Other sessions are logged out by the password change; this one gets fresh tokens.
    setRefreshCookie(res, user);
    res.json({ message: "Password updated.", token: signToken(user) });
}

// POST /api/users/me/avatar  (multipart form, field "avatar")
export async function uploadAvatar(req, res) {
    if (!req.file) throw new ApiError(400, "Choose an image to upload.");
    if (!(await matchesType(req.file.path, req.file.mimetype))) {
        await fs.rm(req.file.path, { force: true });
        throw new ApiError(400, "That file isn't really an image.");
    }

    const previous = req.user.avatar;
    req.user.avatar = `/uploads/avatars/${req.file.filename}`;
    await req.user.save();

    if (previous) await fs.rm(path.join(UPLOAD_ROOT, "avatars", path.basename(previous)), { force: true });
    res.json({ user: req.user });
}
