import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  target: 'node20',
  // Bundle the workspace SDK into the CLI so the published binary is standalone,
  // but keep node-built-ins and the optional native keytar external.
  noExternal: ['penca-ovacion-sdk'],
  external: ['keytar'],
  banner: { js: '#!/usr/bin/env node' },
});
