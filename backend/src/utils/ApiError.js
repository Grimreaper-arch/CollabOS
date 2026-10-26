// An error that carries an HTTP status code, handled by middleware/error.js.
export default class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
