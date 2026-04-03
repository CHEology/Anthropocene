export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class InvariantError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(500, 'simulation_invariant', message, details);
    this.name = 'InvariantError';
  }
}
