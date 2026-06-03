# penca-ovacion-mcp (`penca-mcp`)

Un servidor [Model Context Protocol](https://modelcontextprotocol.io) para **Penca Antel
Ovación** (no oficial). Expone la penca como herramientas para Claude y cualquier cliente
MCP.

## Configuración

Autenticate una vez con la CLI (`penca login`), o definí `PENCA_TOKEN` en el entorno.
Después registrá el servidor:

```json
{
  "mcpServers": {
    "penca": {
      "command": "penca-mcp"
    }
  }
}
```

Con `PENCA_TOKEN` en lugar de una sesión guardada:

```json
{
  "mcpServers": {
    "penca": {
      "command": "penca-mcp",
      "env": { "PENCA_TOKEN": "<tu-jwt>" }
    }
  }
}
```

## Herramientas

`penca_whoami`, `penca_update_profile`, `penca_tournaments`, `penca_matches`,
`penca_match_statistics`, `penca_ovi_prediction`, `penca_predict`, `penca_digest`,
`penca_groups_mine`, `penca_groups_public`, `penca_ranking`, `penca_wall_read`,
`penca_wall_post`, `penca_polls`, `penca_articles`, `penca_predictions`.

Mirá el [README del repositorio](https://github.com/agurod42/penca-ovacion#readme) para el
toolkit completo. **No oficial** — sin afiliación con Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
