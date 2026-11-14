import crypto from "node:crypto";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import ApiError from "../utils/ApiError.js";
import { setRefreshCookie } from "../middleware/auth.js";
import * as google from "../services/google.js";

const clientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";
const back = (res, path, params) => res.redirect(`${clientUrl()}${path}?${new URLSearchParams(params)}`);

// GET /api/google/status — is Google set up on the server, and has this user connected their calendar?
export function status(req, res) {
    res.json({ configured: google.googleConfigured(), connected: Boolean(req.user.google?.connected), email: req.user.google?.email || "" });
}

// GET /api/google/login-url — "Sign in with Google" (public).
export function loginUrl(_req, res) {
    res.json({ url: google.authUrl("login") });
}

// GET /api/google/connect-url — "Connect Google Calendar" for the logged-in user.
export function connectUrl(req, res) {
    res.json({ url: google.authUrl("calendar", req.user._id) });
}

// GET /api/google/callback?code=…&state=… — Google sends the browser back here.
export async function callback(req, res) {
    let purpose = "login";
    try {
        if (req.query.error) throw new ApiError(400, req.query.error === "access_denied" ? "Google sign-in was cancelled." : `Google: ${req.query.error}`);
        const state = google.readState(req.query.state);
        purpose = state.purpose;
        const result = await google.exchangeCode(String(req.query.code || ""));
        const { profile } = result;
        if (!profile.email_verified) throw new ApiError(400, "Your Google account's email isn't verified.");

        if (purpose === "calendar") {
            const user = await User.findById(state.userId).select("+google.refreshToken");
            if (!user) throw new ApiError(404, "Account not found.");
            await google.saveCalendarTokens(user, result);
            return back(res, "/calendar", { google: "connected" });
        }

        // Sign in with Google: log into the account with this email, or create one.
        // Google has already verified the address, so no 6-digit code is needed.
        const email = profile.email.toLowerCase();
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({
                fullName: profile.name || email.split("@")[0],
                email,
                // A random password nobody knows; they can set one later with "Forgot password".
                password: `${crypto.randomBytes(18).toString("base64url")}9a`,
                emailVerified: true,
                avatar: profile.picture || ""
            });
        } else if (!user.emailVerified) {
            user.emailVerified = true;
            await user.save();
        }
        setRefreshCookie(res, user);
        return back(res, "/login", { google: "signed-in" });
    } catch (error) {
        return back(res, purpose === "calendar" ? "/calendar" : "/login", { google_error: error.message || "Google sign-in failed." });
    }
}

// POST /api/google/disconnect
export async function disconnect(req, res) {
    await google.disconnect(req.user);
    res.json({ message: "Google Calendar disconnected." });
}

// GET /api/google/events?from=ISO&to=ISO — the user's Google Calendar events for My Calendar.
export async function events(req, res) {
    if (!req.user.google?.connected) return res.json({ events: [], connected: false });
    const from = new Date(req.query.from || Date.now() - 31 * 864e5);
    const to = new Date(req.query.to || Date.now() + 62 * 864e5);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(400, "Invalid date range.");
    res.json({ events: await google.listEvents(req.user._id, from, to), connected: true });
}

// POST /api/google/sync — puts all your open tasks with due dates (in this organization) in Google Calendar.
export async function sync(req, res) {
    if (!req.user.google?.connected) throw new ApiError(400, "Connect Google Calendar first.");
    const tasks = await Task.find({ org: req.org._id, assignee: req.user._id, status: "pending", dueDate: { $ne: null } });
    const projects = new Map((await Project.find({ _id: { $in: tasks.map((t) => t.project) } }).select("name")).map((p) => [String(p._id), p.name]));
    let synced = 0;
    for (const task of tasks) {
        const id = await google.upsertTaskEvent(task, { projectName: projects.get(String(task.project)) || "CollabOS" });
        if (id) {
            synced += 1;
            if (id !== task.googleEventId) await Task.updateOne({ _id: task._id }, { googleEventId: id });
        }
    }
    res.json({ synced, message: `${synced} task${synced === 1 ? "" : "s"} synced to Google Calendar.` });
}
