# LLM skills

Vendor-specific wrappers that let LLM agents drive the penca. They all sit on top of the
same `penca-ovacion-sdk` (directly, via the `penca` CLI, or via the MCP server), so no
agent integration re-implements the API.

## What's here

- [`claude/penca`](claude/penca/SKILL.md) — an Anthropic
  [Agent Skill](https://docs.claude.com). It instructs Claude to drive `penca … --json`.
  Install by copying the `penca/` folder into your skills directory (e.g.
  `~/.claude/skills/`).

## The universal path: MCP

For most LLM integrations, prefer the **MCP server** (`penca-ovacion-mcp`) over a
bespoke wrapper — it already exposes every capability as typed tools and works with any
MCP-compatible client (Claude Desktop, Claude Code, and a growing list of others). See
[`packages/mcp`](../packages/mcp).

## Adding a wrapper for another LLM

Pick the integration surface that fits the platform, then describe the same capabilities:

1. **Tool/function-calling specs (e.g. OpenAI):** generate a JSON Schema per capability
   that shells out to `penca <command> --json`, or call `penca-ovacion-sdk` from a small
   server. Keep one function per SDK method (`tournaments`, `matches`, `predict`,
   `groups`, `ranking`, `wall`, `polls`, `digest`, `predictions`).
2. **Prompt/skill files:** mirror [`claude/penca/SKILL.md`](claude/penca/SKILL.md) — list
   the `--json` commands and the same safety guidance (confirm writes, never handle the
   user's password, don't bulk-scrape).

Conventions for any new wrapper:

- Read-only by default; require explicit user confirmation before `predict` / `wall post`
  / `group join|leave`.
- Always request `--json` (or call the SDK) for structured output.
- Never ask the user for their password — authentication is `penca login` or `PENCA_TOKEN`.

Open a PR adding your wrapper under `skills/<vendor>/`.
