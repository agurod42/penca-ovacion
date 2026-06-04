# Build + run the penca-ovacion MCP server over Streamable HTTP.
# Monorepo build with pnpm (lockfileVersion 9 -> pnpm 9). keytar is an optional
# native dep of the SDK and is skipped here. better-sqlite3 backs the server's
# session store; we use a glibc base (bookworm-slim, not alpine/musl) so its
# prebuilt linux-arm64 binary installs without compiling under QEMU.
FROM node:20-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Install deps against the committed lockfile, then build sdk + mcp.
# `pnpm.onlyBuiltDependencies` (root package.json) lets better-sqlite3 run its
# install script to fetch the prebuilt native binary.
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter penca-ovacion-sdk build \
 && pnpm --filter penca-ovacion-mcp build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "packages/mcp/dist/http.js"]
