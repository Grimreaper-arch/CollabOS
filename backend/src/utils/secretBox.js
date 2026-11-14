// Encrypts secrets we must store (Google refresh tokens) with AES-256-GCM, so a database leak
// doesn't hand out access to people's Google Calendars. The key comes from TOKEN_ENCRYPTION_KEY
// (or JWT_SECRET if that isn't set).
import crypto from "node:crypto";

const key = () => crypto.createHash("sha256").update(process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET).digest();

export function seal(text) {
    if (!text) return "";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
    const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function open(sealed) {
    if (!sealed) return "";
    const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
