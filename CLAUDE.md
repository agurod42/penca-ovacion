# CLAUDE.md — Penca Ovación toolkit

Guía para agentes que trabajan en este repo. Estas reglas **mandan** sobre el comportamiento
por defecto. Si algo acá contradice lo que ibas a hacer, ganan estas reglas.

## Qué es

Toolkit **no oficial** para Penca Antel Ovación. Habla con la **API privada** de la app móvil,
obtenida por ingeniería inversa. Monorepo pnpm con tres paquetes encadenados:

```
packages/sdk  →  packages/cli  →  packages/mcp
penca-ovacion-sdk   penca-ovacion (bin: penca)   @1930dev/penca-ovacion-mcp (bin: penca-mcp)
```

Más `skills/` (wrappers por proveedor de LLM, hoy un Agent Skill de Anthropic).

## Arquitectura — reglas duras

- **El SDK es la única capa que habla con la API.** La CLI y el MCP **nunca** hacen `fetch`
  a la API ni reimplementan endpoints: todo pasa por `penca-ovacion-sdk`. Lo mismo vale para
  cualquier skill o integración nueva.
- **Dirección de dependencias:** `sdk ← cli ← mcp`. Nunca al revés. El SDK no importa nada de
  CLI ni de MCP y mantiene sus dependencias de runtime al mínimo (keytar es opcional/lazy).
- **Endpoint nuevo de la API** → agregalo como método tipado en el resource correspondiente de
  `packages/sdk/src/resources/`, exportá los tipos en `packages/sdk/src/index.ts`, y recién
  ahí consumilo desde CLI/MCP. Para algo puntual o aún no modelado, usá el escape hatch
  `client.request()` en vez de hardcodear un fetch.
- **MCP:** cada tool se registra en `packages/mcp/src/server.ts` con schema **zod** y delega en
  el SDK. El MCP es **read-only por defecto**: las tools de escritura (`penca_predict`,
  `penca_wall_post`, `penca_update_profile`, etc.) deben confirmarse con la persona antes de
  ejecutarse — eso está en las instrucciones del server, no lo rompas.
- **CLI:** comandos con `commander` en `packages/cli/src/commands/`. **Todo comando acepta
  `--json`** (salida procesable) además de los flags globales `--no-color`, `--base-url`,
  `--debug`. Si agregás un comando, mantené esa convención.

## Convenciones de código

- **ESM puro.** Imports relativos llevan extensión explícita `.js` (aunque el archivo sea
  `.ts`). Módulos de Node con prefijo `node:` (lo exige biome: `useNodejsImportProtocol`).
- **TypeScript** compilado con `tsup`; `tsc --noEmit` para typecheck.
- **Biome** formatea y lintea: comillas simples, punto y coma siempre, trailing commas en todo,
  indent de 2 espacios, ancho de línea 100. No pelees con el formateador: corré `pnpm format`.
- **Idioma:** comentarios y nombres en **inglés**; docs de cara al usuario (READMEs) en
  **español rioplatense**. Mantené esa división.
- **Tests** con vitest. El SDK testea contra un `mock-fetch` con fixtures — **nunca** pegues a
  la API real en tests.

## Gates antes de commitear

Corré y dejá en verde, en este orden, antes de dar por terminado un cambio:

```bash
pnpm install      # workspace (habilita builds nativos: keytar, better-sqlite3, esbuild)
pnpm build        # compila sdk → cli → mcp (el orden importa)
pnpm typecheck
pnpm test
pnpm lint         # o `pnpm format` para autofix
```

pnpm es el gestor recomendado (es un workspace pnpm). No agregues un `package-lock.json` ni un
`yarn.lock`.

## Seguridad y datos — innegociable

Este proyecto maneja **tokens de auth de usuarios reales** y habla con una **API privada**.

- **Nunca commitees** credenciales, JWTs, access/refresh tokens, OAuth client secrets ni
  cookies de sesión. Hay un PII-gate hook que corre Haiku sobre el diff staged; pre-empt antes
  que dispare.
- **Nunca loguees tokens** ni los escribas a disco fuera del store previsto. Los tokens de
  usuario viven en el llavero del SO (keytar) con fallback a archivo `0600`; el MCP hosted los
  persiste cifrados en SQLite. No los muevas a `.env`, logs ni stdout.
- **Sin PII real en fixtures, tests, docs ni mensajes de commit.** Usá datos sintéticos:
  emails `persona@example.test`, nombres `Persona Prueba`, CIs `11111111`. No metas nombres
  reales atados a identificadores, CIs uruguayas, ni datos de terceros.
- **Secrets** (deploy, analytics, etc.) se leen en runtime con el wrapper `infisical-secret`,
  nunca `infisical` pelado ni `.env` commiteado.
- No expongas más de lo necesario de la huella de la app (headers `app-version`, `user-agent`,
  base URL viven en `packages/sdk/src/client.ts`): mantenelos ahí, no los esparzas.

## Etiqueta con la API no oficial

- Es ingeniería inversa de una API privada: **no la martilles**. Nada de loops sin control,
  scraping masivo ni cargas que parezcan abuso. Respetá los Términos del servicio.
- Si descubrís un endpoint nuevo observando tráfico, modelalo en el SDK con datos sintéticos en
  los tests; no pegues a producción para "ver qué devuelve" más de lo mínimo necesario.

## Documentación — mantenela sincronizada

Cuando cambies tools, comandos o auth, actualizá **en el mismo cambio**:

- `README.md` (raíz) — landing del repo.
- `packages/mcp/README.md` — doc del paquete MCP.
- La **lista de tools** aparece en ambos READMEs y en `server.ts`: si agregás/quitás una tool,
  actualizá las tres.
- **URL canónica del MCP hosted: `https://penca-ovacion.1930.dev/mcp`** (subdominio, no
  `1930.dev/penca-ovacion/mcp`). La fuente de verdad es `packages/mcp/src/oauth/config.ts`. Si
  tocás botones de instalación, los base64/deeplinks de Cursor y VS Code codifican esa URL —
  regeneralos, no los edites a ojo.

## Publicación

Solo el MCP se publica en npm (`@1930dev/penca-ovacion-mcp`), vía tag `mcp-v*` → CI. El SDK y
la CLI todavía no se publican: se usan desde el clon. No publiques a mano.
