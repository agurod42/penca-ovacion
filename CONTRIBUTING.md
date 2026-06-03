# Contributing

Thanks for helping improve the Penca Ovación toolkit!

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Project layout

- `packages/sdk` — the typed API client. **Every new endpoint starts here.** Add the
  method to the relevant resource (or a new one), add types in `src/types.ts`, and add a
  unit test driven by the mocked fetch in `test/`.
- `packages/cli` — thin command layer over the SDK. Keep formatting in `src/output.ts`;
  every command must support `--json`.
- `packages/mcp` — register a tool in `src/server.ts` mirroring the SDK method.
- `skills/` — LLM-specific wrappers over the CLI/MCP.

## Ground rules

- **Never commit credentials, tokens, or raw network captures** (`*.mitm`, `*.har` are
  git-ignored). Test fixtures must use **synthetic** data only — no real users' personal
  information, no real emails/IDs.
- Run `pnpm lint` and `pnpm test` before opening a PR; CI runs typecheck + lint + test +
  build.
- Match the existing code style (Biome enforces formatting).
- Be a good API citizen: don't add anything that hammers the API or scrapes other users'
  data en masse.

## Adding a new endpoint

1. Capture/confirm the request and response shape.
2. SDK: add the resource method + types + a test.
3. CLI: add a command (human view + `--json`).
4. MCP: add a tool.
5. Update the README endpoint list if relevant.
