import { describe, expect, it } from 'vitest';
import { MemoryTokenStore, PencaAuthError, PencaClient, PencaHttpError } from '../src/index.js';
import * as fx from './fixtures.js';
import { mockFetch } from './mock-fetch.js';

function client(
  queue: Parameters<typeof mockFetch>[0],
  tokens = new MemoryTokenStore({ accessToken: fx.fakeJwt }),
) {
  const { fetch, requests } = mockFetch(queue);
  const c = new PencaClient({ fetch, tokens, baseUrl: 'https://api.example.test' });
  return { c, requests };
}

describe('header injection', () => {
  it('attaches bearer token and app headers', async () => {
    const { c, requests } = client([{ json: fx.tournaments }]);
    await c.tournaments.list();
    const req = requests[0]!;
    expect(req.url).toBe('https://api.example.test/api/v1/tournaments');
    expect(req.headers.authorization).toBe(`Bearer ${fx.fakeJwt}`);
    expect(req.headers['x-client-platform']).toBe('ios');
    expect(req.headers['x-app-version']).toBe('43.2606.53');
    expect(req.headers['user-agent']).toContain('PencaOvacion/');
  });
});

describe('reads', () => {
  it('lists tournaments', async () => {
    const { c } = client([{ json: fx.tournaments }]);
    const res = await c.tournaments.list();
    expect(res).toHaveLength(2);
    expect(res[0]!.name).toBe('Mundial 2026');
  });

  it('builds match query params', async () => {
    const { c, requests } = client([{ json: fx.matchesPage }]);
    await c.tournaments.matches('T1', { view: 'upcoming', page: 2, limit: 8, groupId: 'G1' });
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe('/api/v1/tournaments/T1/matches');
    expect(url.searchParams.get('view')).toBe('upcoming');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('8');
    expect(url.searchParams.get('groupId')).toBe('G1');
  });

  it('unwraps match events', async () => {
    const { c } = client([{ json: { events: [] } }]);
    expect(await c.matches.events('M1')).toEqual([]);
  });
});

describe('writes', () => {
  it('sends prediction body', async () => {
    const { c, requests } = client([{ status: 201, json: { success: true } }]);
    const res = await c.matches.predict('M1', { homeScore: 1, awayScore: 1 });
    expect(res.success).toBe(true);
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.body).toEqual({ homeScore: 1, awayScore: 1 });
  });

  it('joins a group by code', async () => {
    const { c, requests } = client([{ status: 201, json: fx.groupsMine[0] }]);
    await c.groups.join('TEST1');
    expect(requests[0]!.url).toMatch(/\/api\/v1\/groups\/join$/);
    expect(requests[0]!.body).toEqual({ code: 'TEST1' });
  });

  it('posts to the wall', async () => {
    const { c, requests } = client([{ status: 201, json: fx.wallPosts.data[0] }]);
    await c.wall.post({ content: 'Hola', groupId: 'G1' });
    expect(requests[0]!.body).toEqual({ content: 'Hola', groupId: 'G1' });
  });
});

