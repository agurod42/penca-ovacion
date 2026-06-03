import { PencaAuthError } from './errors.js';
import { type AuthHook, Http, type RequestOptions } from './http.js';
import { Articles, Home, Polls, Users } from './resources/content.js';
import { Groups } from './resources/groups.js';
import { Matches } from './resources/matches.js';
import { Tournaments } from './resources/tournaments.js';
import { Wall } from './resources/wall.js';
import { type TokenStore, defaultTokenStore } from './token-store.js';
import type { CurrentUser, Tokens } from './types.js';

export const DEFAULT_BASE_URL = 'https://api-penca-ovacion.futbolx.uy';
export const DEFAULT_APP_VERSION = '43.2606.53';
export const DEFAULT_APP_BUILD = '202606011558';
export const DEFAULT_USER_AGENT = `PencaOvacion/${DEFAULT_APP_BUILD} CFNetwork/3860.100.1 Darwin/25.0.0`;

export interface PencaClientOptions {
  /** API base URL. Defaults to the production host. */
  baseUrl?: string;
  /** Token persistence backend. Defaults to OS keychain (file fallback). */
  tokens?: TokenStore;
  /** Custom fetch implementation (for tests). Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Client platform header value. Defaults to `ios`. */
  platform?: string;
  appVersion?: string;
  appBuild?: string;
  userAgent?: string;
  /** `accept-language` header. Defaults to `en`. */
  acceptLanguage?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  /** Auth provider. Defaults to `email`. */
  provider?: string;
}

export interface LoginResult {
  tokens: Tokens;
  user?: CurrentUser;
}

/**
 * Pull access/refresh tokens out of a login or refresh response. The observed
 * shape is `{ token, accessToken, refreshToken, user }`; we still tolerate the
 * common field-name variants for robustness.
 */
export function extractTokens(body: unknown): Tokens | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const scope = (root.data ?? root.tokens ?? root) as Record<string, unknown>;
  const access =
    scope.accessToken ??
    scope.token ??
    scope.access_token ??
    scope.jwt ??
    root.accessToken ??
    root.token;
  if (typeof access !== 'string' || access.length === 0) return null;
  const refresh =
    scope.refreshToken ?? scope.refresh_token ?? root.refreshToken ?? root.refresh_token;
  return typeof refresh === 'string'
    ? { accessToken: access, refreshToken: refresh }
    : { accessToken: access };
}

/**
 * Accept either a raw magic-link token or the full link URL (from the email)
 * and return the one-time token. Looks for a `token`/`code` query param, then a
 * long hex segment, otherwise returns the trimmed input as-is.
 */
export function extractMagicToken(input: string): string {
  const value = input.trim();
  try {
    const url = new URL(value);
    const param = url.searchParams.get('token') ?? url.searchParams.get('code');
    if (param) return param;
    const fragment = url.hash.match(/(?:token|code)=([^&]+)/);
    if (fragment?.[1]) return decodeURIComponent(fragment[1]);
  } catch {
    // not a URL
  }
  const hex = value.match(/\b[0-9a-fA-F]{64,}\b/);
  if (hex) return hex[0];
  return value;
}

function extractUser(body: unknown): CurrentUser | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const root = body as Record<string, unknown>;
  const user = root.user ?? (root.data as Record<string, unknown> | undefined)?.user;
  return user && typeof user === 'object' ? (user as CurrentUser) : undefined;
}

export class PencaClient implements AuthHook {
  readonly http: Http;
  readonly store: TokenStore;

  readonly tournaments: Tournaments;
  readonly matches: Matches;
  readonly groups: Groups;
  readonly wall: Wall;
  readonly polls: Polls;
  readonly articles: Articles;
  readonly users: Users;
  readonly home: Home;

  private cached: Tokens | null = null;
  private loaded = false;
  private refreshing: Promise<boolean> | null = null;

  constructor(options: PencaClientOptions = {}) {
    this.store = options.tokens ?? defaultTokenStore();
    const platform = options.platform ?? 'ios';
    this.http = new Http({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetch: options.fetch ?? globalThis.fetch,
      auth: this,
      defaultHeaders: {
        'x-client-platform': platform,
        'x-app-version': options.appVersion ?? DEFAULT_APP_VERSION,
        'x-app-build': options.appBuild ?? DEFAULT_APP_BUILD,
        'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
        'accept-language': options.acceptLanguage ?? 'en',
      },
    });

    this.tournaments = new Tournaments(this.http);
    this.matches = new Matches(this.http);
    this.groups = new Groups(this.http);
    this.wall = new Wall(this.http);
    this.polls = new Polls(this.http);
    this.articles = new Articles(this.http);
    this.users = new Users(this.http);
    this.home = new Home(this.http);
  }

