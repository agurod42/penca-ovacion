import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PencaClient } from 'penca-ovacion-sdk';
import { z } from 'zod';
import { buildClient } from './client.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function json(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Wrap a handler so SDK errors become readable tool errors instead of crashes. */
function guard<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  };
}

const pagination = {
  page: z.number().int().positive().optional().describe('1-indexed page number'),
  limit: z.number().int().positive().optional().describe('page size'),
};

export function createServer(client: PencaClient = buildClient()): McpServer {
  const server = new McpServer({ name: 'penca-ovacion', version: '0.1.0' });

  server.tool(
    'penca_whoami',
    'Show the authenticated Penca account.',
    {},
    guard(async () => json(await client.me())),
  );

  server.tool(
    'penca_update_profile',
    'Update your profile (nickname, full name, country). Returns the updated account.',
    {
      nickname: z.string().optional(),
      fullName: z.string().optional(),
      country: z.string().optional(),
    },
    guard(async ({ nickname, fullName, country }) =>
      json(await client.updateProfile({ nickname, fullName, country })),
    ),
  );

  server.tool(
    'penca_tournaments',
    'List available tournaments.',
    {},
    guard(async () => json(await client.tournaments.list())),
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
    guard(async ({ tournamentId, view, groupId, page, limit }) =>
      json(await client.tournaments.matches(tournamentId, { view, groupId, page, limit })),
    ),
  );

  server.tool(
    'penca_match_statistics',
    'Aggregate prediction statistics for a match.',
    { matchId: z.string(), groupId: z.string().optional() },
    guard(async ({ matchId, groupId }) =>
      json(await client.matches.statistics(matchId, { groupId })),
    ),
  );

  server.tool(
    'penca_ovi_prediction',
    "Ovi's AI score prediction and reasoning for a match.",
    { matchId: z.string() },
    guard(async ({ matchId }) => json(await client.matches.oviPrediction(matchId))),
  );

  server.tool(
    'penca_predict',
    'Submit (or overwrite) your score prediction for a match.',
    { matchId: z.string(), homeScore: z.number().int().min(0), awayScore: z.number().int().min(0) },
    guard(async ({ matchId, homeScore, awayScore }) =>
      json(await client.matches.predict(matchId, { homeScore, awayScore })),
    ),
  );

  server.tool(
    'penca_digest',
    "Ovi's daily AI digest.",
    { kind: z.string().optional() },
    guard(async ({ kind }) => json(await client.home.oviDigest(kind ?? 'home'))),
  );

  server.tool(
    'penca_groups_mine',
    'Groups you belong to.',
    pagination,
    guard(async ({ page, limit }) => json(await client.groups.mine({ page, limit }))),
  );

  server.tool(
    'penca_groups_public',
    'Public/featured groups you can join.',
    pagination,
    guard(async ({ page, limit }) => json(await client.groups.public({ page, limit }))),
  );

  server.tool(
    'penca_ranking',
    'Leaderboard for a group.',
    { groupId: z.string(), ...pagination },
    guard(async ({ groupId, page, limit }) =>
      json(await client.groups.ranking(groupId, { page, limit })),
    ),
  );

  server.tool(
    'penca_wall_read',
    'Read social wall posts, optionally scoped to a group.',
    { groupId: z.string().optional(), ...pagination },
    guard(async ({ groupId, page, limit }) =>
      json(await client.wall.posts({ groupId, page, limit })),
    ),
  );

  server.tool(
    'penca_wall_post',
    'Publish a post to a group wall.',
    { content: z.string(), groupId: z.string() },
    guard(async ({ content, groupId }) => json(await client.wall.post({ content, groupId }))),
  );

  server.tool(
    'penca_polls',
    'List active polls.',
    {},
    guard(async () => json(await client.polls.list())),
  );

  server.tool(
    'penca_articles',
    'List news articles.',
    pagination,
    guard(async ({ page, limit }) => json(await client.articles.list({ page, limit }))),
  );

  server.tool(
    'penca_predictions',
    "A user's predictions and stats (defaults to yourself).",
    { userId: z.string().optional(), groupId: z.string().optional(), ...pagination },
    guard(async ({ userId, groupId, page, limit }) => {
      const id = userId ?? (await client.me()).id;
      return json(await client.users.predictions(id, { groupId, page, limit }));
    }),
  );

  return server;
}