describe('error mapping', () => {
  it('throws PencaHttpError on 400', async () => {
    const { c } = client([
      { status: 400, json: { message: ['bad'], error: 'Bad Request', statusCode: 400 } },
    ]);
    await expect(c.tournaments.list()).rejects.toBeInstanceOf(PencaHttpError);
  });

  it('throws PencaAuthError on 401 without refresh token', async () => {
    const { c } = client([{ status: 401, json: { message: 'Unauthorized' } }]);
    await expect(c.tournaments.list()).rejects.toBeInstanceOf(PencaAuthError);
  });

  it('codes a 401 with no stored token as NO_TOKEN', async () => {
    const { c } = client([{ status: 401, json: {} }], new MemoryTokenStore());
    await expect(c.tournaments.list()).rejects.toMatchObject({ code: 'NO_TOKEN' });
  });

  it('codes a 401 with a stored token as SESSION_INVALID', async () => {
    const { c } = client([{ status: 401, json: {} }]);
    await expect(c.tournaments.list()).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('codes a 403 as FORBIDDEN', async () => {
    const { c } = client([{ status: 403, json: {} }]);
    await expect(c.tournaments.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('sessionStatus', () => {
  it('reports an authenticated, non-expiring session from the JWT', async () => {
    const { c } = client([]);
    const status = await c.sessionStatus();
    expect(status.authenticated).toBe(true);
    expect(status.needsRefresh).toBe(false);
    expect(status.expiresAt?.getUTCFullYear()).toBe(2098);
  });

  it('reports an unauthenticated session when no token is stored', async () => {
    const { c } = client([], new MemoryTokenStore());
    const status = await c.sessionStatus();
    expect(status).toMatchObject({
      authenticated: false,
      expiresAt: null,
      needsRefresh: true,
      canRefresh: false,
    });
  });

  it('flags needsRefresh when within the skew window', async () => {
    const { c } = client([]);
    // fakeJwt expires in 2099; a skew larger than that window forces needsRefresh.
    const status = await c.sessionStatus(10 ** 12);
    expect(status.needsRefresh).toBe(true);
  });
});

describe('refresh flow', () => {
  it('refreshes once on 401 then retries', async () => {
    const tokens = new MemoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    const { fetch, requests } = mockFetch([
      { status: 401, json: { message: 'expired' } }, // first protected call fails
      { status: 200, json: { accessToken: 'new', refreshToken: 'r2' } }, // refresh
      { status: 200, json: fx.tournaments }, // retry succeeds
    ]);
    const c = new PencaClient({ fetch, tokens, baseUrl: 'https://api.example.test' });
    const res = await c.tournaments.list();
    expect(res).toHaveLength(2);
    expect(requests[1]!.url).toMatch(/\/auth\/refresh$/);
    expect(requests[1]!.body).toEqual({ refreshToken: 'r1' });
    expect(requests[2]!.headers.authorization).toBe('Bearer new');
    expect(await tokens.load()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
  });
});

describe('auth', () => {
  it('login posts provider/email/password and persists tokens', async () => {
    const tokens = new MemoryTokenStore();
    const { fetch, requests } = mockFetch([
      { status: 201, json: { accessToken: 'a', refreshToken: 'b' } },
    ]);
    const c = new PencaClient({ fetch, tokens, baseUrl: 'https://api.example.test' });
    const res = await c.login({ email: 'test@example.test', password: 'secret' });
    expect(requests[0]!.body).toEqual({
      provider: 'email',
      email: 'test@example.test',
      password: 'secret',
    });
    expect(res.tokens).toEqual({ accessToken: 'a', refreshToken: 'b' });
    expect(await tokens.load()).toEqual({ accessToken: 'a', refreshToken: 'b' });
  });

  it('sends a magic link', async () => {
    const { fetch, requests } = mockFetch([
      { status: 201, json: { sent: true, userExists: true } },
    ]);
    const c = new PencaClient({
      fetch,
      tokens: new MemoryTokenStore(),
      baseUrl: 'https://api.example.test',
    });
    const res = await c.sendMagicLink('test@example.test');
    expect(requests[0]!.url).toMatch(/\/auth\/send-magic-link$/);
    expect(requests[0]!.body).toEqual({ email: 'test@example.test' });
    expect(res).toEqual({ sent: true, userExists: true });
  });

  it('magicLogin extracts the token from a link and persists tokens', async () => {
    const hex = 'b'.repeat(128);
    const tokens = new MemoryTokenStore();
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        json: { token: 'a', accessToken: 'a', refreshToken: 'r', user: { nickname: 'me' } },
      },
    ]);
    const c = new PencaClient({ fetch, tokens, baseUrl: 'https://api.example.test' });
    const res = await c.magicLogin(`https://penca.example/magic?token=${hex}`);
    expect(requests[0]!.url).toMatch(/\/auth\/magic-login$/);
    expect(requests[0]!.body).toEqual({ token: hex });
    expect(res.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(res.user?.nickname).toBe('me');
    expect(await tokens.load()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('logout clears tokens even if server call fails', async () => {
    const tokens = new MemoryTokenStore({ accessToken: fx.fakeJwt });
    const { fetch } = mockFetch([{ status: 500, text: 'boom' }]);
    const c = new PencaClient({ fetch, tokens, baseUrl: 'https://api.example.test' });
    await c.logout();
    expect(await tokens.load()).toBeNull();
  });
});
