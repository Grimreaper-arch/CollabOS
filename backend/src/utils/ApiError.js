// An error that carries an HTTP status code, handled by middleware/error.js.
// `code` is an optional machine-readable reason the frontend can react to (e.g. "EMAIL_NOT_VERIFIED").
export default class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
