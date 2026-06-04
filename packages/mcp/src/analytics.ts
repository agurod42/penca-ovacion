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
 * Identity model: MCP has no end-user. We derive a stable anonymous
 * `profileId` from `SHA256(Origin + X-Forwarded-For)[:16]` and send it as a
 * top-level payload field so OpenPanel groups a caller's events into one
 * anonymous profile (named after its cohort — "claude.ai" / "chatgpt.com" /
 * "penca" / "other" — via a one-time `identify`) without ever storing the
 * caller IP in cleartext. Sessions are intentionally absent: OpenPanel only
 * sessionises browser/client events, and MCP traffic is server-side.
 *
 * This is a faithful port of the Realmint MCP `analytics.py`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const OPENPANEL_SDK_NAME = 'penca-ovacion-mcp';
const OPENPANEL_SDK_VERSION = '1';
const TRACK_TIMEOUT_MS = 2000;

let clientId = '';
let clientSecret = '';
let apiUrl = '';
let enabled = false;

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

export function isEnabled(): boolean {
  return enabled;
}

/** Snapshot of send outcomes since process start. For health checks. */
export function stats(): Record<string, unknown> {
  return { enabled, sent_ok: sentOk, sent_failed: sentFailed, api_url: apiUrl };
}

/** Read OpenPanel creds from env and arm the client if both are present. */
export function init(): void {
  clientId = (process.env.OPENPANEL_CLIENT_ID ?? '').trim();
  clientSecret = (process.env.OPENPANEL_CLIENT_SECRET ?? '').trim();
  apiUrl = (process.env.OPENPANEL_API_URL ?? 'https://api.openpanel.dev')
    .trim()
    .replace(/\/+$/, '');
  debug = ['1', 'true', 'yes'].includes((process.env.OPENPANEL_DEBUG ?? '').trim().toLowerCase());

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
 */
export function track(event: string, properties: Record<string, unknown>): void {
  if (!enabled) return;
  // Detach: don't await, and swallow anything so analytics can't break a call.
  void send(event, { ...properties }).catch(() => {});
}

async function send(event: string, properties: Record<string, unknown>): Promise<void> {
  if (!enabled) return;

  const ctx = currentCtx();
  const extraHeaders: Record<string, string> = {};
  let profileId: string | undefined;
  if (ctx) {
    profileId = deriveDeviceId(ctx.origin, ctx.clientIp);
    if (ctx.clientIp) extraHeaders['x-client-ip'] = ctx.clientIp;
    if (ctx.userAgent) extraHeaders['user-agent'] = ctx.userAgent;
  }

  // First event from a profile this process: name it after its cohort so the
  // dashboard shows "claude.ai" / "penca" / ... instead of a bare hash. Server
  // events only group when a top-level profileId is present, so without this
  // (and the profileId below) OpenPanel drops them into no profile at all.
  if (profileId !== undefined && !identified.has(profileId)) {
    if (identified.size >= IDENTIFIED_CAP) identified.clear();
    identified.add(profileId);
    const cohort = classifyClient(ctx ? ctx.origin : '');
    await post(
      {
        type: 'identify',
        payload: { profileId, firstName: cohort, properties: { cohort, via: 'mcp' } },
      },
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
 * `mcp_session_started` so OpenPanel can count sessions.
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
    track('mcp_session_started', {
      transport: 'http',
      client: classifyClient(headers.origin ?? ''),
      protocol_version: params.protocolVersion ?? '',
      client_name: clientInfo.name ?? '',
      client_version: clientInfo.version ?? '',
    });
  }
}
