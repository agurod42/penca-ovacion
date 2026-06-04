import type { PencaClient } from 'penca-ovacion-sdk';
import type { Db } from '../db.js';
import type { TokenCodec } from '../token-store.js';
import type { ClientStore } from './clients.js';
import type { OAuthConfig } from './config.js';
import type { AuthCodeStore, PendingLoginStore, SessionStore } from './store.js';

/** A response produced by an OAuth endpoint handler. */
export interface OAuthResult {
  status: number;
  /** JSON body, or a pre-rendered string (used with a `content-type` header). */
  body: unknown;
  headers?: Record<string, string>;
}

/** Everything the OAuth handlers need; injected so they stay testable. */
export interface OAuthDeps {
  config: OAuthConfig;
  clients: ClientStore;
  codes: AuthCodeStore;
  sessions: SessionStore;
  pending: PendingLoginStore;
  db: Db;
  codec: TokenCodec;
  jwtSecret: string;
  /** Access-token lifetime in seconds. */
  accessTtlSec: number;
  /** Build a fresh, unauthenticated Penca client (in-memory tokens). */
  createPencaClient: () => PencaClient;
}

/** Build a 302 redirect result. */
export function redirect(location: string): OAuthResult {
  return { status: 302, body: '', headers: { location } };
}

/** Build an HTML result. */
export function html(status: number, markup: string): OAuthResult {
  return { status, body: markup, headers: { 'content-type': 'text/html; charset=utf-8' } };
}

/** Append query params (skipping null/undefined) to an absolute URI. */
export function appendQuery(
  uri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url.toString();
}
