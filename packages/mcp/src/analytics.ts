/**
 * Fire-and-forget OpenPanel client for the Penca Ovación MCP server.
 *
 * Server-side tracking against OpenPanel's REST `/track` endpoint. Designed to
 * never slow down or fail a tool response: every send runs detached with a
 * short timeout and swallowed errors.
 *
 * Off-by-default: if `OPENPANEL_CLIENT_ID` / `OPENPANEL_CLIENT_SECRET` are not
 * set, `track()` becomes a no-op. Stdio runs never call `init()`, so the HTTP
 * path is never exercised and analytics stays silent.
 *
 * Identity model: when a request is OAuth-authenticated we know the Penca
 * `subject` (user id) and use it directly as the `profileId`, so OpenPanel
 * groups all of a user's events under their real account across sessions and
 * devices. Otherwise we fall back to a stable anonymous `profileId` derived
 * from `SHA256(Origin + X-Forwarded-For)[:16]`, so unauthenticated/legacy
 * traffic stays anonymous and the caller IP is never stored in cleartext. The
 * one-time `identify` names the profile after its cohort ("claude.ai" /
 * "chatgpt.com" / "penca" / "other"); for an authenticated subject it is named
 * after the user's email and carries it as a profile trait. The email is
 * supplied by an injected `resolveProfile` callback so this module never imports
 * the DB.
 *
 * Sessions: OpenPanel only sessionises events whose User-Agent parses to a real
 * browser. MCP traffic is server-side, so on each `initialize` we emit a
 * `screen_view` carrying a browser UA (see SESSION_ANCHOR_UA) — that anchors a
 * session / unique visitor / pageview. Custom events (tool calls, lifecycle)
 * keep the caller's real UA and stay server-side.
 *
 * This is a port of the Realmint MCP `analytics.py`, extended with per-user
 * identity for the OAuth path.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const OPENPANEL_SDK_NAME = 'penca-ovacion-mcp';
const OPENPANEL_SDK_VERSION = '1';
const TRACK_TIMEOUT_MS = 2000;

// OpenPanel decides client-vs-server SOLELY by parsing the User-Agent: a UA it
// can't resolve to a real browser/OS (empty, or `name/version` like our SDK UA)
// is tagged `isServer` and never creates a session. MCP traffic is server-side,
// so to make the `screen_view` anchor register as a session / unique visitor /
// pageview we send this browser UA on that one event. Verified empirically:
// browser UA → session created, our SDK UA → no session.
const SESSION_ANCHOR_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let clientId = '';
let clientSecret = '';
let apiUrl = '';
let enabled = false;

/** Resolve profile traits for an authenticated subject. Injected at init() so
 *  this module never imports the DB. Returns undefined when unknown. */
type ProfileResolver = (subject: string) => { email?: string | null } | undefined;
let resolveProfile: ProfileResolver | undefined;

// Set from OPENPANEL_DEBUG at init(); when true, every successful send is also
// logged to stderr (verbose). Failures are always logged regardless.
let debug = false;

// Lightweight in-process counters so a single startup grep / health check can
// confirm events are actually landing, not just being attempted. Reset on
// process restart; never persisted.
let sentOk = 0;
let sentFailed = 0;

// profileIds we've already sent an `identify` for this process, so the
// dashboard shows the cohort name once instead of re-identifying on every tool
// call. Soft-capped to avoid unbounded growth on a long-lived server.
const identified = new Set<string>();
const IDENTIFIED_CAP = 10_000;

function log(msg: string): void {
  console.error(`[penca-ovacion-mcp] ${msg}`);
}

/** Inbound-request attribution, captured by the HTTP layer per request. */
export interface RequestCtx {
  origin: string;
  clientIp: string;
  userAgent: string;
  mcpSessionId: string;
  /** Penca subject (user id) when the request is OAuth-authenticated. */
  subject?: string;
}

// AsyncLocalStorage is the Node equivalent of Python's contextvars: it carries
// the in-flight request's attribution across awaits so tool handlers can emit
// events without ever reading the request object directly. Undefined on stdio
// or when no request is in flight.
const als = new AsyncLocalStorage<RequestCtx>();

