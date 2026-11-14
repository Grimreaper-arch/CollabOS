import User from "../models/User.js";
import { clearRefreshCookie, loadAccess, setRefreshCookie, signToken, userFromRefreshCookie } from "../middleware/auth.js";
import { assertStrongPassword } from "../utils/password.js";
import { sessionPayload } from "../services/orgService.js";
import { sendPasswordResetCode, sendVerificationCode, sendWelcome } from "../services/mailer.js";
import { checkCode, issueCode } from "../utils/oneTimeCode.js";
import ApiError from "../utils/ApiError.js";

const pick = (body, fields) => Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
const normalEmail = (email) => String(email || "").toLowerCase().trim();

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

// Logs the user in: sets the refresh cookie and returns an access token plus the session.
async function respondWithSession(res, user, status = 200) {
    const req = { user };
    await loadAccess(req);
    setRefreshCookie(res, user);
    res.status(status).json({ token: signToken(user), ...sessionPayload(req) });
}

// Creates a verification code for the user, saves it and emails it.
export async function sendNewVerificationCode(user) {
    const withCode = await User.findById(user._id).select("+verifyCode");
    const code = issueCode(withCode, "verifyCode");
    await withCode.save();
    return sendVerificationCode(withCode, code);
}

// POST /api/auth/register
// New accounts have no role: they get one by creating an organization or accepting an invitation.
// They must verify their email with the code we send before they can use the app.
export async function register(req, res) {
    const data = pick(req.body, ["fullName", "email", "password", "institution", "department", "phone"]);

    if (!data.fullName?.trim()) throw new ApiError(400, "Please enter your full name.");
    assertStrongPassword(data.password, data);
    if (await User.exists({ email: normalEmail(data.email) })) throw new ApiError(409, "Email already exists.");

    const user = await User.create(data);
    await sendNewVerificationCode(user);
    await respondWithSession(res, user, 201);
}

// POST /api/auth/login
export async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const user = await User.findOne({ email: normalEmail(email) }).select("+password +failedLogins +lockedUntil");
    if (user?.lockedUntil > new Date()) {
        const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
        throw new ApiError(423, `Too many wrong passwords. This account is locked for ${minutes} more minute${minutes === 1 ? "" : "s"}, or reset your password to unlock it now.`, "ACCOUNT_LOCKED");
    }
    // Same message for both cases so attackers can't tell which emails are registered.
    if (!user || !(await user.comparePassword(password))) {
        if (user) {
            user.failedLogins = (user.failedLogins || 0) + 1;
            if (user.failedLogins >= LOCK_AFTER) {
                user.failedLogins = 0;
                user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
            }
            await user.save();
        }
        throw new ApiError(401, "Invalid email or password.");
    }
    if (user.failedLogins || user.lockedUntil) {
        user.failedLogins = 0;
        user.lockedUntil = null;
        await user.save();
    }

    // Unverified accounts can log in, but only reach the verification screen. Send a fresh code
    // unless one was sent less than a minute ago.
    if (!user.emailVerified) await sendNewVerificationCode(user).catch(() => {});
    await respondWithSession(res, user);
}

// GET /api/auth/me
export function me(req, res) {
    res.json(sessionPayload(req));
}

// POST /api/auth/verify-email  body: { code }
export async function verifyEmail(req, res) {
    if (req.user.emailVerified) return res.json(sessionPayload(req));

    const user = await User.findById(req.user._id).select("+verifyCode");
    const result = checkCode(user, "verifyCode", req.body.code);
    if (!result.ok) {
        await user.save();
        throw new ApiError(400, result.message);
    }
    user.emailVerified = true;
    await user.save();
    await sendWelcome(user);

    req.user = user;
    await loadAccess(req);
    res.json(sessionPayload(req));
}

// POST /api/auth/resend-code
export async function resendCode(req, res) {
    if (req.user.emailVerified) throw new ApiError(400, "Your email is already verified.");
    const sent = await sendNewVerificationCode(req.user);
    if (!sent) throw new ApiError(502, "We couldn't send the email right now. Try again in a minute.");
    res.json({ message: `A new code was sent to ${req.user.email}.` });
}

// POST /api/auth/forgot-password  body: { email }
// Always answers the same way, so it can't be used to find out which emails have accounts.
export async function forgotPassword(req, res) {
    const email = normalEmail(req.body.email);
    if (!email) throw new ApiError(400, "Enter your email address.");

    const user = await User.findOne({ email }).select("+resetCode");
    if (user) {
        try {
            const code = issueCode(user, "resetCode");
            await user.save();
            await sendPasswordResetCode(user, code);
        } catch (error) {
            // Asking again within a minute: tell them to wait (this doesn't reveal much, they just asked).
            if (error.status === 429) throw error;
            console.error("Password reset email failed:", error.message);
        }
    }
    res.json({ message: `If ${email} has a CollabOS account, a reset code is on its way.` });
}

// POST /api/auth/reset-password  body: { email, code, password }
// Resetting also verifies the email (they proved they can read it) and logs out other sessions.
export async function resetPassword(req, res) {
    const { code, password } = req.body;
    const user = await User.findOne({ email: normalEmail(req.body.email) }).select("+resetCode +password +failedLogins +lockedUntil");
    if (!user) throw new ApiError(400, "Wrong code. Ask for a new one.");
    assertStrongPassword(password, user);

    const result = checkCode(user, "resetCode", code);
    if (!result.ok) {
        await user.save();
        throw new ApiError(400, result.message);
    }
    user.password = password;
    user.emailVerified = true;
    // Resetting the password also unlocks a locked account.
    user.failedLogins = 0;
    user.lockedUntil = null;
    await user.save();
    await respondWithSession(res, user);
}

// POST /api/auth/refresh — a new access token from the refresh cookie (called when the old one expires).
export async function refresh(req, res) {
    const user = await userFromRefreshCookie(req);
    // Rotate the cookie too, so an active user stays signed in.
    setRefreshCookie(res, user);
    res.json({ token: signToken(user) });
}

// POST /api/auth/logout — forgets the refresh cookie on this device.
export function logout(_req, res) {
    clearRefreshCookie(res);
    res.json({ message: "Signed out." });
}

// POST /api/auth/logout-all — ends every session on every device (raises tokenVersion).
export async function logoutAll(req, res) {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    clearRefreshCookie(res);
    res.json({ message: "Signed out of all devices." });
}
