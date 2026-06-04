import type { ClientStore } from './clients.js';
import type { OAuthConfig } from './config.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js';

/** A JSON response for an OAuth endpoint. */
export interface OAuthResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface OAuthDeps {
  config: OAuthConfig;
  clients: ClientStore;
}

function isAbsoluteUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    // Absolute URIs only (must have a scheme); throws on relative.
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Dynamic Client Registration (RFC 7591). */
function registerClient(body: unknown, clients: ClientStore): OAuthResult {
  const input = (body ?? {}) as Record<string, unknown>;
  const redirectUris = input.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every(isAbsoluteUri)
  ) {
    return {
      status: 400,
      body: {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must be a non-empty array of absolute URIs.',
      },
    };
  }
  const clientName = typeof input.client_name === 'string' ? input.client_name : undefined;
  const client = clients.register({ redirectUris, clientName });
  return {
    status: 201,
    body: {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt / 1000),
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(client.clientName ? { client_name: client.clientName } : {}),
    },
  };
}

/**
 * Handle the OAuth discovery + registration routes. Returns `null` when the
 * request is not an OAuth route, so the caller can fall through to the MCP
 * transport. Authorization/token/revocation land in later sub-steps.
 */
export function handleOAuth(
  method: string,
  pathname: string,
  body: unknown,
  deps: OAuthDeps,
): OAuthResult | null {
  const { config, clients } = deps;

  if (method === 'GET') {
    // RFC 9728: clients may request the metadata with or without the resource
    // path suffix; serve both.
    if (
      pathname === '/.well-known/oauth-protected-resource' ||
      pathname === `/.well-known/oauth-protected-resource${config.mcpPath}`
    ) {
      return { status: 200, body: protectedResourceMetadata(config) };
    }
    if (pathname === '/.well-known/oauth-authorization-server') {
      return { status: 200, body: authorizationServerMetadata(config) };
    }
  }

  if (method === 'POST' && pathname === '/oauth/register') {
    return registerClient(body, clients);
  }

  return null;
}
