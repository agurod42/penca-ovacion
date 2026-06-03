import type { Command } from 'commander';
import type { PencaClient } from 'penca-ovacion-sdk';
import { type GlobalOptions, makeClient, setDebug } from '../context.js';
import { configureOutput } from '../output.js';

/** Wire up output/debug from global flags and return a ready client. */
export function setup(cmd: Command): { client: PencaClient; opts: GlobalOptions } {
  const opts = cmd.optsWithGlobals() as GlobalOptions & Record<string, unknown>;
  configureOutput({ json: opts.json, color: opts.color });
  setDebug(Boolean(opts.debug));
  return { client: makeClient(opts), opts };
}

/** Parse a 1-based integer option with a fallback. */
export function int(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Format an ISO date as a short local-ish string. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}
