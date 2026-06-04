import { createHash, randomBytes } from 'node:crypto';
import { MemoryTokenStore, PencaClient } from 'penca-ovacion-sdk';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ClientStore } from '../src/oauth/clients.js';
import { resolveOAuthConfig } from '../src/oauth/config.js';
import { handleOAuth } from '../src/oauth/router.js';
import { AuthCodeStore, PendingLoginStore, SessionStore } from '../src/oauth/store.js';
import { verifyAccessToken } from '../src/oauth/tokens.js';
import type { OAuthDeps, OAuthResult } from '../src/oauth/types.js';
import { plainCodec } from '../src/token-store.js';

const PUBLIC_URL = 'https://penca-ovacion.1930.dev';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const JWT_SECRET = 'test-secret';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

const fakeUser = {
  id: 'user-42',
  email: 'persona@example.test',
  nickname: 'tester',
  fullName: 'Persona Prueba',
  country: 'UY',
  roles: [],
  capabilities: [],
  authProviders: ['email'],
  createdAt: '',
  verifiedType: '',
};

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/v1/auth/send-magic-link')) {
      return jsonResponse({ sent: true, userExists: true });
    }
    if (url.endsWith('/api/v1/auth/magic-login')) {
      return jsonResponse({
        accessToken: 'penca-access',
        refreshToken: 'penca-refresh',
        user: fakeUser,
      });
    }
    if (url.endsWith('/api/v1/auth/me')) return jsonResponse(fakeUser);
    return jsonResponse({});
  }) as typeof fetch;
}

function makeDeps(): OAuthDeps {
  const db = openDb(':memory:');
  return {
    config: resolveOAuthConfig({ MCP_PUBLIC_URL: PUBLIC_URL } as NodeJS.ProcessEnv),
    clients: new ClientStore(db),
    codes: new AuthCodeStore(db),
    sessions: new SessionStore(db),
    pending: new PendingLoginStore(db),
    db,
    codec: plainCodec,
    jwtSecret: JWT_SECRET,
    accessTtlSec: 3600,
    createPencaClient: () =>
      new PencaClient({
        fetch: fakeFetch(),
        tokens: new MemoryTokenStore(),
        baseUrl: 'https://api.example.test',
      }),
  };
}

