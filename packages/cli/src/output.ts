import Table from 'cli-table3';
import pc from 'picocolors';

let jsonMode = false;
let colorEnabled = true;

export function configureOutput(opts: { json?: boolean; color?: boolean }): void {
  jsonMode = Boolean(opts.json);
  colorEnabled = opts.color !== false;
  if (!colorEnabled) process.env.NO_COLOR = '1';
}

export function isJson(): boolean {
  return jsonMode;
}

export const c = pc;

/**
 * Emit a result. In `--json` mode, prints `data` as JSON. Otherwise runs the
 * `human` renderer for a friendly terminal view.
 */
export function emit(data: unknown, human: () => void): void {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  human();
}

export function heading(text: string): void {
  if (!jsonMode) console.log(pc.bold(pc.cyan(text)));
}

export function info(text: string): void {
  if (!jsonMode) console.log(text);
}

export function success(text: string): void {
  if (!jsonMode) console.log(pc.green(`✔ ${text}`));
}

export function table(head: string[], rows: (string | number)[][]): void {
  if (jsonMode) return;
  const t = new Table({
    head: head.map((h) => pc.bold(h)),
    style: { head: [], border: colorEnabled ? ['dim'] : [] },
  });
  for (const row of rows) t.push(row.map((v) => String(v)));
  console.log(t.toString());
}

export function fail(message: string, code = 1): never {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  } else {
    console.error(pc.red(`✖ ${message}`));
  }
  process.exit(code);
}
