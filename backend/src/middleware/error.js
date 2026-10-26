import multer from "multer";

export function notFound(req, _res, next) {
    const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    error.status = 404;
    next(error);
}

// Turns every thrown error into a consistent JSON response: { message }.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
    let status = err.status || 500;
    let message = err.message || "Something went wrong.";

    if (err.name === "ValidationError") {
        status = 400;
        message = Object.values(err.errors).map((e) => e.message).join(" ");
    } else if (err.name === "CastError") {
        status = 400;
        message = `Invalid ${err.path}.`;
    } else if (err.code === 11000) {
        status = 409;
        message = `That ${Object.keys(err.keyValue || {})[0] || "value"} is already in use.`;
    } else if (err instanceof multer.MulterError) {
        status = 400;
        message = err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message;
    }

    if (status === 500) console.error(err);
    res.status(status).json({ message });
}
