import { describe, expect, it } from 'vitest';
import { type GateConfig, resolveAuth, wwwAuthenticate } from '../src/oauth/gate.js';
import { signAccessToken } from '../src/oauth/tokens.js';

const RESOURCE = 'https://penca-ovacion.1930.dev/mcp';
const SECRET = 'jwt-secret';

const base: GateConfig = {
  jwtSecret: SECRET,
  resource: RESOURCE,
  legacyBearer: undefined,
  enforceOAuth: false,
};

function token(overrides: Partial<Parameters<typeof signAccessToken>[0]> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return signAccessToken(
    {
      sub: 'user-1',
      aud: RESOURCE,
      iss: 'https://penca-ovacion.1930.dev',
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    SECRET,
  );
}

const bearer = (t: string) => `Bearer ${t}`;

describe('resolveAuth', () => {
  it('accepts a valid OAuth token and extracts the subject', () => {
    expect(resolveAuth(bearer(token()), null, base)).toEqual({ kind: 'oauth', subject: 'user-1' });
  });

  it('reads the token from the ?token query param too', () => {
    expect(resolveAuth(undefined, token(), base)).toEqual({ kind: 'oauth', subject: 'user-1' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const bad = signAccessToken(
      { sub: 'x', aud: RESOURCE, iss: 'i', iat: 0, exp: 9_999_999_999 },
      'other-secret',
    );
    expect(resolveAuth(bearer(bad), null, base)).toEqual({ kind: 'reject' });
  });

  it('rejects a token for a different audience', () => {
    expect(resolveAuth(bearer(token({ aud: 'https://evil.example/mcp' })), null, base)).toEqual({
      kind: 'reject',
    });
  });

  it('rejects an expired token', () => {
    expect(resolveAuth(bearer(token({ exp: 1 })), null, base)).toEqual({ kind: 'reject' });
  });

  describe('open vs enforced', () => {
    it('is open with no token by default', () => {
      expect(resolveAuth(undefined, null, base)).toEqual({ kind: 'open' });
    });

    it('rejects a missing token when OAuth is enforced', () => {
      expect(resolveAuth(undefined, null, { ...base, enforceOAuth: true })).toEqual({
        kind: 'reject',
      });
    });

    it('still accepts a valid OAuth token when enforced', () => {
      expect(resolveAuth(bearer(token()), null, { ...base, enforceOAuth: true })).toMatchObject({
        kind: 'oauth',
      });
    });
  });

  describe('legacy bearer', () => {
    const cfg = { ...base, legacyBearer: 's3cret' };
    it('accepts the matching legacy secret as open', () => {
      expect(resolveAuth(bearer('s3cret'), null, cfg)).toEqual({ kind: 'open' });
    });
    it('rejects a wrong legacy secret', () => {
      expect(resolveAuth(bearer('nope'), null, cfg)).toEqual({ kind: 'reject' });
    });
    it('rejects a missing token when a legacy bearer is configured', () => {
      expect(resolveAuth(undefined, null, cfg)).toEqual({ kind: 'reject' });
    });
    it('still prefers a valid OAuth token over the legacy path', () => {
      expect(resolveAuth(bearer(token()), null, cfg)).toMatchObject({ kind: 'oauth' });
    });
  });
});

describe('wwwAuthenticate', () => {
  it('points at the protected-resource metadata', () => {
    expect(wwwAuthenticate('https://penca-ovacion.1930.dev')).toBe(
      'Bearer resource_metadata="https://penca-ovacion.1930.dev/.well-known/oauth-protected-resource"',
    );
  });
});
