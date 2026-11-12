/**
 * Domain errors. Services throw these; the action/route layer maps them to
 * user-facing messages and HTTP statuses in one place (src/server/http/errors.ts).
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RULE"
  | "RATE_LIMITED";

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super("VALIDATION", message, fieldErrors);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "Please sign in to continue.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to do this.") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} was not found.`);
  }
}

/** The same thing already exists (duplicate payment, duplicate grant, ...). */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

/** Too many attempts in a short time (sign-in, public submissions). */
export class RateLimitedError extends DomainError {
  constructor(message: string) {
    super("RATE_LIMITED", message);
  }
}

/** A business rule was broken (overpayment, link closed, last super admin, ...). */
export class RuleError extends DomainError {
  constructor(message: string) {
    super("RULE", message);
  }
}
