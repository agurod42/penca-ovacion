/**
 * Resolved OAuth 2.1 configuration for the MCP server acting as both Resource
 * Server and Authorization Server.
 *
 * The canonical public URL must be the clean subdomain
 * (`https://penca-ovacion.1930.dev`), not the path-stripped `1930.dev/penca-ovacion`
 * variant — the `.well-known` discovery documents must live at the host root.
 */
export interface OAuthConfig {
  /** Public origin of the server, e.g. `https://penca-ovacion.1930.dev`. */
  publicUrl: string;
  /** Request path the MCP transport is served on, e.g. `/mcp`. */
  mcpPath: string;
  /** Protected resource identifier (audience), `publicUrl + mcpPath`. */
  resource: string;
  /** Authorization server issuer (equals `publicUrl`). */
  issuer: string;
  endpoints: {
    authorization: string;
    token: string;
    registration: string;
    revocation: string;
  };
  scopesSupported: string[];
}

/** Build the OAuth config from the environment. */
export function resolveOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const port = Number(env.PORT ?? 3000);
  const mcpPath = env.MCP_PATH ?? '/mcp';
  const publicUrl = (env.MCP_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
  return {
    publicUrl,
    mcpPath,
    resource: `${publicUrl}${mcpPath}`,
    issuer: publicUrl,
    endpoints: {
      authorization: `${publicUrl}/oauth/authorize`,
      token: `${publicUrl}/oauth/token`,
      registration: `${publicUrl}/oauth/register`,
      revocation: `${publicUrl}/oauth/revoke`,
    },
    scopesSupported: ['penca'],
  };
}
