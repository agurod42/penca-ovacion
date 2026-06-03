# penca-ovacion-mcp (`penca-mcp`)

A [Model Context Protocol](https://modelcontextprotocol.io) server for **Penca Antel
Ovación** (unofficial). Exposes the penca as tools to Claude and any MCP client.

## Setup

Authenticate once with the CLI (`penca login`), or set `PENCA_TOKEN` in the environment.
Then register the server:

```json
{
  "mcpServers": {
    "penca": {
      "command": "penca-mcp"
    }
  }
}
```

With `PENCA_TOKEN` instead of a stored session:

```json
{
  "mcpServers": {
    "penca": {
      "command": "penca-mcp",
      "env": { "PENCA_TOKEN": "<your-jwt>" }
    }
  }
}
```

## Tools

`penca_whoami`, `penca_update_profile`, `penca_tournaments`, `penca_matches`, `penca_match_statistics`,
`penca_ovi_prediction`, `penca_predict`, `penca_digest`, `penca_groups_mine`,
`penca_groups_public`, `penca_ranking`, `penca_wall_read`, `penca_wall_post`,
`penca_polls`, `penca_articles`, `penca_predictions`.

See the [repository README](https://github.com/aguro/penca-ovacion-cli#readme) for the
full toolkit. **Unofficial** — not affiliated with Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