  // ---- AuthHook -----------------------------------------------------------

  async getAccessToken(): Promise<string | null> {
    if (!this.loaded) {
      this.cached = await this.store.load();
      this.loaded = true;
    }
    return this.cached?.accessToken ?? null;
  }

  async refresh(): Promise<boolean> {
    // Collapse concurrent refreshes into one in-flight request.
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    if (!this.loaded) {
      this.cached = await this.store.load();
      this.loaded = true;
    }
    const refreshToken = this.cached?.refreshToken;
    if (!refreshToken) return false;
    try {
      const body = await this.http.request<unknown>('/api/v1/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refreshToken },
      });
      const tokens = extractTokens(body);
      if (!tokens) return false;
      // Preserve the old refresh token if the response omitted one.
      const merged: Tokens = tokens.refreshToken ? tokens : { ...tokens, refreshToken };
      await this.setTokens(merged);
      return true;
    } catch {
      return false;
    }
  }

  // ---- Auth API -----------------------------------------------------------

  /**
   * Request a passwordless magic link to be emailed. This is the primary email
   * sign-in method. The emailed link contains a one-time `token` to pass to
   * {@link magicLogin}.
   */
  sendMagicLink(email: string): Promise<{ sent: boolean; userExists: boolean }> {
    return this.http.request<{ sent: boolean; userExists: boolean }>(
      '/api/v1/auth/send-magic-link',
      {
        method: 'POST',
        auth: false,
        body: { email },
      },
    );
  }

  /**
   * Complete a passwordless sign-in with the one-time token from a magic link
   * (or the full link URL — the token is extracted automatically). Persists the
   * resulting tokens.
   */
  async magicLogin(tokenOrLink: string): Promise<LoginResult> {
    const token = extractMagicToken(tokenOrLink);
    const body = await this.http.request<unknown>('/api/v1/auth/magic-login', {
      method: 'POST',
      auth: false,
      body: { token },
    });
    return this.persistLogin(body);
  }

  /** Authenticate with email + password and persist the resulting tokens. */
  async login(input: LoginInput): Promise<LoginResult> {
    const body = await this.http.request<unknown>('/api/v1/auth/login', {
      method: 'POST',
      auth: false,
      body: { provider: input.provider ?? 'email', email: input.email, password: input.password },
    });
    return this.persistLogin(body);
  }

  /**
   * Authenticate with a third-party identity provider (e.g. `apple`, `google`,
   * `facebook`), passing the provider's identity/OAuth token. `fullName` is used
   * on first-time signup. Persists the resulting tokens.
   */
  async loginWithProvider(input: {
    provider: string;
    token: string;
    fullName?: string;
  }): Promise<LoginResult> {
    const body = await this.http.request<unknown>('/api/v1/auth/login', {
      method: 'POST',
      auth: false,
      body: { provider: input.provider, token: input.token, fullName: input.fullName },
    });
    return this.persistLogin(body);
  }

  private async persistLogin(body: unknown): Promise<LoginResult> {
    const tokens = extractTokens(body);
    if (!tokens) {
      throw new PencaAuthError('Login succeeded but no access token was found in the response.', {
        cause: body,
      });
    }
    await this.setTokens(tokens);
    return { tokens, user: extractUser(body) };
  }

  /** Update the authenticated account's profile. Returns the updated account. */
  updateProfile(input: {
    fullName?: string;
    nickname?: string;
    country?: string;
  }): Promise<CurrentUser> {
    return this.http.request<CurrentUser>('/api/v1/auth/profile', { method: 'PUT', body: input });
  }

  /** Fetch the authenticated account. */
  me(): Promise<CurrentUser> {
    return this.http.request<CurrentUser>('/api/v1/auth/me');
  }

  /** Revoke the session server-side (best effort) and clear local tokens. */
  async logout(): Promise<void> {
    try {
      await this.http.request<unknown>('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Ignore server-side failures; always clear locally.
    }
    await this.clearTokens();
  }

  /** Whether an access token is currently available. */
  async isAuthenticated(): Promise<boolean> {
    return (await this.getAccessToken()) !== null;
  }

  /** Manually set and persist tokens (e.g. pasted from another source). */
  async setTokens(tokens: Tokens): Promise<void> {
    this.cached = tokens;
    this.loaded = true;
    await this.store.save(tokens);
  }

  /** Clear cached and persisted tokens. */
  async clearTokens(): Promise<void> {
    this.cached = null;
    this.loaded = true;
    await this.store.clear();
  }

  // ---- Escape hatch -------------------------------------------------------

  /** Make an arbitrary authenticated request (for endpoints not yet modeled). */
  request<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.http.request<T>(path, options);
  }
}