/** Run `fn` with `ctx` as the ambient request attribution. */
export function runWithContext<T>(ctx: RequestCtx, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

function currentCtx(): RequestCtx | undefined {
  return als.getStore();
}

/** Origin/IP of the in-flight request, for {@link trackFor} from a tool handler. */
export function ambientAttribution(): { origin?: string; clientIp?: string } {
  const ctx = currentCtx();
  return ctx ? { origin: ctx.origin, clientIp: ctx.clientIp } : {};
}

export function isEnabled(): boolean {
  return enabled;
}

/** Snapshot of send outcomes since process start. For health checks. */
export function stats(): Record<string, unknown> {
  return { enabled, sent_ok: sentOk, sent_failed: sentFailed, api_url: apiUrl };
}

/** Options for {@link init}. */
export interface InitOptions {
  /** Resolve email/profile traits for an authenticated subject (DB-backed). */
  resolveProfile?: ProfileResolver;
}

const isTrue = (v: string | undefined): boolean =>
  ['1', 'true', 'yes'].includes((v ?? '').trim().toLowerCase());

/** Read OpenPanel creds from env and arm the client if both are present. */
export function init(opts: InitOptions = {}): void {
  clientId = (process.env.OPENPANEL_CLIENT_ID ?? '').trim();
  clientSecret = (process.env.OPENPANEL_CLIENT_SECRET ?? '').trim();
  apiUrl = (process.env.OPENPANEL_API_URL ?? 'https://api.openpanel.dev')
    .trim()
    .replace(/\/+$/, '');
  debug = isTrue(process.env.OPENPANEL_DEBUG);
  resolveProfile = opts.resolveProfile;

  if (!clientId || !clientSecret) {
    log('OpenPanel disabled (OPENPANEL_CLIENT_ID/SECRET not set).');
    enabled = false;
    return;
  }
  enabled = true;
  log(`OpenPanel enabled → ${apiUrl}/track (debug=${debug})`);
}

/** Stable anonymous id per (Origin, IP). 16 hex chars of SHA256. */
export function deriveDeviceId(origin: string, clientIp: string): string {
  const seed = `${origin || 'unknown'}|${clientIp || 'unknown'}`;
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 16);
}

/** Bucket the Origin into a small set for cohort filtering. */
export function classifyClient(origin: string): string {
  if (!origin) return 'unknown';
  const lo = origin.toLowerCase();
  if (lo.includes('claude.ai') || lo.includes('anthropic')) return 'claude.ai';
  if (lo.includes('chatgpt.com') || lo.includes('openai')) return 'chatgpt.com';
  if (lo.includes('1930.dev') || lo.includes('penca') || lo.includes('ovacion')) return 'penca';
  return 'other';
}

export function bucketDuration(ms: number): string {
  if (ms < 100) return '<100';
  if (ms < 500) return '<500';
  if (ms < 2000) return '<2000';
  return '>=2000';
}

/**
 * Fire-and-forget. Returns immediately; never raises. Safe from sync contexts.
 * Attributes to the ambient request context (subject if authenticated, else the
 * anonymous device profile).
 */
export function track(event: string, properties: Record<string, unknown>): void {
  if (!enabled) return;
  // Detach: don't await, and swallow anything so analytics can't break a call.
  void send(event, { ...properties }).catch(() => {});
}

/**
 * Like {@link track}, but for code paths that run OUTSIDE the request's
 * AsyncLocalStorage context (the OAuth completion + revoke handlers): the
 * subject and origin/IP are passed explicitly instead of read from the ambient
 * context. Used for the login/signup/logout lifecycle events.
 */
export function trackFor(
  subject: string,
  event: string,
  properties: Record<string, unknown>,
  attribution: { origin?: string; clientIp?: string } = {},
): void {
  if (!enabled) return;
  const ctx: RequestCtx = {
    subject,
    origin: attribution.origin ?? '',
    clientIp: attribution.clientIp ?? '',
    userAgent: '',
    mcpSessionId: '',
  };
  void send(event, { ...properties }, { ctx }).catch(() => {});
}

/**
 * Build the `identify` traits for a profile. An authenticated subject is named
 * after the user's email (falling back to `penca:<subject>` when the email is
 * unknown) and carries the email as a trait so the dashboard shows real users.
 */
function identifyTraits(ctx: RequestCtx | undefined, cohort: string): Record<string, unknown> {
  const properties: Record<string, unknown> = { cohort, via: 'mcp' };
  let firstName = cohort;
  if (ctx?.subject) {
    properties.subject = ctx.subject;
    firstName = `penca:${ctx.subject}`;
    const email = resolveProfile?.(ctx.subject)?.email ?? undefined;
    if (email) {
      firstName = email;
      properties.email = email;
    }
  }
  return { firstName, properties };
}

interface SendOpts {
  /** Attribution context when running outside the request's ALS (trackFor). */
  ctx?: RequestCtx;
  /** Override the User-Agent sent to OpenPanel (session anchor — see SESSION_ANCHOR_UA). */
  userAgent?: string;
}

