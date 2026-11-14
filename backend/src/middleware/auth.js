import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import ApiError from "../utils/ApiError.js";

// Two tokens:
//  - an ACCESS token (15 minutes) sent by the browser as "Authorization: Bearer ...". It only identifies
//    the user; their organization, role and permissions are looked up fresh on every request.
//  - a REFRESH token (7 days, JWT_EXPIRES_IN) kept in an httpOnly cookie that page scripts can't read.
//    When the access token expires, the browser calls /api/auth/refresh to get a new one.
// Both carry the user's tokenVersion. Raising it (password change, "sign out everywhere") makes
// every existing token invalid at once.
// A user can belong to several organizations; the browser says which one it is working in with
// the "X-Org-Id" header.
const ACCESS_TTL = () => process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TTL = () => process.env.JWT_EXPIRES_IN || "7d";
const refreshSecret = () => process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}:refresh`;
export const REFRESH_COOKIE = "collabos_refresh";

export function signToken(user) {
    return jwt.sign({ id: user._id, v: user.tokenVersion || 0, type: "access" }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL() });
}

export function setRefreshCookie(res, user) {
    const token = jwt.sign({ id: user._id, v: user.tokenVersion || 0, type: "refresh" }, refreshSecret(), { expiresIn: REFRESH_TTL() });
    res.cookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/auth",
        maxAge: jwt.decode(token).exp * 1000 - Date.now()
    });
}

export function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

// Reads and checks the refresh cookie. Returns the user, or throws 401.
export async function userFromRefreshCookie(req) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new ApiError(401, "Please log in to continue.");
    let payload;
    try {
        payload = jwt.verify(token, refreshSecret());
    } catch {
        throw new ApiError(401, "Your session has expired. Please log in again.");
    }
    const user = await User.findById(payload.id);
    if (!user || payload.type !== "refresh" || payload.v !== (user.tokenVersion || 0)) {
        throw new ApiError(401, "Your session has ended. Please log in again.");
    }
    return user;
}

// Loads the user's memberships, picks the active organization and works out their permissions.
// The active organization is, in order: `orgId` if given, the X-Org-Id header, the one they
// used last, or the oldest one they joined. Organizations they don't belong to are ignored.
// Sets req.memberships, req.membership, req.org, req.role and req.permissions (a Set).
export async function loadAccess(req, orgId = null) {
    const memberships = await Membership.find({ user: req.user._id }).populate("org").populate("role").sort({ createdAt: 1 });
    req.memberships = memberships.filter((m) => m.org && m.role);

    const wanted = [orgId, req.headers?.["x-org-id"], req.user.lastOrg].filter(Boolean).map(String);
    const membership = wanted.map((id) => req.memberships.find((m) => String(m.org._id) === id)).find(Boolean)
        || req.memberships[0] || null;

    req.membership = membership;
    req.org = membership?.org || null;
    req.role = membership?.role || null;
    req.permissions = new Set(req.role ? req.role.effectivePermissions() : []);

    // Remember it, so the next login opens the same organization.
    const activeId = req.org?._id || null;
    if (String(req.user.lastOrg || "") !== String(activeId || "")) {
        req.user.lastOrg = activeId;
        await User.updateOne({ _id: req.user._id }, { lastOrg: activeId });
    }
}

// Authentication: who is making this request?
// Expects "Authorization: Bearer <token>". Accounts that haven't verified their email yet are
// let through only by `protectUnverified` (used by the verification routes and /auth/me).
export async function protect(req, res, next) {
    await protectUnverified(req, res, () => {});
    if (!req.user.emailVerified) throw new ApiError(403, "Please verify your email address first.", "EMAIL_NOT_VERIFIED");
    next();
}

export async function protectUnverified(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Please log in to continue.");

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        // The browser reacts to TOKEN_EXPIRED by refreshing the token and retrying.
        if (error.name === "TokenExpiredError") throw new ApiError(401, "Your session expired.", "TOKEN_EXPIRED");
        throw new ApiError(401, "Your session is invalid. Please log in again.");
    }
    if (payload.type !== "access") throw new ApiError(401, "Your session is invalid. Please log in again.");

    const user = await User.findById(payload.id);
    if (!user) throw new ApiError(401, "This account no longer exists.");
    // A password change or "sign out everywhere" raises tokenVersion, ending every other session.
    if (payload.v !== (user.tokenVersion || 0)) throw new ApiError(401, "You were signed out. Please log in again.");

    req.user = user;
    await loadAccess(req);
    next();
}

// The user must belong to an organization.
export function requireOrg(req, _res, next) {
    if (!req.org) throw new ApiError(403, "Create or join an organization first.");
    next();
}

// Authorization: does the user's role include these permissions?
// Usage: router.post("/", protect, requirePermission("projects.create"), createProject)
export function requirePermission(...permissions) {
    return (req, _res, next) => {
        if (!req.org) throw new ApiError(403, "Create or join an organization first.");
        const missing = permissions.filter((p) => !req.permissions.has(p));
        if (missing.length) {
            throw new ApiError(403, `Your role (${req.role.name}) does not allow this. Missing permission: ${missing.join(", ")}.`);
        }
        next();
    };
}

export const can = (req, permission) => Boolean(req.permissions?.has(permission));
