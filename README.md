# Penca Ovación toolkit

Toolkit no oficial para **Penca Antel Ovación** — el juego de pronósticos de fútbol más
popular de Uruguay. Usá la penca desde la terminal, desde tus
scripts o desde un agente LLM: un **SDK** tipado, una **CLI** prolija y un **servidor MCP**.

```
┌─────────────────────────────────────────────────────────────┐
│  penca-ovacion-sdk   cliente tipado · auth · guardado de tokens │
└───────┬─────────────────────────┬──────────────────────┬─────┘
        │                         │                      │
   penca-ovacion            penca-ovacion-mcp        skills/claude
   (CLI · `penca`)          (MCP · `penca-mcp`)      (skill de Claude)
```

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
penca login                       # sin contraseña: te manda un magic link, lo pegás de vuelta
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

El ingreso principal por email es **sin contraseña**: `penca login` te manda un magic link
por correo; pegás el link (o su token) en el prompt para completar el ingreso. Para
automatizar, partilo en dos pasos:

```bash
penca login --email vos@example.com          # manda el link (te dice el próximo paso)
penca login --token "<link-o-token>"         # completa el ingreso
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

## Usando el servidor MCP (Claude)

Hay dos formas; el detalle completo está en [`packages/mcp/README.md`](packages/mcp).

**Hosted (recomendada, cero instalación).** El servidor ya corre en
`https://1930.dev/penca-ovacion/mcp` (Streamable HTTP). Agregá la URL como conector remoto en
Claude, o:

```bash
claude mcp add --transport http penca-ovacion https://1930.dev/penca-ovacion/mcp
```

El ingreso pasa **dentro del MCP**, sin credenciales en el server: la tool `penca_login` te
manda un magic link y `penca_login_complete` lo completa para esa sesión.

**Local (stdio).** Corré el paquete publicado con `npx`; reutiliza la sesión de `penca login`
(o `PENCA_TOKEN`):

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
`penca_wall_post`, `penca_polls`, `penca_articles`, `penca_predictions` (más `penca_login` y
`penca_login_complete` en el modo hosted).

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
