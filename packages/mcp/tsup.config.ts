import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/http.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node20',
  noExternal: ['penca-ovacion-sdk'],
  external: ['keytar', 'better-sqlite3', '@modelcontextprotocol/sdk', 'zod'],
  banner: { js: '#!/usr/bin/env node' },
});
