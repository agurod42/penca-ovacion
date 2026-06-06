# CLAUDE.md — Penca Ovación toolkit

Guide for agents working in this repo. These rules **override** default behavior.
If anything here contradicts what you were going to do, these rules win.

## What it is

**Unofficial** toolkit for Penca Antel Ovación. Talks to the **private API** of the mobile app,
obtained through reverse engineering. pnpm monorepo with three chained packages:

```
packages/sdk  →  packages/cli  →  packages/mcp
penca-ovacion-sdk   penca-ovacion (bin: penca)   @1930dev/penca-ovacion-mcp (bin: penca-mcp)
```

Plus `skills/` (per-LLM-provider wrappers, currently one Anthropic Agent Skill).

## Architecture — hard rules

- **The SDK is the only layer that talks to the API.** The CLI and MCP **never** `fetch`
  the API directly or reimplement endpoints: everything goes through `penca-ovacion-sdk`. The same
  applies to any new skill or integration.
- **Dependency direction:** `sdk ← cli ← mcp`. Never the other way around. The SDK does not import
  anything from CLI or MCP and keeps its runtime dependencies minimal (keytar is optional/lazy).
- **New API endpoint** → add it as a typed method in the corresponding resource under
  `packages/sdk/src/resources/`, export the types in `packages/sdk/src/index.ts`, and only then
  consume it from CLI/MCP. For something one-off or not yet modelled, use the escape hatch
  `client.request()` instead of hardcoding a fetch.
- **MCP:** each tool is registered in `packages/mcp/src/server.ts` with a **zod** schema and
  delegates to the SDK. The MCP is **read-only by default**: write tools (`penca_predict`,
  `penca_wall_post`, `penca_update_profile`, etc.) must be confirmed with the user before
  executing — that is in the server instructions; do not break it.
- **CLI:** commands with `commander` in `packages/cli/src/commands/`. **Every command accepts
  `--json`** (machine-readable output) in addition to the global flags `--no-color`, `--base-url`,
  `--debug`. If you add a command, keep that convention.

## Code conventions

- **Pure ESM.** Relative imports carry an explicit `.js` extension (even when the file is `.ts`).
  Node modules use the `node:` prefix (required by biome: `useNodejsImportProtocol`).
- **TypeScript** compiled with `tsup`; `tsc --noEmit` for typechecking.
- **Biome** formats and lints: single quotes, always semicolons, trailing commas everywhere,
  2-space indent, 100-character line width. Don't fight the formatter: run `pnpm format`.
- **Language:** comments and names in **English**; user-facing docs (READMEs) in
  **Rioplatense Spanish**. Keep that split.
- **Tests** with vitest. The SDK tests against a `mock-fetch` with fixtures — **never** hit the
  real API in tests.

## Gates before committing

Run and leave green, in this order, before considering a change done:

```bash
pnpm install      # workspace (enables native builds: keytar, better-sqlite3, esbuild)
pnpm build        # compiles sdk → cli → mcp (order matters)
pnpm typecheck
pnpm test
pnpm lint         # or `pnpm format` for autofix
```

pnpm is the recommended package manager (this is a pnpm workspace). Do not add a `package-lock.json`
or a `yarn.lock`.

## Security and data — non-negotiable

This project handles **real user auth tokens** and talks to a **private API**.

- **Never commit** credentials, JWTs, access/refresh tokens, OAuth client secrets, or session
  cookies. There is a PII-gate hook that runs Haiku over the staged diff; pre-empt before it fires.
- **Never log tokens** or write them to disk outside the intended store. User tokens live in the
  OS keychain (keytar) with a fallback to a `0600` file; the hosted MCP persists them encrypted in
  SQLite. Do not move them to `.env`, logs, or stdout.
- **No real PII in fixtures, tests, docs, or commit messages.** Use synthetic data:
  emails `persona@example.test`, names `Persona Prueba`, IDs `11111111`. Do not include real names
  tied to identifiers, Uruguayan CIs, or third-party data.
- **Secrets** (deploy, analytics, etc.) are read at runtime with the `infisical-secret` wrapper —
  never plain `infisical` or a committed `.env`.
- Do not expose more of the app's fingerprint than necessary (headers `app-version`, `user-agent`,
  base URL live in `packages/sdk/src/client.ts`): keep them there, do not scatter them.

## Etiquette with the unofficial API

- This is reverse-engineered from a private API: **do not hammer it**. No unbounded loops,
  mass scraping, or loads that look like abuse. Respect the Terms of Service.
- If you discover a new endpoint by observing traffic, model it in the SDK with synthetic data in
  the tests; do not hit production just to "see what it returns" beyond the bare minimum.

## Documentation — keep it in sync

When you change tools, commands, or auth, update **in the same change**:

- `README.md` (root) — repo landing page.
- `packages/mcp/README.md` — MCP package docs.
- The **tool list** appears in both READMEs and in `server.ts`: if you add/remove a tool,
  update all three.
- **Canonical URL of the hosted MCP: `https://penca-ovacion.1930.dev/mcp`** (subdomain, not
  `1930.dev/penca-ovacion/mcp`). The source of truth is `packages/mcp/src/oauth/config.ts`. If you
  touch install buttons, the base64/deeplinks for Cursor and VS Code encode that URL —
  regenerate them, do not edit by hand.

## Publishing

Only the MCP is published to npm (`@1930dev/penca-ovacion-mcp`), via tag `mcp-v*` → CI. The SDK and
CLI are not yet published: they are used from the clone. Do not publish manually.
