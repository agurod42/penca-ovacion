import { PencaAuthError, PencaError, PencaHttpError } from './errors.js';

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Whether to attach the bearer token. Default `true`. */
  auth?: boolean;
  headers?: Record<string, string>;
}

export type FetchLike = typeof fetch;

/** Hooks the HTTP layer uses to read and refresh credentials. */
export interface AuthHook {
  /** Return the current access token, or null if unauthenticated. */
  getAccessToken(): Promise<string | null>;
  /** Attempt to refresh the access token. Resolves true if a new token is available. */
  refresh(): Promise<boolean>;
}

export interface HttpConfig {
  baseUrl: string;
  fetch: FetchLike;
  auth: AuthHook;
  /** Static headers sent on every request (platform, app version, user-agent, ...). */
  defaultHeaders: Record<string, string>;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export class Http {
  constructor(private config: HttpConfig) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth !== false;
    const send = (token: string | null): Promise<Response> => {
      const headers: Record<string, string> = {
        accept: '*/*',
        ...this.config.defaultHeaders,
        ...options.headers,
      };
      let body: string | undefined;
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
      if (token) headers.authorization = `Bearer ${token}`;
      const url = buildUrl(this.config.baseUrl, path, options.query);
      return this.config.fetch(url, { method: options.method ?? 'GET', headers, body });
    };

    let token = useAuth ? await this.config.auth.getAccessToken() : null;
    if (useAuth && !token) {
      // Try a refresh in case only a refresh token is present.
      if (await this.config.auth.refresh()) token = await this.config.auth.getAccessToken();
    }

    let res: Response;
    try {
      res = await send(token);
    } catch (cause) {
      throw new PencaError(`Network request failed: ${path}`, { cause });
    }

    // One-shot refresh-and-retry on 401.
    if (res.status === 401 && useAuth && (await this.config.auth.refresh())) {
      const refreshed = await this.config.auth.getAccessToken();
      try {
        res = await send(refreshed);
      } catch (cause) {
        throw new PencaError(`Network request failed: ${path}`, { cause });
      }
    }

    if (res.ok) return (await parseBody(res)) as T;

    const body = await parseBody(res);
    if (res.status === 401 || res.status === 403) {
      throw new PencaAuthError(authMessage(body), { cause: body });
    }
    throw new PencaHttpError({ status: res.status, body, method: options.method ?? 'GET', path });
  }
}

function authMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  }
  return 'Not authenticated. Run `penca login` first.';
}
