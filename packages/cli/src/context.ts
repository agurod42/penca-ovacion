import {
  EnvTokenStore,
  PencaAuthError,
  PencaClient,
  PencaHttpError,
  defaultTokenStore,
} from 'penca-ovacion-sdk';
import { fail } from './output.js';

export interface GlobalOptions {
  json?: boolean;
  color?: boolean;
  baseUrl?: string;
  debug?: boolean;
}

let debugMode = false;

export function setDebug(enabled: boolean): void {
  debugMode = enabled;
}

/** Build a client honoring global flags / env overrides. */
export function makeClient(opts: GlobalOptions): PencaClient {
  // PENCA_TOKEN (env) takes precedence for CI / stateless use; otherwise the
  // session stored by `penca login` (OS keychain, file fallback).
  const tokens = process.env.PENCA_TOKEN ? new EnvTokenStore() : defaultTokenStore();
  return new PencaClient({
    tokens,
    baseUrl: opts.baseUrl ?? process.env.PENCA_BASE_URL,
  });
}

/** Run an async command body, translating SDK errors into clean CLI output. */
export async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (debugMode) {
      console.error(err);
    }
    if (err instanceof PencaAuthError) {
      fail(`${err.message}`);
    }
    if (err instanceof PencaHttpError) {
      fail(err.message);
    }
    fail(err instanceof Error ? err.message : String(err));
  }
}

/** Ensure the user is authenticated; exit cleanly otherwise. */
export async function requireAuth(client: PencaClient): Promise<void> {
  if (!(await client.isAuthenticated())) {
    fail('Not authenticated. Run `penca login` first.');
  }
}
