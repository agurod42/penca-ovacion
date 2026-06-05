<h1 align="center">⚽ Penca Ovación toolkit</h1>

<p align="center">
  Toolkit no oficial para <b>Penca Antel Ovación</b> — el juego de pronósticos de fútbol más
  popular de Uruguay.<br/>
  Jugá la penca desde la terminal, tus scripts o un agente LLM:
  un <b>SDK</b> tipado, una <b>CLI</b> prolija y un <b>servidor MCP</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@1930dev/penca-ovacion-mcp"><img src="https://img.shields.io/npm/v/@1930dev/penca-ovacion-mcp?label=mcp&color=cb3837&logo=npm" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-ready-6E56CF" alt="MCP ready"></a>
  <img src="https://img.shields.io/badge/Made%20in-Uruguay%20%F0%9F%87%BA%F0%9F%87%BE-75AADB" alt="Made in Uruguay">
</p>

<p align="center">
  <b>Instalá el MCP en un clic</b> (servidor hosted, cero instalación):
</p>
<p align="center">
  <a href="#usando-el-servidor-mcp-claude-cursor-vs-code"><img src="https://img.shields.io/badge/Claude-Cómo_agregarlo-D97757?logo=anthropic&logoColor=white" alt="Add to Claude" height="32"></a>
  &nbsp;
  <a href="https://cursor.com/install-mcp?name=penca-ovacion&config=eyJ1cmwiOiJodHRwczovL3BlbmNhLW92YWNpb24uMTkzMC5kZXYvbWNwIn0="><img src="https://img.shields.io/badge/Add_to-Cursor-000000?logo=cursor&logoColor=white" alt="Add to Cursor" height="32"></a>
  &nbsp;
  <a href="https://insiders.vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22penca-ovacion%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fpenca-ovacion.1930.dev%2Fmcp%22%7D"><img src="https://img.shields.io/badge/VS_Code-Add_MCP-007ACC?logo=visualstudiocode&logoColor=white" alt="Add to VS Code" height="32"></a>
</p>

> [!WARNING]
> **No oficial.** Este proyecto no está afiliado ni respaldado por Ovación, Antel ni
> FutbolX. Habla con la misma API privada que usa la app móvil, hecha ingeniería inversa
> para interoperar. Usalo con responsabilidad y bajo tu propio riesgo, respetá los
> Términos del servicio y no le pegues a la API sin control. Tus credenciales y tokens
> nunca salen de tu máquina — van únicamente a la API oficial y se guardan localmente en
> el llavero (keychain) de tu sistema.

## Arranque rápido

Requiere **Node ≥ 20**.

```bash
# desde un clon (hasta que se publique en npm)
pnpm install
pnpm build
node packages/cli/dist/index.js --help

# o enlazá la CLI globalmente
pnpm --filter penca-ovacion exec npm link
penca --help
```

### Entrá y jugá

```bash
penca login                       # sin contraseña: te llega un email; pegás el código o el magic link
penca whoami
penca profile --nickname "bielsista"
penca tournaments
penca matches <tournamentId> --view upcoming
penca ovi <matchId>               # el pronóstico con IA de Ovi + su razonamiento
penca predict <matchId> 2 1       # pronosticá un 2-1
penca groups                      # tus grupos
penca ranking <groupId>
penca wall --group <groupId>
penca wall post "¡Vamos Uruguay!" --group <groupId>
penca polls
penca digest                      # el resumen diario de Ovi
```

Todos los comandos aceptan `--json` para salida procesable por máquina (ideal para scripts
y agentes), además de `--no-color`, `--base-url <url>` y `--debug`.

### Autenticación y guardado de tokens

El ingreso principal por email es **sin contraseña**: `penca login` te manda un correo que
trae **tanto un código corto (OTP) como un magic link**; pegás cualquiera de los dos en el
prompt y la CLI detecta automáticamente cuál es. Para automatizar, partilo en dos pasos:

