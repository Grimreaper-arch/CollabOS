import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Membership from "../models/Membership.js";
import ApiError from "../utils/ApiError.js";

// The token only identifies the user. Their organization, role and permissions are
// looked up fresh on every request, so a role change takes effect immediately.
export function signToken(user) {
    return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    });
}

// Loads the user's organization membership and works out their permissions.
// Sets req.membership, req.org, req.role and req.permissions (a Set).
export async function loadAccess(req) {
    const membership = await Membership.findOne({ user: req.user._id }).populate("org").populate("role");
    req.membership = membership?.org && membership?.role ? membership : null;
    req.org = req.membership?.org || null;
    req.role = req.membership?.role || null;
    req.permissions = new Set(req.role ? req.role.effectivePermissions() : []);
}

// Authentication: who is making this request?
// Expects "Authorization: Bearer <token>".
export async function protect(req, _res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Please log in to continue.");

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new ApiError(401, "Your session has expired. Please log in again.");
    }

    const user = await User.findById(payload.id);
    if (!user) throw new ApiError(401, "This account no longer exists.");

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
