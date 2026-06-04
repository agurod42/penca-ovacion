import type { OAuthConfig } from './config.js';

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). Points MCP clients at the
 * authorization server(s) that issue tokens for this resource.
 */
export function protectedResourceMetadata(c: OAuthConfig): Record<string, unknown> {
  return {
    resource: c.resource,
    authorization_servers: [c.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: c.scopesSupported,
    resource_name: 'Penca Ovación MCP',
  };
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414). Public clients only
 * (no client secret), authorization-code + refresh-token grants, PKCE S256
 * required.
 */
export function authorizationServerMetadata(c: OAuthConfig): Record<string, unknown> {
  return {
    issuer: c.issuer,
    authorization_endpoint: c.endpoints.authorization,
    token_endpoint: c.endpoints.token,
    registration_endpoint: c.endpoints.registration,
    revocation_endpoint: c.endpoints.revocation,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: c.scopesSupported,
  };
}
