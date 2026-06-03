import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PencaClient } from 'penca-ovacion-sdk';
import { z } from 'zod';
import * as analytics from './analytics.js';
import { buildClient } from './client.js';

/** Load the server icon (bundled at packages/mcp/assets/icon.svg) as a data URI
 *  so it can be advertised in serverInfo.icons without depending on a host. */
function loadIconDataUri(): string | undefined {
  try {
    const svg = readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return undefined;
  }
}
const ICON_DATA_URI = loadIconDataUri();

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function json(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * Wrap a tool handler so SDK errors become readable tool errors instead of
 * crashes, and every call emits a fire-and-forget `mcp_tool_called` analytics
 * event (status + bucketed duration). Analytics is a no-op unless the HTTP
 * entrypoint armed it, so stdio runs pay nothing.
 */
function guard<A>(
  tool: string,
  fn: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    const start = performance.now();
    let status: 'ok' | 'error' = 'ok';
    try {
      const result = await fn(args);
      if (result.isError) status = 'error';
      return result;
    } catch (err) {
      status = 'error';
      return {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    } finally {
      analytics.trackTool(tool, status, performance.now() - start);
    }
  };
}

const pagination = {
  page: z.number().int().positive().optional().describe('1-indexed page number'),
  limit: z.number().int().positive().optional().describe('page size'),
};

export function createServer(client: PencaClient = buildClient()): McpServer {
  const server = new McpServer({
    name: 'penca-ovacion',
    title: 'Penca Ovación',
    version: '0.1.0',
    websiteUrl: 'https://1930.dev',
    ...(ICON_DATA_URI ? { icons: [{ src: ICON_DATA_URI, mimeType: 'image/svg+xml' }] } : {}),
  });

  server.tool(
    'penca_whoami',
    'Show the authenticated Penca account.',
    {},
    guard('penca_whoami', async () => json(await client.me())),
  );

  server.tool(
    'penca_update_profile',
    'Update your profile (nickname, full name, country). Returns the updated account.',
    {
      nickname: z.string().optional(),
      fullName: z.string().optional(),
      country: z.string().optional(),
    },
    guard('penca_update_profile', async ({ nickname, fullName, country }) =>
      json(await client.updateProfile({ nickname, fullName, country })),
    ),
  );

  server.tool(
    'penca_tournaments',
    'List available tournaments.',
    {},
    guard('penca_tournaments', async () => json(await client.tournaments.list())),
  );

  server.tool(
    'penca_matches',
    'List matches for a tournament (view: upcoming|finished).',
    {
      tournamentId: z.string().describe('tournament id'),
      view: z.enum(['upcoming', 'finished']).optional(),
      groupId: z.string().optional(),
      ...pagination,
    },
    guard('penca_matches', async ({ tournamentId, view, groupId, page, limit }) =>
      json(await client.tournaments.matches(tournamentId, { view, groupId, page, limit })),
    ),
  );

  server.tool(
    'penca_match_statistics',
    'Aggregate prediction statistics for a match.',
    { matchId: z.string(), groupId: z.string().optional() },
    guard('penca_match_statistics', async ({ matchId, groupId }) =>
      json(await client.matches.statistics(matchId, { groupId })),
    ),
  );

  server.tool(
    'penca_ovi_prediction',
    "Ovi's AI score prediction and reasoning for a match.",
    { matchId: z.string() },
    guard('penca_ovi_prediction', async ({ matchId }) =>
      json(await client.matches.oviPrediction(matchId)),
    ),
  );

  server.tool(
    'penca_predict',
    'Submit (or overwrite) your score prediction for a match.',
    { matchId: z.string(), homeScore: z.number().int().min(0), awayScore: z.number().int().min(0) },
    guard('penca_predict', async ({ matchId, homeScore, awayScore }) =>
      json(await client.matches.predict(matchId, { homeScore, awayScore })),
    ),
  );

  server.tool(
    'penca_digest',
    "Ovi's daily AI digest.",
    { kind: z.string().optional() },
    guard('penca_digest', async ({ kind }) => json(await client.home.oviDigest(kind ?? 'home'))),
  );

  server.tool(
    'penca_groups_mine',
    'Groups you belong to.',
    pagination,
    guard('penca_groups_mine', async ({ page, limit }) =>
      json(await client.groups.mine({ page, limit })),
    ),
  );

  server.tool(
    'penca_groups_public',
    'Public/featured groups you can join.',
    pagination,
    guard('penca_groups_public', async ({ page, limit }) =>
      json(await client.groups.public({ page, limit })),
    ),
  );

  server.tool(
    'penca_ranking',
    'Leaderboard for a group.',
    { groupId: z.string(), ...pagination },
    guard('penca_ranking', async ({ groupId, page, limit }) =>
      json(await client.groups.ranking(groupId, { page, limit })),
    ),
  );

  server.tool(
    'penca_wall_read',
    'Read social wall posts, optionally scoped to a group.',
    { groupId: z.string().optional(), ...pagination },
    guard('penca_wall_read', async ({ groupId, page, limit }) =>
      json(await client.wall.posts({ groupId, page, limit })),
    ),
  );

  server.tool(
    'penca_wall_post',
    'Publish a post to a group wall.',
    { content: z.string(), groupId: z.string() },
    guard('penca_wall_post', async ({ content, groupId }) =>
      json(await client.wall.post({ content, groupId })),
    ),
  );

  server.tool(
    'penca_polls',
    'List active polls.',
    {},
    guard('penca_polls', async () => json(await client.polls.list())),
  );

  server.tool(
    'penca_articles',
    'List news articles.',
    pagination,
    guard('penca_articles', async ({ page, limit }) =>
      json(await client.articles.list({ page, limit })),
    ),
  );

  server.tool(
    'penca_predictions',
    "A user's predictions and stats (defaults to yourself).",
    { userId: z.string().optional(), groupId: z.string().optional(), ...pagination },
    guard('penca_predictions', async ({ userId, groupId, page, limit }) => {
      const id = userId ?? (await client.me()).id;
      return json(await client.users.predictions(id, { groupId, page, limit }));
    }),
  );

  return server;
}
