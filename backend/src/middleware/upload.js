import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import ApiError from "../utils/ApiError.js";
import { limitsOf, planError } from "../services/plans.js";

// backend/uploads, no matter which folder the server is started from.
export const UPLOAD_ROOT = fileURLToPath(new URL("../../uploads", import.meta.url));

function diskStorage(folder) {
    const dir = path.join(UPLOAD_ROOT, folder);
    fs.mkdirSync(dir, { recursive: true });

    return multer.diskStorage({
        destination: dir,
        // Random name on disk so users can't overwrite each other's files or guess paths.
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
        }
    });
}

function allowTypes(allowed, message) {
    return (_req, file, cb) => {
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new ApiError(400, message));
    };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const DOCUMENT_TYPES = [
    ...IMAGE_TYPES,
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
];

// Profile pictures: images only, max 2 MB, form field "avatar".
export const uploadAvatar = multer({
    storage: diskStorage("avatars"),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: allowTypes(IMAGE_TYPES, "Profile picture must be a PNG, JPG, WEBP or GIF image.")
}).single("avatar");

// Project files and task submissions: documents, images, zips. Form field "file".
// The size limit depends on the organization's plan (10 MB on Starter), so Multer is set up per request.
const fileStorage = diskStorage("files");
const fileFilter = allowTypes(DOCUMENT_TYPES, "This file type is not allowed. Upload a PDF, Office document, image, text, CSV or ZIP file.");

export function uploadFile(req, res, next) {
    const maxFileBytes = limitsOf(req.org).maxFileBytes;
    multer({ storage: fileStorage, limits: { fileSize: maxFileBytes }, fileFilter }).single("file")(req, res, (error) => {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return next(planError(req.org, "maxFileBytes", maxFileBytes));
        next(error);
    });
}
