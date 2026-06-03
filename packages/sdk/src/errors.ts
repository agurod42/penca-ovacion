/** Base class for every error thrown by the SDK. */
export class PencaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PencaError';
  }
}

/** Thrown when the request fails because of authentication/authorization. */
export class PencaAuthError extends PencaError {
  constructor(
    message = 'Not authenticated. Run `penca login` first.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PencaAuthError';
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
