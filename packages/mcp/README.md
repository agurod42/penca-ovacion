# @1930dev/penca-ovacion-mcp (`penca-mcp`)

Un servidor [Model Context Protocol](https://modelcontextprotocol.io) para **Penca Antel
Ovación** (no oficial). Usá la penca desde Claude, Cursor, Codex o cualquier cliente MCP:
pronósticos, partidos, grupos, ranking, muro y más.

[![npm](https://img.shields.io/npm/v/@1930dev/penca-ovacion-mcp?color=cb0000&logo=npm)](https://www.npmjs.com/package/@1930dev/penca-ovacion-mcp)
[![Add to Cursor](https://img.shields.io/badge/Add%20to-Cursor-000000?logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=penca-ovacion&config=eyJ1cmwiOiJodHRwczovLzE5MzAuZGV2L3BlbmNhLW92YWNpb24vbWNwIn0=)
[![Add to VS Code](https://img.shields.io/badge/Add%20to-VS%20Code-007ACC?logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22penca-ovacion%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A//1930.dev/penca-ovacion/mcp%22%7D)

---

## Instalación

Hay dos formas. La **hosted no requiere instalar nada** y es la recomendada.

### Opción 1 — Hosted (recomendada, cero instalación)

El servidor ya está corriendo en `https://1930.dev/penca-ovacion/mcp` (Streamable HTTP).
No necesitás Node ni npm: solo agregás la URL como conector remoto.

**Claude (app web / desktop):** Settings → Connectors → *Add custom connector* → pegá la URL:

```
https://1930.dev/penca-ovacion/mcp
```

**Claude Code:**

```bash
claude mcp add --transport http penca-ovacion https://1930.dev/penca-ovacion/mcp
```

**Cursor / VS Code:** usá los botones de arriba (o pegá el deeplink). Cursor también acepta
en `mcp.json`:

```json
{ "mcpServers": { "penca-ovacion": { "url": "https://1930.dev/penca-ovacion/mcp" } } }
```

### Opción 2 — Local vía `npx` (stdio)

Para correrlo en tu máquina (útil en Claude Desktop, Codex o si querés apuntar a otra API).
Requiere **Node ≥ 20**.

**Claude Desktop** (`claude_desktop_config.json`) o cualquier cliente con `mcpServers`:

```json
{ "mcpServers": { "penca": { "command": "npx", "args": ["-y", "@1930dev/penca-ovacion-mcp"] } } }
```

**Claude Code:**

```bash
claude mcp add penca -- npx -y @1930dev/penca-ovacion-mcp
```

**Cursor (stdio):**
[![Add to Cursor (npx)](https://img.shields.io/badge/Add%20to-Cursor%20(npx)-000000?logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=penca-ovacion&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkAxOTMwZGV2L3BlbmNhLW92YWNpb24tbWNwIl19)
&nbsp;**VS Code (stdio):**
[![Add to VS Code (npx)](https://img.shields.io/badge/Add%20to-VS%20Code%20(npx)-007ACC?logo=visualstudiocode&logoColor=white)](vscode:mcp/install?%7B%22name%22%3A%22penca-ovacion%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%401930dev/penca-ovacion-mcp%22%5D%7D)

## Autenticación

El login es por usuario y pasa **dentro del MCP** (no hay credenciales en el server):

1. Llamá la tool **`penca_login`** con tu email → te llega un magic link al correo.
2. Llamá **`penca_login_complete`** con el link (o su token) → quedás autenticado en esa sesión.

Para CI o uso sin estado podés definir `PENCA_TOKEN` (y opcional `PENCA_REFRESH_TOKEN`) en el
entorno del server local (Opción 2) y saltarte el login.

## Herramientas

`penca_login`, `penca_login_complete`, `penca_whoami`, `penca_update_profile`,
`penca_tournaments`, `penca_matches`, `penca_match_statistics`, `penca_ovi_prediction`,
`penca_predict`, `penca_digest`, `penca_groups_mine`, `penca_groups_public`, `penca_ranking`,
`penca_wall_read`, `penca_wall_post`, `penca_polls`, `penca_articles`, `penca_predictions`.

## Analítica (opcional)

El despliegue *hosted* (Streamable HTTP) puede reportar uso agregado a
[OpenPanel](https://openpanel.dev) del lado del servidor. Está **apagado por defecto** y es
*fire-and-forget*: nunca demora ni rompe una respuesta de tool. Las corridas locales por
`stdio` no lo activan nunca.

Se habilita seteando `OPENPANEL_CLIENT_ID` y `OPENPANEL_CLIENT_SECRET` (ver
[`.env.example`](./.env.example)). Eventos emitidos: `mcp_server_started`,
`mcp_session_started` (en `initialize`) y `mcp_tool_called` (con tool, estado y duración en
buckets). No se guarda PII: el `profileId` es un hash anónimo y estable de `Origin + IP`, la
IP nunca se persiste en claro. `GET /analytics/stats` expone contadores de envío para
verificar que los eventos están llegando.

Mirá el [README del repositorio](https://github.com/agurod42/penca-ovacion#readme) para el
toolkit completo (SDK + CLI). **No oficial** — sin afiliación con Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
