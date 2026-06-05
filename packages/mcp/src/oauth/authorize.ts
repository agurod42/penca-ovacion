import { looksLikeOtp } from 'penca-ovacion-sdk';
import * as analytics from '../analytics.js';
import { SqliteTokenStore } from '../token-store.js';
import { emailPage, errorPage, magicPage } from './pages.js';
import { identityExists, setIdentityEmail } from './store.js';
import { type OAuthDeps, type OAuthResult, appendQuery, html, redirect } from './types.js';

/** Origin + IP of the sign-in request, for attributing lifecycle events. */
export interface Attribution {
  origin?: string;
  clientIp?: string;
}

/**
 * GET /oauth/authorize — validate the request and render the email step.
 *
 * Client/redirect_uri problems render a standalone error page (we must not
 * redirect to an unvalidated URI). Once the redirect_uri is trusted, other
 * problems are reported by redirecting back with an `error` per OAuth 2.0.
 */
export function handleAuthorizeStart(query: URLSearchParams, deps: OAuthDeps): OAuthResult {
  const clientId = query.get('client_id');
  const redirectUri = query.get('redirect_uri');

  const client = clientId ? deps.clients.get(clientId) : null;
  if (!client) return html(400, errorPage('Cliente OAuth desconocido o no registrado.'));
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return html(400, errorPage('redirect_uri inválido para este cliente.'));
  }

  const state = query.get('state');
  const fail = (error: string, description: string): OAuthResult =>
    redirect(appendQuery(redirectUri, { error, error_description: description, state }));

  if (query.get('response_type') !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported.');
  }
  const codeChallenge = query.get('code_challenge');
  if (!codeChallenge || query.get('code_challenge_method') !== 'S256') {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  const resource = query.get('resource');
  if (resource && resource !== deps.config.resource) {
    return fail('invalid_target', 'Unexpected resource indicator.');
  }

  const pending = deps.pending.create({
    clientId: client.clientId,
    redirectUri,
    codeChallenge,
    state,
    scope: query.get('scope'),
    resource,
  });
  return html(200, emailPage({ loginId: pending.loginId }));
}

/** POST /oauth/authorize/email — send the magic link, then render the paste step. */
export async function handleAuthorizeEmail(
  form: Record<string, string>,
  deps: OAuthDeps,
): Promise<OAuthResult> {
  const loginId = form.login_id ?? '';
  const pending = deps.pending.get(loginId);
  if (!pending) return html(400, errorPage('La sesión de inicio expiró. Volvé a empezar.'));

  const email = (form.email ?? '').trim();
  if (!email) return html(200, emailPage({ loginId, error: 'Ingresá un correo.' }));

  try {
    await deps.createPencaClient().sendMagicLink(email);
    deps.pending.setEmail(loginId, email);
    return html(200, magicPage({ loginId, email }));
  } catch {
    return html(
      200,
      emailPage({ loginId, error: 'No pudimos enviar el enlace. Revisá el correo.' }),
    );
  }
}

/** POST /oauth/authorize/complete — finish the magic-link login and issue a code. */
export async function handleAuthorizeComplete(
  form: Record<string, string>,
  deps: OAuthDeps,
  attribution: Attribution = {},
): Promise<OAuthResult> {
  const loginId = form.login_id ?? '';
  const pending = deps.pending.get(loginId);
  if (!pending) return html(400, errorPage('La sesión de inicio expiró. Volvé a empezar.'));

  const email = pending.email ?? '';
  const token = (form.token ?? '').trim();
  if (!token)
    return html(200, magicPage({ loginId, email, error: 'Ingresá el código o pegá el enlace.' }));

  try {
    const penca = deps.createPencaClient();
    // A short code is the email OTP (login password); anything else is a magic
    // link / token.
    const { tokens, user } =
      looksLikeOtp(token) && email
        ? await penca.otpLogin(email, token)
        : await penca.magicLogin(token);
    const subject = user?.id ?? (await penca.me()).id;

    // Capture new-vs-returning BEFORE the upsert creates the identity row.
    const isNew = !identityExists(deps.db, subject);

    // Persist the Penca tokens for this subject (refresh encrypted via codec).
    await new SqliteTokenStore(deps.db, subject, deps.codec).save(tokens);
    if (user?.email) setIdentityEmail(deps.db, subject, user.email);

    // Lifecycle events: always a login, plus a signup the first time we see this
    // subject. Fired after the email is persisted so the profile resolver can
    // attach it as a trait (when OPENPANEL_IDENTIFY_PII is enabled).
    analytics.trackFor(subject, 'login_success', { method: 'oauth', is_new: isNew }, attribution);
    if (isNew) analytics.trackFor(subject, 'signup', { method: 'oauth' }, attribution);

    const code = deps.codes.issue({
      subject,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      resource: pending.resource,
      scope: pending.scope,
    });
    deps.pending.delete(loginId);
    return redirect(appendQuery(pending.redirectUri, { code: code.code, state: pending.state }));
  } catch {
    return html(
      200,
      magicPage({
        loginId,
        email,
        error: 'El código o enlace no es válido o expiró. Probá de nuevo.',
      }),
    );
  }
}
