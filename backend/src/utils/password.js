// Password rules, checked on sign-up, password reset and password change.
import ApiError from "./ApiError.js";

const COMMON = new Set([
    "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwerty123", "qwertyuiop",
    "iloveyou", "11111111", "abc12345", "admin123", "welcome1", "letmein1", "collabos", "collabos123"
]);

export function assertStrongPassword(password, { email = "", fullName = "" } = {}) {
    const value = String(password || "");
    const lower = value.toLowerCase();
    if (value.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");
    if (value.length > 128) throw new ApiError(400, "Password must be at most 128 characters.");
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new ApiError(400, "Password must contain at least one letter and one number.");
    if (COMMON.has(lower)) throw new ApiError(400, "That password is too common. Choose something harder to guess.");

    const emailName = String(email).toLowerCase().split("@")[0];
    const firstName = String(fullName).toLowerCase().split(" ")[0];
    if ((emailName.length >= 4 && lower.includes(emailName)) || (firstName.length >= 4 && lower.includes(firstName))) {
        throw new ApiError(400, "Password shouldn't contain your name or email.");
    }
}
