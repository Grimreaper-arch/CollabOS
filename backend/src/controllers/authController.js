import User from "../models/User.js";
import { loadAccess, signToken } from "../middleware/auth.js";
import { sessionPayload } from "../services/orgService.js";
import ApiError from "../utils/ApiError.js";

const pick = (body, fields) => Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

async function respondWithSession(res, user, status = 200) {
    const req = { user };
    await loadAccess(req);
    res.status(status).json({ token: signToken(user), ...sessionPayload(req) });
}

// POST /api/auth/register
// New accounts have no role: they get one by creating an organization or accepting an invitation.
export async function register(req, res) {
    const data = pick(req.body, ["fullName", "email", "password", "institution", "department", "phone"]);

    if (!data.fullName?.trim()) throw new ApiError(400, "Please enter your full name.");
    if (!data.password || data.password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");
    if (await User.exists({ email: String(data.email).toLowerCase().trim() })) throw new ApiError(409, "Email already exists.");

    const user = await User.create(data);
    await respondWithSession(res, user, 201);
}

// POST /api/auth/login
export async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    // Same message for both cases so attackers can't tell which emails are registered.
    if (!user || !(await user.comparePassword(password))) throw new ApiError(401, "Invalid email or password.");

    await respondWithSession(res, user);
}

// GET /api/auth/me
export function me(req, res) {
    res.json(sessionPayload(req));
}
