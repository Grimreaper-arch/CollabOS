// Security middleware: request rate limits and protection against NoSQL injection.
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const MINUTE = 60 * 1000;

// Rate limits can be switched off for automated tests with RATE_LIMIT=off.
const enabled = () => process.env.RATE_LIMIT !== "off";

function limiter({ windowMs, limit, message, keyGenerator }) {
    return rateLimit({
        windowMs,
        limit,
        keyGenerator,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skip: () => !enabled(),
        handler: (_req, res) => res.status(429).json({ message, code: "RATE_LIMITED" })
    });
}

// Every API request: 1000 per 15 minutes per IP address.
export const apiLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: 1000,
    message: "Too many requests. Please slow down and try again in a few minutes."
});

// Login: 10 tries per 15 minutes for each IP + email pair (account lockout in authController adds more).
export const loginLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || "").toLowerCase()}`,
    message: "Too many login attempts. Try again in 15 minutes."
});

// Sign-up, codes and password resets: 20 per 15 minutes per IP, so nobody can spam emails.
export const authLimiter = limiter({
    windowMs: 15 * MINUTE,
    limit: 20,
    message: "Too many attempts. Try again in 15 minutes."
});

// Running code: 20 runs a minute per person (used after login, so the key is the user).
export const runLimiter = limiter({
    windowMs: MINUTE,
    limit: 20,
    keyGenerator: (req) => `run:${req.user?._id || ipKeyGenerator(req.ip)}`,
    message: "You're running code very quickly. Wait a few seconds and try again."
});

// MongoDB treats keys starting with "$" as operators. If a request body contained
// { "email": { "$ne": null } }, a query using it could match any user. This removes such keys
// (and dotted keys) from req.body before any controller sees it.
function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object" && !(value instanceof Date)) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !key.startsWith("$") && !key.includes("."))
                .map(([key, inner]) => [key, clean(inner)])
        );
    }
    return value;
}

export function sanitizeBody(req, _res, next) {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) req.body = clean(req.body);
    next();
}
