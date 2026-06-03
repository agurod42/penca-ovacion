import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MemoryTokenStore, PencaClient } from 'penca-ovacion-sdk';
import { z } from 'zod';
import { createServer } from './server.js';

/**
 * Streamable HTTP entrypoint for the Penca Ovación MCP server (multi-user).
 *
 * Stateful: each MCP session gets its own PencaClient backed by an in-memory
 * token store, so users authenticate per session and credentials never persist
 * server-side beyond the live connection. Sign-in happens through the MCP tools
 * `penca_login` (sends a magic-link email) and `penca_login_complete` (finishes
 * with the link/token). Tokens are dropped when the session closes.
 *
 * A separate `MCP_BEARER_SECRET` gates who may reach the server at all (so the
 * endpoint is not an open Penca proxy); the per-user Penca sign-in is on top.
 *
 * Env:
 *   PORT                listen port (default 3000)
 *   MCP_PATH            request path for MCP (default /mcp)
 *   MCP_BEARER_SECRET   if set, requests must present the secret either as
 *                       `Authorization: Bearer <secret>` or as a `?token=<secret>`
 *                       query param (for connector UIs that only accept a URL).
 *   PENCA_BASE_URL      (optional) override the Penca API base URL
 *
 * `GET /health` (unauthenticated) returns 200 for health checks.
 */

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';
const BEARER = process.env.MCP_BEARER_SECRET;

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

function authOk(header: string | undefined, queryToken: string | null): boolean {
  if (!BEARER) return true; // no guard configured
  let token: string | undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (m) token = m[1];
  else if (queryToken) token = queryToken;
  if (!token) return false;
  const provided = Buffer.from(token);
  const expected = Buffer.from(BEARER);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Register per-session sign-in tools bound to this session's client. */
function registerAuthTools(server: McpServer, client: PencaClient): void {
  server.tool(
    'penca_login',
    'Step 1 of sign-in: send a passwordless magic-link email to the given address. The email contains a one-time link; pass it (or its token) to penca_login_complete.',
    { email: z.string().email().describe('email address of the Penca account') },
    async ({ email }) => {
      try {
        const r = await client.sendMagicLink(email);
        return json({
          ...r,
          next: 'Check your email, then call penca_login_complete with the magic link (or its token).',
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
  server.tool(
    'penca_login_complete',
    'Step 2 of sign-in: complete the passwordless login with the magic-link URL (or the one-time token from it). Authenticates the current MCP session.',
    { tokenOrLink: z.string().min(1).describe('the magic-link URL from the email, or its token') },
    async ({ tokenOrLink }) => {
      try {
        await client.magicLogin(tokenOrLink);
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

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
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
    // Fresh per-session client + server. In-memory tokens, isolated per user.
    const client = new PencaClient({ tokens: new MemoryTokenStore(), baseUrl: process.env.PENCA_BASE_URL });
    const server = createServer(client);
    registerAuthTools(server, client);
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
    if (url.pathname !== MCP_PATH) {
      return sendJson(res, 404, { error: 'not found' });
    }
    if (!authOk(req.headers.authorization, url.searchParams.get('token'))) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }

    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'GET' || req.method === 'DELETE') return await handleSession(req, res);
    return sendJson(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`penca-ovacion MCP (Streamable HTTP, multi-user) listening on :${PORT}${MCP_PATH}`);
  if (!BEARER) {
    console.error('WARNING: MCP_BEARER_SECRET not set — the endpoint is unauthenticated');
  }
});
