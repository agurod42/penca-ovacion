# Skills para LLMs

Wrappers específicos por proveedor que le permiten a los agentes LLM manejar la penca. Todos
se apoyan en el mismo `penca-ovacion-sdk` (directamente, vía la CLI `penca`, o vía el
servidor MCP), así que ninguna integración reimplementa la API.

## Qué hay acá

- [`claude/penca`](claude/penca/SKILL.md) — un
  [Agent Skill](https://docs.claude.com) de Anthropic. Le indica a Claude que maneje
  `penca … --json`. Instalalo copiando la carpeta `penca/` a tu directorio de skills (ej.
  `~/.claude/skills/`).

## El camino universal: MCP

Para la mayoría de las integraciones con LLMs, preferí el **servidor MCP**
(`@1930dev/penca-ovacion-mcp`) por sobre un wrapper a medida — ya expone cada capacidad como
herramientas tipadas y funciona con cualquier cliente compatible con MCP (Claude Desktop,
Claude Code y una lista creciente de otros). Mirá [`packages/mcp`](../packages/mcp).

## Agregar un wrapper para otro LLM

Elegí la superficie de integración que le sirva a la plataforma y después describí las
mismas capacidades:

1. **Specs de tools/function-calling (ej. OpenAI):** generá un JSON Schema por capacidad que
   llame a `penca <comando> --json`, o llamá a `penca-ovacion-sdk` desde un servidor chico.
   Mantené una función por método del SDK (`tournaments`, `matches`, `predict`, `groups`,
   `ranking`, `wall`, `polls`, `digest`, `predictions`).
2. **Archivos de prompt/skill:** reflejá [`claude/penca/SKILL.md`](claude/penca/SKILL.md) —
   listá los comandos `--json` y las mismas pautas de seguridad (confirmar las escrituras,
   nunca manejar la contraseña del usuario, no scrapear en masa).

Convenciones para cualquier wrapper nuevo:

- Solo lectura por defecto; pedí confirmación explícita del usuario antes de `predict` /
  `wall post` / `group join|leave`.
- Pedí siempre `--json` (o llamá al SDK) para salida estructurada.
- Nunca le pidas la contraseña al usuario — la autenticación es `penca login` o
  `PENCA_TOKEN`.

Abrí un PR agregando tu wrapper en `skills/<proveedor>/`.
