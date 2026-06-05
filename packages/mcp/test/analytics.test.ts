import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as analytics from '../src/analytics.js';

describe('analytics (OpenPanel port)', () => {
  it('is off by default and track is a no-op without creds', () => {
    // No OPENPANEL_CLIENT_ID/SECRET in the test env → disabled.
    expect(analytics.isEnabled()).toBe(false);
    expect(analytics.stats().enabled).toBe(false);
    // Must never throw, even with no event loop work scheduled.
    expect(() => analytics.track('mcp_tool_called', { tool: 'x' })).not.toThrow();
    expect(() => analytics.trackTool('penca_whoami', 'ok', 12)).not.toThrow();
    expect(() => analytics.recordJsonRpc({ method: 'initialize' }, {})).not.toThrow();
  });

  it('classifies caller cohorts by origin', () => {
    expect(analytics.classifyClient('https://claude.ai')).toBe('claude.ai');
    expect(analytics.classifyClient('https://chatgpt.com')).toBe('chatgpt.com');
    expect(analytics.classifyClient('https://1930.dev')).toBe('penca');
    expect(analytics.classifyClient('https://example.com')).toBe('other');
    expect(analytics.classifyClient('')).toBe('unknown');
  });

  it('prioritises the MCP clientInfo.name over Origin', () => {
    // Real clients often send no Origin; the client name is the reliable signal.
    expect(analytics.classifyClient('', 'Claude')).toBe('claude.ai');
    expect(analytics.classifyClient('', 'claude-ai')).toBe('claude.ai');
    expect(analytics.classifyClient('', 'ChatGPT')).toBe('chatgpt.com');
    expect(analytics.classifyClient('', 'Cursor')).toBe('cursor');
    expect(analytics.classifyClient('', 'Visual Studio Code')).toBe('vscode');
    // Name wins over a conflicting origin.
    expect(analytics.classifyClient('https://claude.ai', 'Cursor')).toBe('cursor');
    // Unknown but present name → other (not unknown).
    expect(analytics.classifyClient('', 'SomeMcpClient')).toBe('other');
  });

  it('derives a stable 16-hex anonymous device id', () => {
    const a = analytics.deriveDeviceId('https://claude.ai', '1.2.3.4');
    const b = analytics.deriveDeviceId('https://claude.ai', '1.2.3.4');
    const c = analytics.deriveDeviceId('https://claude.ai', '5.6.7.8');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('buckets durations into coarse bands', () => {
    expect(analytics.bucketDuration(50)).toBe('<100');
    expect(analytics.bucketDuration(250)).toBe('<500');
    expect(analytics.bucketDuration(1500)).toBe('<2000');
    expect(analytics.bucketDuration(9000)).toBe('>=2000');
  });
});

describe('analytics identity model', () => {
  const origEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.OPENPANEL_CLIENT_ID = 'cid';
    process.env.OPENPANEL_CLIENT_SECRET = 'csec';
    process.env.OPENPANEL_API_URL = 'https://op.test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...origEnv };
    analytics.init(); // disable again so module state doesn't leak
  });

  // track()/trackFor() are fire-and-forget; give the detached send() time to run.
  const flush = () => new Promise((r) => setTimeout(r, 20));

  // Pair each request's parsed body with the headers it was sent with, so tests
  // can assert per-event attribution (profileId) and the User-Agent override.
  function calls(): Array<{ body: Record<string, any>; headers: Record<string, string> }> {
    return fetchMock.mock.calls.map((c) => {
      const init = c[1] as RequestInit;
      return {
        body: JSON.parse(init.body as string),
        headers: (init.headers ?? {}) as Record<string, string>,
      };
    });
  }
  const envelopes = () => calls().map((c) => c.body);
  const tracks = () => envelopes().filter((e) => e.type === 'track');
  const identifies = () => envelopes().filter((e) => e.type === 'identify');

  it('groups events by the Penca subject when authenticated', async () => {
    analytics.init();
    await analytics.runWithContext(
      {
        origin: 'https://claude.ai',
        clientIp: '1.2.3.4',
        userAgent: '',
        mcpSessionId: '',
        subject: 'user-1',
      },
      async () => analytics.track('mcp_tool_called', { tool: 'x' }),
    );
    await flush();
    const t = tracks();
    expect(t.at(-1)?.payload.profileId).toBe('user-1');
  });

  it('falls back to the anonymous device id without a subject', async () => {
    analytics.init();
    const expected = analytics.deriveDeviceId('https://claude.ai', '9.9.9.9');
    await analytics.runWithContext(
      { origin: 'https://claude.ai', clientIp: '9.9.9.9', userAgent: '', mcpSessionId: '' },
      async () => analytics.track('mcp_tool_called', { tool: 'x' }),
    );
    await flush();
    expect(tracks()[0]?.payload.profileId).toBe(expected);
  });

  it('identifies an authenticated profile with the email trait', async () => {
    analytics.init({ resolveProfile: () => ({ email: 'persona@example.test' }) });
    analytics.trackFor('user-email', 'login_success', { method: 'oauth' });
    await flush();
    const id = identifies().find((e) => e.payload.profileId === 'user-email');
    expect(id?.payload.properties.email).toBe('persona@example.test');
    expect(id?.payload.firstName).toBe('persona@example.test');
  });

  it('falls back to penca:<subject> when the email is unknown', async () => {
    analytics.init({ resolveProfile: () => undefined });
    analytics.trackFor('user-noEmail', 'login_success', { method: 'oauth' });
    await flush();
    const id = identifies().find((e) => e.payload.profileId === 'user-noEmail');
    expect(id?.payload.properties.email).toBeUndefined();
    expect(id?.payload.firstName).toBe('penca:user-noEmail');
  });

  it('emits a screen_view on initialize with a browser UA so OpenPanel sessionises it', async () => {
    analytics.init();
    await analytics.runWithContext(
      {
        origin: 'https://claude.ai',
        clientIp: '1.2.3.4',
        userAgent: 'penca-ovacion-mcp/1', // server-style UA on the request
        mcpSessionId: '',
        subject: 'user-init',
      },
      async () =>
        analytics.recordJsonRpc(
          { method: 'initialize', params: { clientInfo: { name: 'Claude' } } },
          { origin: 'https://claude.ai' },
        ),
    );
    await flush();
    const sv = calls().find((c) => c.body.payload?.name === 'screen_view');
    expect(sv).toBeDefined();
    expect(sv?.body.payload.profileId).toBe('user-init');
    expect(sv?.body.payload.properties.__path).toBe('/mcp/claude.ai');
    // The anchor must override the server UA with a browser UA, or OpenPanel
    // classifies it server-side and skips the session.
    expect(sv?.headers['user-agent']).toMatch(/Mozilla\/5\.0.*Chrome/);
    // A normal custom event keeps the caller's real (server) UA.
    const tool = calls().find((c) => c.body.payload?.name === 'mcp_session_started');
    expect(tool?.headers['user-agent']).toBe('penca-ovacion-mcp/1');
  });

  it('labels an anonymous profile by clientInfo.name even without an Origin header', async () => {
    analytics.init();
    await analytics.runWithContext(
      { origin: '', clientIp: '5.5.5.5', userAgent: 'node', mcpSessionId: '' },
      async () =>
        analytics.recordJsonRpc(
          { method: 'initialize', params: { clientInfo: { name: 'Claude' } } },
          {}, // no Origin header — the real-traffic case
        ),
    );
    await flush();
    const sv = calls().find((c) => c.body.payload?.name === 'screen_view');
    expect(sv?.body.payload.properties.__path).toBe('/mcp/claude.ai');
    const id = identifies().find((e) => e.payload.profileId === sv?.body.payload.profileId);
    expect(id?.payload.firstName).toBe('claude.ai');
    expect(id?.payload.properties.cohort).toBe('claude.ai');
  });

  it('identifies a subject only once per process', async () => {
    analytics.init();
    analytics.trackFor('user-once', 'login_success', { method: 'oauth' });
    analytics.trackFor('user-once', 'logout', { via: 'penca_logout' });
    await flush();
    expect(identifies().filter((e) => e.payload.profileId === 'user-once')).toHaveLength(1);
  });
});
