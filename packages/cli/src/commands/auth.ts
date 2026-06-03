import { isCancel, password as passwordPrompt, text } from '@clack/prompts';
import type { Command } from 'commander';
import { type LoginResult, type PencaClient, decodeJwt } from 'penca-ovacion-sdk';
import { requireAuth, run } from '../context.js';
import { c, emit, fail, heading, info, success } from '../output.js';
import { setup } from './helpers.js';

/** Resolve the logged-in user and print a friendly confirmation. */
async function finishLogin(
  client: PencaClient,
  result: LoginResult,
  json?: boolean,
): Promise<void> {
  const user = result.user ?? (await client.me().catch(() => undefined));
  if (json) {
    emit({ ok: true, user }, () => {});
    return;
  }
  success(`Logged in${user ? ` as ${c.bold(user.nickname)} (${user.email})` : ''}.`);
}

export function registerAuth(program: Command): void {
  program
    .command('login')
    .description('Authenticate (passwordless magic link by default)')
    .option('-e, --email <email>', 'account email (otherwise prompted)')
    .option('--password [password]', 'use email + password instead of a magic link')
    .option('--token <token>', 'complete a magic-link login non-interactively (token or full link)')
    .action(async (_o, cmd: Command) => {
      const { client, opts } = setup(cmd);
      const local = cmd.opts() as { email?: string; password?: string | boolean; token?: string };
      await run(async () => {
        // Non-interactive magic-link completion.
        if (local.token) {
          await finishLogin(client, await client.magicLogin(local.token), opts.json);
          return;
        }

        let email = local.email;
        if (!email && !opts.json) {
          const answer = await text({ message: 'Email', placeholder: 'you@example.com' });
          if (isCancel(answer)) fail('Cancelled');
          email = String(answer).trim();
        }
        if (!email) fail('Email is required (use --email).');

        // Password path (opt-in).
        if (local.password !== undefined) {
          let pass =
            typeof local.password === 'string' ? local.password : process.env.PENCA_PASSWORD;
          if (!pass && !opts.json) {
            const answer = await passwordPrompt({ message: 'Password' });
            if (isCancel(answer)) fail('Cancelled');
            pass = String(answer);
          }
          if (!pass) fail('Password required (pass --password <value> or set PENCA_PASSWORD).');
          await finishLogin(client, await client.login({ email, password: pass }), opts.json);
          return;
        }

        // Default: passwordless magic link.
        const res = await client.sendMagicLink(email);
        if (!res.sent) fail('Could not send a magic link for that email.');
        info(
          `✉  Magic link sent to ${c.bold(email)}. Open the email and copy the link (or its token).`,
        );
        if (opts.json) {
          emit(
            { sent: true, userExists: res.userExists, next: 'run `penca login --token <token>`' },
            () => {},
          );
          return;
        }
        const pasted = await text({ message: 'Paste the magic link or token from the email' });
        if (isCancel(pasted)) fail('Cancelled');
        await finishLogin(client, await client.magicLogin(String(pasted)), opts.json);
      });
    });

  program
    .command('logout')
    .description('Clear the stored session')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await client.logout();
        emit({ ok: true }, () => success('Logged out.'));
      });
    });

  program
    .command('whoami')
    .description('Show the authenticated account')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const me = await client.me();
        const token = await client.getAccessToken();
        const exp = token ? decodeJwt(token)?.exp : undefined;
        emit(me, () => {
          heading(`${me.nickname} (${me.email})`);
          info(`id:        ${me.id}`);
          info(`roles:     ${me.roles.join(', ') || '—'}`);
          info(`providers: ${me.authProviders.join(', ') || '—'}`);
          if (exp) info(`session:   valid until ${new Date(exp * 1000).toISOString()}`);
        });
      });
    });

  program
    .command('profile')
    .description('Show your profile, or update it with the options below')
    .option('-n, --nickname <nickname>', 'set your nickname')
    .option('--name <fullName>', 'set your full name')
    .option('--country <country>', 'set your country (e.g. UY)')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { nickname?: string; name?: string; country?: string };
      await run(async () => {
        await requireAuth(client);
        const updates = { nickname: o.nickname, fullName: o.name, country: o.country };
        const hasUpdate = Object.values(updates).some((v) => v !== undefined);
        const me = hasUpdate ? await client.updateProfile(updates) : await client.me();
        emit(me, () => {
          success(hasUpdate ? 'Profile updated.' : 'Profile');
          heading(`${me.nickname} (${me.email})`);
          info(`name:    ${me.fullName}`);
          info(`country: ${me.country ?? '—'}`);
        });
      });
    });
}
