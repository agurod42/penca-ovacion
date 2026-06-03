import { Buffer } from 'node:buffer';
import type { JwtPayload } from './types.js';

/**
 * Decode (without verifying) the payload of a JWT. The Penca API signs tokens
 * server-side with HS256; clients only ever read the claims.
 */
export function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Whether a JWT is expired (or expires within `skewSeconds`). */
export function isExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}
