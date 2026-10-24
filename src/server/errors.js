/**
 * A failure the browser can act on. Messages are user-facing; diagnostics stay
 * in `details` and are never rendered as the primary error.
 */
export class BridgeError extends Error {
  /**
   * @param {string} code stable machine-readable code
   * @param {string} message user-facing sentence
   * @param {{status?: number, details?: unknown}} [options]
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

/** A failure from the Backlog.md HTTP server, retaining its status. */
export class BacklogApiError extends Error {
  /**
   * @param {string} message user-facing server message
   * @param {{status?: number, code?: string, details?: unknown}} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'BacklogApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

/** Normalize any thrown value into a short, safe sentence. */
export function errorMessage(error, fallback = 'The request failed.') {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}
