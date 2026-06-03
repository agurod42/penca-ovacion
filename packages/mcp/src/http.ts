import { createServer as createHttpServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

/**
 * Streamable HTTP entrypoint for the Penca Ovación MCP server.
 *
 * Exposes the same MCP server as `index.ts` (stdio) over HTTP so it can be
 * hosted behind a URL and used by remote MCP clients. Stateless mode: a fresh
 * server + transport is created per request.
 *
 * Env:
 *   PORT                 listen port (default 3000)
 *   MCP_PATH             request path for MCP (default /mcp)
 *   MCP_BEARER_SECRET    if set, requests must send `Authorization: Bearer <secret>`
 *   PENCA_TOKEN          (read by the SDK) the Penca access token this server acts as
 *   PENCA_REFRESH_TOKEN  (optional) refresh token
 *
 * A `GET /health` endpoint (unauthenticated) returns 200 for health checks.
 */

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';
const BEARER = process.env.MCP_BEARER_SECRET;

type Res = import('node:http').ServerResponse;

function sendJson(res: Res, status: number, obj: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function bearerOk(header: string | undefined): boolean {
  if (!BEARER) return true; // no guard configured
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const provided = Buffer.from(m[1]);
  const expected = Buffer.from(BEARER);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
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
    if (!bearerOk(req.headers.authorization)) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'method not allowed; use POST' });
    }

    const body = await readJsonBody(req);
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`penca-ovacion MCP (Streamable HTTP) listening on :${PORT}${MCP_PATH}`);
  if (!BEARER) {
    console.error('WARNING: MCP_BEARER_SECRET not set — the endpoint is unauthenticated');
  }
});