async function send(
  event: string,
  properties: Record<string, unknown>,
  opts: SendOpts = {},
): Promise<void> {
  if (!enabled) return;

  const ctx = opts.ctx ?? currentCtx();
  const extraHeaders: Record<string, string> = {};
  let profileId: string | undefined;
  if (ctx) {
    // Authenticated → group by the real Penca subject; else anonymous device id.
    profileId = ctx.subject || deriveDeviceId(ctx.origin, ctx.clientIp);
    if (ctx.clientIp) extraHeaders['x-client-ip'] = ctx.clientIp;
  }
  // OpenPanel classifies an event as client (sessionised) vs server purely by
  // parsing this User-Agent. opts.userAgent lets the screen_view anchor force a
  // browser UA so it creates a session; everything else forwards the caller's.
  const userAgent = opts.userAgent ?? ctx?.userAgent;
  if (userAgent) extraHeaders['user-agent'] = userAgent;

  // First event from a profile this process: name it (cohort, or the user) so the
  // dashboard shows a label instead of a bare id. Server events only group when a
  // top-level profileId is present, so without this (and the profileId below)
  // OpenPanel drops them into no profile at all.
  if (profileId !== undefined && !identified.has(profileId)) {
    if (identified.size >= IDENTIFIED_CAP) identified.clear();
    identified.add(profileId);
    const cohort = classifyClient(ctx ? ctx.origin : '');
    await post(
      { type: 'identify', payload: { profileId, ...identifyTraits(ctx, cohort) } },
      extraHeaders,
      'identify',
    );
  }

  const payload: Record<string, unknown> = { name: event, properties };
  if (profileId !== undefined) payload.profileId = profileId;
  await post({ type: 'track', payload }, extraHeaders, event);
}

/** POST one OpenPanel envelope, swallowing (but logging) every failure. */
async function post(
  body: Record<string, unknown>,
  extraHeaders: Record<string, string>,
  label: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACK_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${apiUrl}/track`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'openpanel-client-id': clientId,
        'openpanel-client-secret': clientSecret,
        'openpanel-sdk-name': OPENPANEL_SDK_NAME,
        'openpanel-sdk-version': OPENPANEL_SDK_VERSION,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Network error / timeout. Analytics must never break a tool response, so
    // we only log and swallow — but we DO log, so silent drops stop here.
    sentFailed += 1;
    const name = err instanceof Error ? err.name : typeof err;
    log(`OpenPanel send FAILED (network) event=${JSON.stringify(label)} err=${name}`);
    return;
  } finally {
    clearTimeout(timer);
  }

  // A 2xx is not thrown, so without this check an auth/payload rejection
  // (401/400/404) would look like a successful send.
  if (resp.status >= 400) {
    sentFailed += 1;
    const preview = (await resp.text().catch(() => '')).slice(0, 300).replace(/\n/g, ' ');
    log(
      `OpenPanel send REJECTED event=${JSON.stringify(label)} status=${resp.status} body=${JSON.stringify(preview)}`,
    );
    return;
  }

  sentOk += 1;
  if (debug) log(`OpenPanel send ok event=${JSON.stringify(label)} status=${resp.status}`);
}

/**
 * Time a tool call and emit a single `mcp_tool_called` event with status +
 * bucketed duration + the caller cohort. The TS analogue of Realmint's
 * `ToolSpan` context manager.
 */
export function trackTool(tool: string, status: 'ok' | 'error', elapsedMs: number): void {
  const ctx = currentCtx();
  track('mcp_tool_called', {
    tool,
    transport: 'http',
    client: classifyClient(ctx ? ctx.origin : ''),
    status,
    duration_ms: bucketDuration(elapsedMs),
  });
}

/**
 * Peek the JSON-RPC method(s) of a POST /mcp body (best-effort, never throws).
 * On `initialize` — the first message of every new MCP connection — emit
 * `mcp_session_started` (a custom event) plus a synthetic `screen_view` so
 * OpenPanel's session model registers the connection as a session / unique
 * visitor / pageview. MCP is server-side and has no real screens, so we map one
 * `initialize` to one screen named after the client cohort.
 */
export function recordJsonRpc(body: unknown, headers: Record<string, string>): void {
  if (!body) return;
  const msgs = Array.isArray(body) ? body : [body];
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    const method = (m as Record<string, unknown>).method;
    if (method !== 'initialize') continue;
    const params = ((m as Record<string, unknown>).params ?? {}) as Record<string, unknown>;
    const clientInfo = (params.clientInfo ?? {}) as Record<string, unknown>;
    const cohort = classifyClient(headers.origin ?? '');
    const clientName = (clientInfo.name as string) || cohort;
    track('mcp_session_started', {
      transport: 'http',
      client: cohort,
      protocol_version: params.protocolVersion ?? '',
      client_name: clientInfo.name ?? '',
      client_version: clientInfo.version ?? '',
    });
    // `screen_view` is OpenPanel's page-view event: it is what builds sessions,
    // unique visitors and pageviews (custom events alone never do). __path /
    // __title are the reserved keys OpenPanel reads for the page. It must carry
    // a browser UA (SESSION_ANCHOR_UA) or OpenPanel tags it server-side and skips
    // the session. Runs inside the request ALS, so profileId/IP come from ctx.
    void send(
      'screen_view',
      { __path: `/mcp/${cohort}`, __title: `MCP — ${clientName}` },
      { userAgent: SESSION_ANCHOR_UA },
    ).catch(() => {});
  }
}
