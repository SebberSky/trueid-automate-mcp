export class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, status, details = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function notFound(message, details) {
  return new AppError("not_found", message, 404, details);
}

export function conflict(message, details) {
  return new AppError("conflict", message, 409, details);
}

export function unsupported(action, platform) {
  return new AppError(
    "unsupported",
    `Action "${action}" is unsupported on platform "${platform}".`,
    422,
    { action, platform },
  );
}

export function invalid(message, details, status = 400) {
  return new AppError("invalid_request", message, status, details);
}

export function assertionFailed(message, details) {
  return new AppError("assertion_failed", message, 422, details);
}

export function staleRef(ref, revision) {
  return new AppError(
    "stale_ref",
    `Element ref "${ref}" is stale for current screen revision.`,
    409,
    { ref, revision },
  );
}
