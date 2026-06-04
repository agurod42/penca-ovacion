import { verifyPkceS256 } from './pkce.js';
import { generateRefreshToken, signAccessToken } from './tokens.js';
import type { OAuthDeps, OAuthResult } from './types.js';

function tokenError(status: number, error: string, description: string): OAuthResult {
  return {
    status,
    body: { error, error_description: description },
    headers: { 'cache-control': 'no-store' },
  };
}

/** Build the access-token JSON response, optionally including a refresh token. */
function accessResponse(
  subject: string,
  scope: string | null,
  deps: OAuthDeps,
  refreshToken?: string,
): OAuthResult {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signAccessToken(
    {
      sub: subject,
      aud: deps.config.resource,
      iss: deps.config.issuer,
      iat: now,
      exp: now + deps.accessTtlSec,
      ...(scope ? { scope } : {}),
    },
    deps.jwtSecret,
  );
  return {
    status: 200,
    body: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: deps.accessTtlSec,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      ...(scope ? { scope } : {}),
    },
    headers: { 'cache-control': 'no-store' },
  };
}

/**
 * POST /oauth/token — authorization_code (with PKCE) and refresh_token grants.
 * Form-encoded per OAuth 2.0. Public clients, so no client authentication.
 */
export function handleToken(form: Record<string, string>, deps: OAuthDeps): OAuthResult {
  const grantType = form.grant_type;

  if (grantType === 'authorization_code') {
    const code = form.code;
    const verifier = form.code_verifier;
    const clientId = form.client_id;
    if (!code || !verifier || !clientId) {
      return tokenError(400, 'invalid_request', 'code, code_verifier and client_id are required.');
    }
    const authCode = deps.codes.consume(code);
    if (!authCode)
      return tokenError(400, 'invalid_grant', 'Authorization code is invalid or expired.');
    if (authCode.clientId !== clientId) {
      return tokenError(400, 'invalid_grant', 'client_id does not match the authorization code.');
    }
    if (form.redirect_uri && authCode.redirectUri !== form.redirect_uri) {
      return tokenError(400, 'invalid_grant', 'redirect_uri does not match.');
    }
    if (!verifyPkceS256(verifier, authCode.codeChallenge)) {
      return tokenError(400, 'invalid_grant', 'PKCE verification failed.');
    }
    const refreshToken = generateRefreshToken();
    deps.sessions.create({
      refreshToken,
      subject: authCode.subject,
      clientId,
      scope: authCode.scope,
    });
    return accessResponse(authCode.subject, authCode.scope, deps, refreshToken);
  }

  if (grantType === 'refresh_token') {
    const refreshToken = form.refresh_token;
    if (!refreshToken) return tokenError(400, 'invalid_request', 'refresh_token is required.');
    const session = deps.sessions.get(refreshToken);
    if (!session) return tokenError(400, 'invalid_grant', 'Unknown or revoked refresh token.');
    if (form.client_id && session.clientId !== form.client_id) {
      return tokenError(400, 'invalid_grant', 'client_id does not match the session.');
    }
    deps.sessions.touch(refreshToken);
    // Keep the existing refresh token; only mint a fresh access token.
    return accessResponse(session.subject, session.scope, deps);
  }

  return tokenError(
    400,
    'unsupported_grant_type',
    `Unsupported grant_type: ${grantType ?? '(none)'}.`,
  );
}