```bash
penca login --email vos@example.com          # manda el email (te dice el próximo paso)
penca login --email vos@example.com --token "<código>"   # con el OTP del correo
penca login --token "<link-o-token>"         # o con el magic link / su token
```

También se soporta email + contraseña (`penca login --password`) y proveedores sociales
(`client.loginWithProvider({ provider, token })` en el SDK).

Los JWT resultantes (access + refresh) se guardan en el **llavero del sistema** (vía
`keytar`), con respaldo a un archivo `0600` en `~/.config/penca/tokens.json` cuando no hay
llavero disponible (Linux/CI). Los access tokens vencidos se renuevan automáticamente vía
`POST /auth/refresh`.

Para CI o uso sin estado, definí `PENCA_TOKEN` (y opcionalmente `PENCA_REFRESH_TOKEN`) y
tanto la CLI como el servidor MCP lo usan en lugar de la sesión guardada.

## Paquetes

| Paquete | Nombre | Qué es |
| --- | --- | --- |
| [`packages/sdk`](packages/sdk) | `penca-ovacion-sdk` | Cliente tipado en TypeScript para la API. Sin dependencias de CLI — la base sobre la que se construye todo lo demás. |
| [`packages/cli`](packages/cli) | `penca-ovacion` (`penca`) | El cliente de línea de comandos. |
| [`packages/mcp`](packages/mcp) | [`@1930dev/penca-ovacion-mcp`](https://www.npmjs.com/package/@1930dev/penca-ovacion-mcp) (`penca-mcp`) | Un servidor [Model Context Protocol](https://modelcontextprotocol.io) que expone la penca como herramientas para Claude y cualquier cliente MCP. Publicado en npm y disponible hosted. |
| [`skills/claude`](skills) | — | Un [Agent Skill](https://docs.claude.com) de Anthropic que envuelve la CLI. |

## Usando el SDK

```ts
import { PencaClient } from 'penca-ovacion-sdk';

const penca = new PencaClient(); // usa la sesión del llavero por defecto
await penca.login({ email: 'vos@example.com', password: '••••••' });

const tournaments = await penca.tournaments.list();
const { data: matches } = await penca.tournaments.matches(tournaments[0].id, { view: 'upcoming' });
await penca.matches.predict(matches[0].id, { homeScore: 2, awayScore: 1 });

// helper de paginación asíncrona
import { paginate, collect } from 'penca-ovacion-sdk';
const allPosts = await collect(paginate((page) => penca.wall.posts({ page, limit: 20 }), { limit: 20 }));
```

## Usando el servidor MCP (Claude, Cursor, VS Code)

Hay dos formas; el detalle completo está en [`packages/mcp/README.md`](packages/mcp).

### Hosted (recomendada, cero instalación)

El servidor ya corre en `https://penca-ovacion.1930.dev/mcp` (Streamable HTTP). El ingreso es
**OAuth 2.1 en el navegador**: tu cliente abre una ventana de login del propio servidor (email +
magic link), lo pegás una vez y la **sesión queda guardada** — no hace falta re-loguearse en cada
conversación, y el cliente maneja el token de forma nativa. Para cerrar sesión, llamá la tool
`penca_logout`. (Como fallback, si el cliente no hace OAuth, el login también funciona dentro del
MCP vía las tools `penca_login` / `penca_login_complete` para esa sesión.)

**Claude Code** — pegá el comando (o agregá la URL como conector remoto en Claude Desktop / claude.ai):

```bash
claude mcp add --transport http penca-ovacion https://penca-ovacion.1930.dev/mcp
```

**Cursor / VS Code** — un clic:

<p>
  <a href="https://cursor.com/install-mcp?name=penca-ovacion&config=eyJ1cmwiOiJodHRwczovL3BlbmNhLW92YWNpb24uMTkzMC5kZXYvbWNwIn0="><img src="https://img.shields.io/badge/Add_to-Cursor-000000?logo=cursor&logoColor=white" alt="Add to Cursor" height="32"></a>
  &nbsp;
  <a href="https://insiders.vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22penca-ovacion%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fpenca-ovacion.1930.dev%2Fmcp%22%7D"><img src="https://img.shields.io/badge/VS_Code-Add_MCP-007ACC?logo=visualstudiocode&logoColor=white" alt="Add to VS Code" height="32"></a>
</p>

### Local (stdio)

Corré el paquete publicado con `npx`; reutiliza la sesión de `penca login` (o `PENCA_TOKEN`).

**Claude Code**:

```bash
claude mcp add penca-ovacion -- npx -y @1930dev/penca-ovacion-mcp
```

**Cursor / VS Code** — un clic:

<p>
  <a href="https://cursor.com/install-mcp?name=penca-ovacion&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkAxOTMwZGV2L3BlbmNhLW92YWNpb24tbWNwIl19"><img src="https://img.shields.io/badge/Add_to-Cursor-000000?logo=cursor&logoColor=white" alt="Add to Cursor" height="32"></a>
  &nbsp;
  <a href="https://insiders.vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22penca-ovacion%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%401930dev%2Fpenca-ovacion-mcp%22%5D%7D"><img src="https://img.shields.io/badge/VS_Code-Add_MCP-007ACC?logo=visualstudiocode&logoColor=white" alt="Add to VS Code" height="32"></a>
</p>

O a mano en cualquier cliente MCP por config:

```json
{
  "mcpServers": {
    "penca": { "command": "npx", "args": ["-y", "@1930dev/penca-ovacion-mcp"] }
  }
}
```

Herramientas: `penca_whoami`, `penca_update_profile`, `penca_tournaments`, `penca_matches`,
`penca_match_statistics`, `penca_ovi_prediction`, `penca_predict`, `penca_digest`,
`penca_groups_mine`, `penca_groups_public`, `penca_ranking`, `penca_wall_read`,
`penca_wall_post`, `penca_polls`, `penca_articles`, `penca_predictions` (más `penca_login`,
`penca_login_complete` y `penca_logout` para gestionar la sesión).

## Desarrollo

```bash
pnpm install      # instala deps del workspace (permite builds nativos de keytar/esbuild)
pnpm build        # compila sdk → cli → mcp
pnpm test         # vitest en todos los paquetes
pnpm typecheck    # tsc --noEmit por paquete
pnpm lint         # biome
```

El repo es un workspace de [pnpm](https://pnpm.io). `npm`/`yarn` también funcionan, pero se
recomienda pnpm. El servidor MCP se publica en npm como
[`@1930dev/penca-ovacion-mcp`](https://www.npmjs.com/package/@1930dev/penca-ovacion-mcp)
(tag `mcp-v*` → CI lo publica); el SDK y la CLI todavía no están publicados, por ahora se
usan desde el clon.

## Extender a otros LLMs

El **servidor MCP es la integración universal con LLMs** — funciona con Claude y con
cualquier cliente compatible con MCP. El directorio `skills/` contiene los wrappers
específicos por proveedor (por ahora un skill de Anthropic); mirá
[`skills/README.md`](skills/README.md) para ver cómo agregar un wrapper con function-specs
de OpenAI u otros. Todos se apoyan en `penca-ovacion-sdk`, así que ninguna integración
reimplementa la API.

## Estado y hoja de ruta

Implementado: superficie de lectura completa, pronósticos, unirse/salir de grupos, publicar
en el muro, editar perfil y auth completa (magic link sin contraseña, email + contraseña,
proveedores sociales, refresh, logout) — todo verificado en vivo. Todavía no modelado (no se
observaron los endpoints): votar en encuestas, seguir/dejar de seguir, likes/comentarios en
posts — accesibles hoy vía el escape hatch genérico `client.request()` del SDK.

## Licencia

[MIT](LICENSE) © Agustín Rodríguez
