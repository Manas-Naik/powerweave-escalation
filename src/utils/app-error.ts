/**
 * @file app-error.ts
 * @description Structured application error class.
 *
 * Used throughout the application to produce consistent error responses.
 * The global error handler middleware serialises these into the standard
 * API error envelope: { error: { code, message, details } }
 */

export class AppError extends Error {
  /** HTTP status code */
  readonly statusCode: number;
  /** Machine-readable error identifier */
  readonly code: string;
  /** Optional structured details (e.g. validation field errors) */
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Maintains proper prototype chain in TypeScript
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
