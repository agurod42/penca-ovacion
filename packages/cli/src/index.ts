import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerGroups } from './commands/groups.js';
import { registerMatches } from './commands/matches.js';
import { registerSocial } from './commands/social.js';

const program = new Command();

program
  .name('penca')
  .description('Unofficial command-line client for Penca Antel Ovación.')
  .version('0.1.0')
  .option('--json', 'output machine-readable JSON')
  .option('--no-color', 'disable colored output')
  .option('--base-url <url>', 'override the API base URL')
  .option('--debug', 'print full error stack traces')
  .showHelpAfterError();

registerAuth(program);
registerMatches(program);
registerGroups(program);
registerSocial(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
