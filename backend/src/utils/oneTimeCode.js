// 6-digit codes sent by email for verifying an address or resetting a password.
// Only an HMAC of the code is stored, it expires after 10 minutes, allows 5 wrong guesses,
// and a new one can be requested once a minute.
import crypto from "node:crypto";
import ApiError from "./ApiError.js";

const TTL = 10 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(code)).digest("hex");

// Creates a code in user[field] ("verifyCode" or "resetCode"). Returns the plain code to email.
// The caller saves the user.
export function issueCode(user, field) {
    const previous = user[field];
    if (previous?.sentAt && Date.now() - previous.sentAt.getTime() < RESEND_AFTER) {
        const wait = Math.ceil((RESEND_AFTER - (Date.now() - previous.sentAt.getTime())) / 1000);
        throw new ApiError(429, `Please wait ${wait} seconds before asking for a new code.`);
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    user[field] = { hash: hashCode(code), expiresAt: new Date(Date.now() + TTL), sentAt: new Date(), attempts: 0 };
    return code;
}

// Checks a code typed by the user. Wrong guesses are counted; the code is removed once used.
// The caller saves the user (also after a wrong guess, to store the attempt count).
export function checkCode(user, field, code) {
    const entry = user[field];
    if (!entry?.hash) return { ok: false, message: "No code was requested. Ask for a new one." };
    if (entry.expiresAt < new Date()) return { ok: false, message: "This code has expired. Ask for a new one." };
    if (entry.attempts >= MAX_ATTEMPTS) return { ok: false, message: "Too many wrong attempts. Ask for a new code." };

    const given = Buffer.from(hashCode(String(code || "").trim()));
    const expected = Buffer.from(entry.hash);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        entry.attempts += 1;
        const left = MAX_ATTEMPTS - entry.attempts;
        return { ok: false, message: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Ask for a new code." };
    }
    user[field] = null;
    return { ok: true };
}
