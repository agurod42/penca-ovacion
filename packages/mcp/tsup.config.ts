import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node20',
  noExternal: ['penca-ovacion-sdk'],
  external: ['keytar', '@modelcontextprotocol/sdk', 'zod'],
  banner: { js: '#!/usr/bin/env node' },
});