function call(
  deps: OAuthDeps,
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: string } = {},
): Promise<OAuthResult | null> {
  const url = new URL(`${PUBLIC_URL}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  return handleOAuth(method, url, opts.body, deps);
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

async function registerClient(deps: OAuthDeps): Promise<string> {
  const r = await call(deps, 'POST', '/oauth/register', {
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'Claude' }),
  });
  return (r?.body as { client_id: string }).client_id;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const loginIdFrom = (html: string) => /name="login_id" value="([^"]+)"/.exec(html)?.[1] ?? '';
const codeFrom = (location: string) => new URL(location).searchParams.get('code') ?? '';

describe('discovery + registration', () => {
  it('serves protected resource and authorization server metadata', async () => {
    const deps = makeDeps();
    const prm = await call(deps, 'GET', '/.well-known/oauth-protected-resource');
    expect(prm?.body).toMatchObject({ resource: `${PUBLIC_URL}/mcp` });
    const asm = await call(deps, 'GET', '/.well-known/oauth-authorization-server');
    expect(asm?.body).toMatchObject({ code_challenge_methods_supported: ['S256'] });
  });

  it('registers a public client', async () => {
    expect(await registerClient(makeDeps())).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects bad redirect_uris and falls through on non-oauth routes', async () => {
    const deps = makeDeps();
    expect((await call(deps, 'POST', '/oauth/register', { body: '{}' }))?.status).toBe(400);
    expect(await call(deps, 'POST', '/mcp', { body: '{}' })).toBeNull();
  });
});

describe('authorization code flow with PKCE', () => {
  async function fullFlow(deps: OAuthDeps, clientId: string, challenge: string) {
    const start = await call(deps, 'GET', '/oauth/authorize', {
      query: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
      },
    });
    expect(start?.status).toBe(200);
    const loginId = loginIdFrom(start?.body as string);
    expect(loginId).not.toBe('');

    const email = await call(deps, 'POST', '/oauth/authorize/email', {
      body: form({ login_id: loginId, email: 'persona@example.test' }),
    });
    expect(email?.status).toBe(200);

    const complete = await call(deps, 'POST', '/oauth/authorize/complete', {
      body: form({ login_id: loginId, token: 'https://penca/magic?token=abc' }),
    });
    expect(complete?.status).toBe(302);
    const location = complete?.headers?.location ?? '';
    expect(new URL(location).searchParams.get('state')).toBe('xyz');
    return codeFrom(location);
  }

  it('exchanges code + verifier for an audience-bound access token and refresh token', async () => {
    const deps = makeDeps();
    const clientId = await registerClient(deps);
    const { verifier, challenge } = pkce();
    const code = await fullFlow(deps, clientId, challenge);

    const tok = await call(deps, 'POST', '/oauth/token', {
      body: form({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
      }),
    });
    expect(tok?.status).toBe(200);
    const body = tok?.body as { access_token: string; refresh_token: string; token_type: string };
    expect(body.token_type).toBe('Bearer');

    const claims = verifyAccessToken(body.access_token, JWT_SECRET, {
      audience: `${PUBLIC_URL}/mcp`,
    });
    expect(claims?.sub).toBe('user-42');

    // persisted the Penca identity for that subject
    const id = deps.db
      .prepare('SELECT email FROM penca_identities WHERE subject = ?')
      .get('user-42') as { email: string } | undefined;
    expect(id?.email).toBe('persona@example.test');

    // refresh grant returns a fresh access token
    const refreshed = await call(deps, 'POST', '/oauth/token', {
      body: form({ grant_type: 'refresh_token', refresh_token: body.refresh_token }),
    });
    expect((refreshed?.body as { access_token?: string }).access_token).toBeTruthy();
  });

  it('rejects a wrong PKCE verifier', async () => {
    const deps = makeDeps();
    const clientId = await registerClient(deps);
    const { challenge } = pkce();
    const code = await fullFlow(deps, clientId, challenge);
    const tok = await call(deps, 'POST', '/oauth/token', {
      body: form({
        grant_type: 'authorization_code',
        code,
        code_verifier: 'wrong-verifier',
        client_id: clientId,
      }),
    });
    expect(tok?.status).toBe(400);
    expect((tok?.body as { error: string }).error).toBe('invalid_grant');
  });

  it('treats an authorization code as single-use', async () => {
    const deps = makeDeps();
    const clientId = await registerClient(deps);
    const { verifier, challenge } = pkce();
    const code = await fullFlow(deps, clientId, challenge);
    const exchange = () =>
      call(deps, 'POST', '/oauth/token', {
        body: form({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: clientId,
        }),
      });
    expect((await exchange())?.status).toBe(200);
    expect((await exchange())?.status).toBe(400); // reused
  });

  it('renders an error page for an unknown client', async () => {
    const deps = makeDeps();
    const start = await call(deps, 'GET', '/oauth/authorize', {
      query: { response_type: 'code', client_id: 'nope', redirect_uri: REDIRECT_URI },
    });
    expect(start?.status).toBe(400);
    expect(String(start?.body)).toContain('Cliente OAuth desconocido');
  });

  it('redirects back with an error when PKCE is missing', async () => {
    const deps = makeDeps();
    const clientId = await registerClient(deps);
    const start = await call(deps, 'GET', '/oauth/authorize', {
      query: { response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, state: 's' },
    });
    expect(start?.status).toBe(302);
    const loc = new URL(start?.headers?.location ?? '');
    expect(loc.searchParams.get('error')).toBe('invalid_request');
    expect(loc.searchParams.get('state')).toBe('s');
  });

  it('revokes a refresh token so it can no longer be exchanged', async () => {
    const deps = makeDeps();
    const clientId = await registerClient(deps);
    const { verifier, challenge } = pkce();
    const code = await fullFlow(deps, clientId, challenge);
    const tok = await call(deps, 'POST', '/oauth/token', {
      body: form({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: clientId,
      }),
    });
    const refreshToken = (tok?.body as { refresh_token: string }).refresh_token;

    const revoke = await call(deps, 'POST', '/oauth/revoke', {
      body: form({ token: refreshToken }),
    });
    expect(revoke?.status).toBe(200); // RFC 7009: always 200

    const after = await call(deps, 'POST', '/oauth/token', {
      body: form({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    expect(after?.status).toBe(400);
  });
});
