import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { MemoryTokenStore, PencaClient, looksLikeOtp } from 'penca-ovacion-sdk';
import { z } from 'zod';
import * as analytics from './analytics.js';
import { codecFromEnv } from './crypto.js';
import { openDb } from './db.js';
import { ClientStore } from './oauth/clients.js';
import { resolveOAuthConfig } from './oauth/config.js';
import { type AuthOutcome, type GateConfig, resolveAuth, wwwAuthenticate } from './oauth/gate.js';
import { handleOAuth } from './oauth/router.js';
import { AuthCodeStore, PendingLoginStore, SessionStore } from './oauth/store.js';
import type { OAuthDeps } from './oauth/types.js';
import { createServer } from './server.js';
import { SqliteTokenStore } from './token-store.js';

/**
 * Streamable HTTP entrypoint for the Penca Ovación MCP server (multi-user).
 *
 * Two sign-in modes coexist:
 *   - OAuth 2.1 (preferred): the client presents an access token; the session
 *     binds to that subject's Penca tokens persisted in SQLite, so it survives
 *     reconnects. Sign-in happens in the browser via the OAuth endpoints.
 *   - Legacy/open: no OAuth token; the session uses in-memory tokens and signs
 *     in through the MCP tools `penca_login` / `penca_login_complete`. Tokens
 *     are dropped when the session closes.
 *
 * `MCP_BEARER_SECRET` (optional) gates legacy access; `MCP_OAUTH_ENFORCE`
 * requires a valid OAuth token and disables the open/legacy path.
 *
 * Env:
 *   PORT                listen port (default 3000)
 *   MCP_PATH            request path for MCP (default /mcp)
 *   MCP_PUBLIC_URL      canonical public origin for OAuth metadata
 *                       (e.g. https://penca-ovacion.1930.dev; default localhost)
 *   MCP_DB_PATH         SQLite path (default /data/penca-mcp.db, the mounted volume)
 *   MCP_TOKEN_ENC_KEY   32-byte key (hex/base64) to encrypt refresh tokens at rest
 *   MCP_BEARER_SECRET   if set, legacy requests must present the secret either as
 *                       `Authorization: Bearer <secret>` or as a `?token=<secret>`
 *                       query param (for connector UIs that only accept a URL).
 *   MCP_OAUTH_ENFORCE   if "true"/"1", require a valid OAuth token on /mcp
 *   PENCA_BASE_URL      (optional) override the Penca API base URL
 *
 *   OpenPanel analytics (server-side, off by default; HTTP transport only):
 *   OPENPANEL_CLIENT_ID / OPENPANEL_CLIENT_SECRET   leave blank to disable
 *   OPENPANEL_API_URL   OpenPanel REST base (default https://api.openpanel.dev)
 *   OPENPANEL_DEBUG     set to 1 to log every successful send to stderr
 *
 * `GET /health` (unauthenticated) returns 200 for health checks.
 * `GET /analytics/stats` (unauthenticated) returns OpenPanel send counters.
 * The OAuth discovery documents under `/.well-known/` are served without a gate.
 */

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';
const BEARER = process.env.MCP_BEARER_SECRET;
// When true, /mcp requires a valid OAuth access token (no anonymous/legacy
// access). Off by default so existing magic-link connectors keep working until
// a deliberate cutover.
const ENFORCE_OAUTH =
  process.env.MCP_OAUTH_ENFORCE === 'true' || process.env.MCP_OAUTH_ENFORCE === '1';

const ACCESS_TTL_SEC = Number(process.env.MCP_ACCESS_TTL_SEC ?? 3600);

function resolveJwtSecret(): string {
  const secret = process.env.MCP_JWT_SECRET;
  if (secret) return secret;
  console.error(
    'WARNING: MCP_JWT_SECRET not set — using an ephemeral secret; issued sessions die on restart.',
  );
  return randomBytes(32).toString('hex');
}

