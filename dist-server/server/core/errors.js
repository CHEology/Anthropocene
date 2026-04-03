export class ApiError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
export class InvariantError extends ApiError {
    constructor(message, details) {
        super(500, 'simulation_invariant', message, details);
        this.name = 'InvariantError';
    }
}
