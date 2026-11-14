// Checks that an uploaded file really is the type its name and browser claim, by reading its first
// bytes ("magic numbers"). A renamed program (virus.exe → notes.pdf) fails this check.
import fs from "node:fs/promises";

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);

const ZIP = [0x50, 0x4b]; // "PK": .zip and the modern Office formats (.docx, .xlsx, .pptx)
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // old Office (.doc, .xls, .ppt)

const SIGNATURES = {
    "application/pdf": (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
    "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]),
    "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    "image/gif": (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]), // GIF8
    "image/webp": (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8), // RIFF....WEBP
    "application/zip": (b) => startsWith(b, ZIP),
    "application/x-zip-compressed": (b) => startsWith(b, ZIP),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) => startsWith(b, ZIP),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b) => startsWith(b, ZIP),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": (b) => startsWith(b, ZIP),
    "application/msword": (b) => startsWith(b, OLE),
    "application/vnd.ms-excel": (b) => startsWith(b, OLE),
    "application/vnd.ms-powerpoint": (b) => startsWith(b, OLE),
    // Text files have no signature; just make sure it isn't binary (no NUL bytes).
    "text/plain": (b) => !b.includes(0),
    "text/csv": (b) => !b.includes(0)
};

// True if the file at `path` matches `mimeType`. Unknown types are rejected.
export async function matchesType(path, mimeType) {
    const check = SIGNATURES[mimeType];
    if (!check) return false;
    const handle = await fs.open(path, "r");
    try {
        const buffer = Buffer.alloc(512);
        const { bytesRead } = await handle.read(buffer, 0, 512, 0);
        return bytesRead === 0 ? mimeType.startsWith("text/") : check(buffer.subarray(0, bytesRead));
    } finally {
        await handle.close();
    }
}