// Server-side state (identities, OAuth clients, codes, sessions, pending
// logins). Opened once at startup and shared across requests.
const db = openDb();
const oauthConfig = resolveOAuthConfig();
const oauthDeps: OAuthDeps = {
  config: oauthConfig,
  clients: new ClientStore(db),
  codes: new AuthCodeStore(db),
  sessions: new SessionStore(db),
  pending: new PendingLoginStore(db),
  db,
  codec: codecFromEnv(),
  jwtSecret: resolveJwtSecret(),
  accessTtlSec: ACCESS_TTL_SEC,
  createPencaClient: () =>
    new PencaClient({ tokens: new MemoryTokenStore(), baseUrl: process.env.PENCA_BASE_URL }),
};

/** Server icon, served (unauthenticated) at /icon.svg, /icon.png, /favicon.ico. */
function loadAsset(rel: string): Buffer | undefined {
  try {
    return readFileSync(new URL(rel, import.meta.url));
  } catch {
    return undefined;
  }
}
const ICON_SVG = loadAsset('../assets/icon.svg');
const ICON_PNG = loadAsset('../assets/icon-512.png');

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function json(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function toolError(err: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const gateConfig: GateConfig = {
  jwtSecret: oauthDeps.jwtSecret,
  resource: oauthConfig.resource,
  legacyBearer: BEARER,
  enforceOAuth: ENFORCE_OAUTH,
};

async function readRawBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Register per-session sign-in tools bound to this session's client. */
function registerAuthTools(server: McpServer, client: PencaClient): void {
  // Remembered between the two sign-in steps so the emailed code (OTP) can be
  // completed without re-supplying the address.
  let lastEmail = '';

  server.tool(
    'penca_login',
    'Step 1 of sign-in: email a one-time code (and magic link) to the given address. Then call penca_login_complete with either the 6-character code from the email or the link.',
    { email: z.string().email().describe('email address of the Penca account') },
    async ({ email }) => {
      try {
        const r = await client.sendMagicLink(email);
        lastEmail = email;
        return json({
          ...r,
          next: 'Check your email, then call penca_login_complete with the 6-character code (or the magic link).',
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  server.tool(
    'penca_login_complete',
    'Step 2 of sign-in: complete the login with the 6-character code from the email, or the magic-link URL / its token. Authenticates the current MCP session.',
    {
      codeOrLink: z
        .string()
        .min(1)
        .describe('the 6-character code from the email, or the magic-link URL / token'),
      email: z
        .string()
        .email()
        .optional()
        .describe('account email (only needed for the code if penca_login was not called first)'),
    },
    async ({ codeOrLink, email }) => {
      try {
        const value = codeOrLink.trim();
        const addr = email ?? lastEmail;
        if (looksLikeOtp(value) && addr) {
          await client.otpLogin(addr, value);
        } else {
          await client.magicLogin(value);
        }
        const me = await client.me();
        return json({ loggedIn: true, account: me });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}

// Active sessions: sessionId -> transport.
const transports: Record<string, StreamableHTTPServerTransport> = {};

/** Lowercased single-valued header view for analytics (Node headers may be arrays). */
function headerRecord(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = v[0] ?? '';
  }
  return out;
}

/** Capture inbound-request attribution for fire-and-forget analytics. */
function requestCtx(req: IncomingMessage): analytics.RequestCtx {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
  const clientIp = forwarded
    ? (forwarded.split(',')[0]?.trim() ?? '')
    : (req.socket.remoteAddress ?? '');
  return {
    origin: (req.headers.origin as string | undefined) ?? '',
    clientIp,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
    mcpSessionId: (req.headers['mcp-session-id'] as string | undefined) ?? '',
  };
}

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
  auth: AuthOutcome,
): Promise<void> {
  const body = await readJsonBody(req);
  // Best-effort: count JSON-RPC methods and emit mcp_session_started on initialize.
  analytics.recordJsonRpc(body, headerRecord(req));
  const sid = req.headers['mcp-session-id'] as string | undefined;

  let transport: StreamableHTTPServerTransport;
  if (sid && transports[sid]) {
    transport = transports[sid];
  } else if (!sid && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    // OAuth sessions load the subject's persisted Penca tokens (and so survive
    // reconnects); legacy/open sessions use in-memory tokens and sign in via the
    // magic-link tools.
    const tokens =
      auth.kind === 'oauth'
        ? new SqliteTokenStore(db, auth.subject, oauthDeps.codec)
        : new MemoryTokenStore();
    const client = new PencaClient({ tokens, baseUrl: process.env.PENCA_BASE_URL });
    const server = createServer(client);
    if (auth.kind !== 'oauth') registerAuthTools(server, client);
    await server.connect(transport);
  } else {
    return sendJson(res, 400, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'No valid session ID provided' },
      id: null,
    });
  }
  await transport.handleRequest(req, res, body);
}

async function handleSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sid = req.headers['mcp-session-id'] as string | undefined;
  if (!sid || !transports[sid]) {
    return sendJson(res, 400, { error: 'invalid or missing session id' });
  }
  await transports[sid].handleRequest(req, res);
}

const httpServer = createHttpServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }
    // Read-only OpenPanel send-outcome counters, so a single curl confirms
    // events are landing (sent_ok rising) vs silently failing. Unauthenticated.
    if (req.method === 'GET' && url.pathname === '/analytics/stats') {
      return sendJson(res, 200, analytics.stats());
    }
    if (req.method === 'GET' && url.pathname === '/icon.svg' && ICON_SVG) {
      res.writeHead(200, {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=86400',
      });
      return void res.end(ICON_SVG);
    }
    if (
      req.method === 'GET' &&
      (url.pathname === '/icon.png' || url.pathname === '/favicon.ico') &&
      ICON_PNG
    ) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      return void res.end(ICON_PNG);
    }
    // OAuth: discovery, registration, authorization and token endpoints
    // (additive; does not yet gate /mcp — token validation lands in sub-step 5).
    const isOAuthRoute =
      url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/.well-known/oauth');
    if (isOAuthRoute) {
      const rawBody = req.method === 'POST' ? await readRawBody(req) : undefined;
      const result = await handleOAuth(req.method ?? 'GET', url, rawBody, oauthDeps);
      if (result) {
        const isJson = !result.headers?.['content-type'];
        res.writeHead(result.status, {
          ...(isJson ? { 'content-type': 'application/json' } : {}),
          ...result.headers,
        });
        return void res.end(isJson ? JSON.stringify(result.body) : String(result.body));
      }
      return sendJson(res, 404, { error: 'not found' });
    }

    if (url.pathname !== MCP_PATH) {
      return sendJson(res, 404, { error: 'not found' });
    }
    const auth = resolveAuth(req.headers.authorization, url.searchParams.get('token'), gateConfig);
    if (auth.kind === 'reject') {
      res.writeHead(401, {
        'content-type': 'application/json',
        'www-authenticate': wwwAuthenticate(oauthConfig.publicUrl),
      });
      return void res.end(JSON.stringify({ error: 'invalid_token' }));
    }

    // Run the MCP dispatch inside the request's analytics context so tool
    // handlers can attribute events to a stable anonymous profile.
    const ctx = requestCtx(req);
    if (req.method === 'POST') {
      return await analytics.runWithContext(ctx, () => handlePost(req, res, auth));
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      return await analytics.runWithContext(ctx, () => handleSession(req, res));
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
});

// Arm OpenPanel (no-op unless OPENPANEL_CLIENT_ID/SECRET are set). HTTP only;
// the stdio entrypoint never calls this, so stdio runs stay silent.
analytics.init();

httpServer.listen(PORT, () => {
  console.error(`penca-ovacion MCP (Streamable HTTP, multi-user) listening on :${PORT}${MCP_PATH}`);
  if (!BEARER) {
    console.error('WARNING: MCP_BEARER_SECRET not set — the endpoint is unauthenticated');
  }
  analytics.track('mcp_server_started', { transport: 'http', port: PORT });
});
