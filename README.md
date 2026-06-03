# Penca Ovación toolkit

Unofficial, community-built toolkit for **Penca Antel Ovación** — Uruguay's massively
popular football-prediction game. Use the penca from your terminal, your scripts, or an
LLM agent: a typed **SDK**, a polished **CLI**, and an **MCP server**.

```
┌─────────────────────────────────────────────────────────────┐
│  penca-ovacion-sdk   typed API client · auth · token storage  │
└───────┬─────────────────────────┬──────────────────────┬─────┘
        │                         │                      │
   penca-ovacion            penca-ovacion-mcp        skills/claude
   (CLI · `penca`)          (MCP · `penca-mcp`)      (Anthropic skill)
```

> [!WARNING]
> **Unofficial.** This project is not affiliated with, endorsed by, or supported by
> Ovación, Antel, or FutbolX. It talks to the same private API the mobile app uses,
> reverse-engineered for interoperability. Use it responsibly and at your own risk,
> respect the service's Terms of Service, and don't hammer the API. Your credentials
> and tokens never leave your machine — they go only to the official API and are stored
> locally in your OS keychain.

## Quick start

Requires **Node ≥ 20**.

```bash
# from a checkout (until published to npm)
pnpm install
pnpm build
node packages/cli/dist/index.js --help

# or link the CLI globally
pnpm --filter penca-ovacion exec npm link
penca --help
```

### Log in and play

```bash
penca login                       # passwordless: emails you a magic link, paste it back
penca whoami
penca profile --nickname "bielsista"
penca tournaments
penca matches <tournamentId> --view upcoming
penca ovi <matchId>               # Ovi's AI prediction + reasoning
penca predict <matchId> 2 1       # predict a 2-1
penca groups                      # your groups
penca ranking <groupId>
penca wall --group <groupId>
penca wall post "¡Vamos Uruguay!" --group <groupId>
penca polls
penca digest                      # Ovi's daily digest
```

Every command accepts `--json` for machine-readable output (ideal for scripts and
agents), plus `--no-color`, `--base-url <url>`, and `--debug`.

### Authentication & token storage

The primary email sign-in is **passwordless**: `penca login` emails you a magic link;
you paste the link (or its token) back into the prompt to complete sign-in. For
automation, split it across two steps:

```bash
penca login --email you@example.com          # sends the link (prints next step)
penca login --token "<link-or-token>"        # completes sign-in
```

Email + password (`penca login --password`) and social providers
(`client.loginWithProvider({ provider, token })` in the SDK) are also supported.

The resulting JWTs (access + refresh) are stored in your **OS keychain** (via `keytar`),
falling back to a `0600` file at `~/.config/penca/tokens.json` when no keychain is
available (Linux/CI). Expired access tokens are refreshed automatically via
`POST /auth/refresh`.

For CI or stateless use, set `PENCA_TOKEN` (and optionally `PENCA_REFRESH_TOKEN`) and
both the CLI and MCP server will use it instead of the stored session.

## Packages

| Package | Name | What it is |
| --- | --- | --- |
| [`packages/sdk`](packages/sdk) | `penca-ovacion-sdk` | Typed TypeScript client for the API. Zero CLI dependencies — the foundation everything else builds on. |
| [`packages/cli`](packages/cli) | `penca-ovacion` (`penca`) | The command-line client. |
| [`packages/mcp`](packages/mcp) | `penca-ovacion-mcp` (`penca-mcp`) | A [Model Context Protocol](https://modelcontextprotocol.io) server exposing the penca as tools to Claude and any MCP client. |
| [`skills/claude`](skills) | — | An Anthropic [Agent Skill](https://docs.claude.com) wrapping the CLI. |

## Using the SDK

```ts
import { PencaClient } from 'penca-ovacion-sdk';

const penca = new PencaClient(); // uses keychain session by default
await penca.login({ email: 'you@example.com', password: '••••••' });

const tournaments = await penca.tournaments.list();
const { data: matches } = await penca.tournaments.matches(tournaments[0].id, { view: 'upcoming' });
await penca.matches.predict(matches[0].id, { homeScore: 2, awayScore: 1 });

// async pagination helper
import { paginate, collect } from 'penca-ovacion-sdk';
const allPosts = await collect(paginate((page) => penca.wall.posts({ page, limit: 20 }), { limit: 20 }));
```

## Using the MCP server (Claude)

The MCP server reuses the session created by `penca login` (or `PENCA_TOKEN`). Add it to
Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "penca": {
      "command": "penca-mcp"
    }
  }
}
```

Tools: `penca_whoami`, `penca_update_profile`, `penca_tournaments`, `penca_matches`, `penca_match_statistics`,
`penca_ovi_prediction`, `penca_predict`, `penca_digest`, `penca_groups_mine`,
`penca_groups_public`, `penca_ranking`, `penca_wall_read`, `penca_wall_post`,
`penca_polls`, `penca_articles`, `penca_predictions`.

## Development

```bash
pnpm install      # install workspace deps (allows native keytar/esbuild builds)
pnpm build        # build sdk → cli → mcp
pnpm test         # vitest across all packages
pnpm typecheck    # tsc --noEmit per package
pnpm lint         # biome
```

The repo is a [pnpm](https://pnpm.io) workspace. `npm`/`yarn` also work but pnpm is
recommended. Package names are unscoped so the packages can be published without an npm
org; switch to a scope (e.g. `@you/penca-ovacion-*`) in each `package.json` if you prefer.

## Extending to other LLMs

The **MCP server is the universal LLM integration** — it works with Claude, and any
MCP-compatible client. The `skills/` directory holds vendor-specific wrappers (currently
an Anthropic skill); see [`skills/README.md`](skills/README.md) for how to add an OpenAI
function-spec wrapper or others. All of them build on `penca-ovacion-sdk`, so new surfaces
never re-implement the API.

## Status & roadmap

Implemented: full read surface, predictions, group join/leave, wall posting, profile
editing, and full auth (passwordless magic link, email+password, social providers, refresh,
logout) — all verified live. Not yet modeled (endpoints weren't observed): poll voting,
follow/unfollow, post likes/comments — reachable today via the SDK's generic
`client.request()` escape hatch.

## License

[MIT](LICENSE) © Agustín Rodríguez
