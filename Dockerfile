# Build + run the penca-ovacion MCP server over Streamable HTTP.
# Monorepo build with pnpm (lockfileVersion 9 -> pnpm 9). keytar is an optional
# native dep of the SDK and is skipped here; the hosted server uses PENCA_TOKEN
# (EnvTokenStore), so the OS keychain backend is never loaded.
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Install deps against the committed lockfile, then build sdk + mcp.
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter penca-ovacion-sdk build \
 && pnpm --filter penca-ovacion-mcp build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "packages/mcp/dist/http.js"]
