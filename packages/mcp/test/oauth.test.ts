import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ClientStore } from '../src/oauth/clients.js';
import { type OAuthConfig, resolveOAuthConfig } from '../src/oauth/config.js';
import { handleOAuth } from '../src/oauth/router.js';

const config: OAuthConfig = resolveOAuthConfig({
  MCP_PUBLIC_URL: 'https://penca-ovacion.1930.dev',
  MCP_PATH: '/mcp',
} as NodeJS.ProcessEnv);

function deps() {
  return { config, clients: new ClientStore(openDb(':memory:')) };
}

describe('resolveOAuthConfig', () => {
  it('derives resource and endpoints from the public URL, trimming slashes', () => {
    const c = resolveOAuthConfig({ MCP_PUBLIC_URL: 'https://x.dev/' } as NodeJS.ProcessEnv);
    expect(c.resource).toBe('https://x.dev/mcp');
    expect(c.issuer).toBe('https://x.dev');
    expect(c.endpoints.token).toBe('https://x.dev/oauth/token');
  });
});

describe('discovery metadata', () => {
  it('serves protected resource metadata at the root well-known', () => {
    const r = handleOAuth('GET', '/.well-known/oauth-protected-resource', undefined, deps());
    expect(r?.status).toBe(200);
    expect(r?.body).toMatchObject({
      resource: 'https://penca-ovacion.1930.dev/mcp',
      authorization_servers: ['https://penca-ovacion.1930.dev'],
    });
  });

  it('also serves protected resource metadata at the path-suffixed well-known', () => {
    const r = handleOAuth('GET', '/.well-known/oauth-protected-resource/mcp', undefined, deps());
    expect(r?.status).toBe(200);
  });

  it('serves authorization server metadata with PKCE S256 and public clients', () => {
    const r = handleOAuth('GET', '/.well-known/oauth-authorization-server', undefined, deps());
    expect(r?.body).toMatchObject({
      issuer: 'https://penca-ovacion.1930.dev',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  it('returns null for non-OAuth routes so the caller falls through', () => {
    expect(handleOAuth('POST', '/mcp', {}, deps())).toBeNull();
    expect(handleOAuth('GET', '/health', undefined, deps())).toBeNull();
  });
});

describe('dynamic client registration', () => {
  it('registers a client and returns a public client_id', () => {
    const d = deps();
    const r = handleOAuth(
      'POST',
      '/oauth/register',
      { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' },
      d,
    );
    expect(r?.status).toBe(201);
    const body = r?.body as Record<string, unknown>;
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(typeof body.client_id).toBe('string');
    expect(body.client_name).toBe('Claude');
    // persisted + retrievable
    expect(d.clients.get(body.client_id as string)?.redirectUris).toEqual([
      'https://claude.ai/api/mcp/auth_callback',
    ]);
  });

  it('rejects a registration without valid redirect_uris', () => {
    expect(handleOAuth('POST', '/oauth/register', {}, deps())?.status).toBe(400);
    expect(
      handleOAuth('POST', '/oauth/register', { redirect_uris: ['not a uri'] }, deps())?.status,
    ).toBe(400);
    expect(handleOAuth('POST', '/oauth/register', { redirect_uris: [] }, deps())?.status).toBe(400);
  });
});
