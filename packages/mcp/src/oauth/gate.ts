import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { verifyAccessToken } from './tokens.js';

/**
 * Outcome of authenticating an MCP request:
 * - `oauth`  — a valid OAuth access token; bind the session to its subject's
 *              persisted Penca tokens.
 * - `open`   — no OAuth identity, but allowed through (legacy bearer or the
 *              unguarded default); uses in-memory tokens + magic-link tools.
 * - `reject` — a token was required, or one was presented but is invalid.
 */
export type AuthOutcome =
  | { kind: 'oauth'; subject: string }
  | { kind: 'open' }
  | { kind: 'reject' };

export interface GateConfig {
  jwtSecret: string;
  /** Expected access-token audience (the MCP resource identifier). */
  resource: string;
  /** Legacy shared bearer secret, if configured. */
  legacyBearer?: string;
  /** When true, only OAuth-authenticated requests are allowed. */
  enforceOAuth: boolean;
}

function extractBearer(header: string | undefined, queryToken: string | null): string | undefined {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (m) return m[1];
  return queryToken ?? undefined;
}

function legacyBearerOk(token: string, secret: string | undefined): boolean {
  if (!secret) return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Classify a request's credentials per {@link GateConfig}. */
export function resolveAuth(
  header: string | undefined,
  queryToken: string | null,
  config: GateConfig,
): AuthOutcome {
  const token = extractBearer(header, queryToken);
  if (token) {
    const claims = verifyAccessToken(token, config.jwtSecret, { audience: config.resource });
    if (claims) return { kind: 'oauth', subject: claims.sub };
    if (legacyBearerOk(token, config.legacyBearer)) return { kind: 'open' };
    return { kind: 'reject' }; // a credential was presented but is not valid
  }
  // No token: reject when OAuth is enforced or a legacy bearer is required;
  // otherwise fall through to the historical open behavior.
  if (config.enforceOAuth || config.legacyBearer) return { kind: 'reject' };
  return { kind: 'open' };
}

/** RFC 9728 challenge pointing clients at the protected-resource metadata. */
export function wwwAuthenticate(publicUrl: string): string {
  return `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`;
}
