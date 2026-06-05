import * as analytics from '../analytics.js';
import {
  type Attribution,
  handleAuthorizeComplete,
  handleAuthorizeEmail,
  handleAuthorizeStart,
} from './authorize.js';
import type { ClientStore } from './clients.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js';
import { handleToken } from './token-endpoint.js';
import type { OAuthDeps, OAuthResult } from './types.js';

function parseForm(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of new URLSearchParams(raw)) out[key] = value;
  return out;
}

function parseJson(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isAbsoluteUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value); // absolute URIs only (must have a scheme); throws on relative
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

/** Token revocation (RFC 7009). Always responds 200, even for unknown tokens. */
function revokeToken(
  form: Record<string, string>,
  deps: OAuthDeps,
  attribution: Attribution,
): OAuthResult {
  const token = form.token;
  if (token) {
    // Look up the subject before deleting so the logout event can be attributed.
    const session = deps.sessions.get(token);
    deps.sessions.delete(token); // we track refresh tokens; access JWTs are stateless
    if (session) {
      analytics.trackFor(session.subject, 'logout', { via: 'oauth_revoke' }, attribution);
    }
  }
  return { status: 200, body: {} };
}

/**
 * Route the OAuth discovery, registration, authorization and token endpoints.
 * Returns `null` when the request is not an OAuth route, so the caller can fall
 * through to the MCP transport.
 */
export async function handleOAuth(
  method: string,
  url: URL,
  rawBody: string | undefined,
  deps: OAuthDeps,
  attribution: Attribution = {},
): Promise<OAuthResult | null> {
  const path = url.pathname;

  if (method === 'GET') {
    if (
      path === '/.well-known/oauth-protected-resource' ||
      path === `/.well-known/oauth-protected-resource${deps.config.mcpPath}`
    ) {
      return { status: 200, body: protectedResourceMetadata(deps.config) };
    }
    if (path === '/.well-known/oauth-authorization-server') {
      return { status: 200, body: authorizationServerMetadata(deps.config) };
    }
    if (path === '/oauth/authorize') {
      return handleAuthorizeStart(url.searchParams, deps);
    }
  }

  if (method === 'POST') {
    if (path === '/oauth/register') return registerClient(parseJson(rawBody), deps.clients);
    if (path === '/oauth/authorize/email') return handleAuthorizeEmail(parseForm(rawBody), deps);
    if (path === '/oauth/authorize/complete')
      return handleAuthorizeComplete(parseForm(rawBody), deps, attribution);
    if (path === '/oauth/token') return handleToken(parseForm(rawBody), deps);
    if (path === '/oauth/revoke') return revokeToken(parseForm(rawBody), deps, attribution);
  }

  return null;
}
