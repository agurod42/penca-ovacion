/** Base class for every error thrown by the SDK. */
export class PencaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PencaError';
  }
}

/**
 * Why an authentication/authorization failure happened, so each surface (CLI,
 * MCP, app) can render its own actionable guidance instead of a shared,
 * surface-specific message baked into the SDK.
 *
 * - `NO_TOKEN`        — no credentials were available at all (never signed in).
 * - `SESSION_INVALID` — a token was present but the server rejected it and it
 *                       could not be refreshed (expired/revoked session).
 * - `FORBIDDEN`       — authenticated, but not allowed to access the resource.
 * - `UNKNOWN`         — auth failure with no further classification.
 */
export type AuthErrorCode = 'NO_TOKEN' | 'SESSION_INVALID' | 'FORBIDDEN' | 'UNKNOWN';

/** Thrown when the request fails because of authentication/authorization. */
export class PencaAuthError extends PencaError {
  /** Machine-readable cause; consumers map this to surface-specific guidance. */
  readonly code: AuthErrorCode;

  constructor(message = 'Not authenticated.', options?: { cause?: unknown; code?: AuthErrorCode }) {
    super(message, { cause: options?.cause });
    this.name = 'PencaAuthError';
    this.code = options?.code ?? 'UNKNOWN';
  }
}

/** Thrown for any non-2xx HTTP response that is not an auth failure. */
export class PencaHttpError extends PencaError {
  readonly status: number;
  readonly body: unknown;
  readonly method: string;
  readonly path: string;

  constructor(params: { status: number; body: unknown; method: string; path: string }) {
    super(PencaHttpError.format(params));
    this.name = 'PencaHttpError';
    this.status = params.status;
    this.body = params.body;
    this.method = params.method;
    this.path = params.path;
  }

  private static format({
    status,
    body,
    method,
    path,
  }: { status: number; body: unknown; method: string; path: string }): string {
    let detail = '';
    if (body && typeof body === 'object' && 'message' in body) {
      const msg = (body as { message: unknown }).message;
      detail = Array.isArray(msg) ? `: ${msg.join(', ')}` : `: ${String(msg)}`;
    }
    return `${method} ${path} failed with HTTP ${status}${detail}`;
  }
}
