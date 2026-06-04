import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Our own access tokens are compact HS256 JWTs (signed with MCP_JWT_SECRET),
 * audience-bound to the MCP resource so they cannot be replayed against another
 * server (RFC 8707). Refresh tokens are opaque random strings tracked in the
 * sessions table. Both are validated server-side on each /mcp request.
 */

export interface AccessTokenClaims {
  /** Subject — the Penca user id. */
  sub: string;
  /** Audience — the MCP resource identifier. */
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  scope?: string;
}

const b64url = (input: string): string => Buffer.from(input, 'utf8').toString('base64url');

/** Sign a set of claims into an HS256 JWT. */
export function signAccessToken(claims: AccessTokenClaims, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verify an HS256 JWT's signature, expiry and audience. Returns the claims, or
 * null if anything fails.
 */
export function verifyAccessToken(
  token: string,
  secret: string,
  opts: { audience: string; now?: number },
): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims: AccessTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessTokenClaims;
  } catch {
    return null;
  }
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  if (claims.aud !== opts.audience) return null;
  return claims;
}

/** Generate an opaque refresh token. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}
