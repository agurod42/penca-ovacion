import { EnvTokenStore, PencaClient, defaultTokenStore } from 'penca-ovacion-sdk';

/**
 * Build the shared client. If `PENCA_TOKEN` is set we read it from the
 * environment; otherwise we reuse the session stored by `penca login`
 * (OS keychain, file fallback).
 */
export function buildClient(): PencaClient {
  const tokens = process.env.PENCA_TOKEN ? new EnvTokenStore() : defaultTokenStore();
  return new PencaClient({
    tokens,
    baseUrl: process.env.PENCA_BASE_URL,
  });
}
