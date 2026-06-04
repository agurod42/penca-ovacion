import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Verify a PKCE code verifier against a stored `S256` challenge
 * (RFC 7636): challenge == base64url(sha256(verifier)). Constant-time compare.
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
