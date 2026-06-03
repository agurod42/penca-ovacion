import type { Command } from 'commander';
import type { Group } from 'penca-ovacion-sdk';
import { requireAuth, run } from '../context.js';
import { emit, heading, success, table } from '../output.js';
import { int, setup } from './helpers.js';

function groupRows(groups: Group[]): (string | number)[][] {
  return groups.map((g) => [
    g.name,
    g.memberCount,
    g.code,
    g.isPrivate ? 'private' : 'public',
    g.id,
  ]);
}

export function registerGroups(program: Command): void {
  const groups = program.command('groups').description('List your groups (or public/finished)');

  groups
    .command('mine', { isDefault: true })
    .description('Groups you belong to')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '20')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const list = await client.groups.mine({ page: int(o.page, 1), limit: int(o.limit, 20) });
        emit(list, () => {
          heading('Your groups');
          table(['Name', 'Members', 'Code', 'Type', 'ID'], groupRows(list));
        });
      });
    });

  groups
    .command('public')
    .description('Public/featured groups you can join')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '20')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.groups.public({ page: int(o.page, 1), limit: int(o.limit, 20) });
        emit(res, () => {
          heading('Public groups');
          table(['Name', 'Members', 'Code', 'Type', 'ID'], groupRows(res.data));
        });
      });
    });

  groups
    .command('finished')
    .description('Groups from finished tournaments')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '20')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.groups.finished({ page: int(o.page, 1), limit: int(o.limit, 20) });
        emit(res, () => {
          heading('Finished groups');
          table(['Name', 'Members', 'Code', 'Type', 'ID'], groupRows(res.data));
        });
      });
    });

  const group = program.command('group').description('Join or leave a group');

  group
    .command('join <code>')
    .description('Join a group by invite code')
    .action(async (code: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const g = await client.groups.join(code);
        emit(g, () => success(`Joined "${g.name}" (${g.memberCount} members).`));
      });
    });

  group
    .command('leave <groupId>')
    .description('Leave a group by id')
    .action(async (groupId: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const res = await client.groups.leave(groupId);
        emit(res, () => success('Left the group.'));
      });
    });

  program
    .command('ranking <groupId>')
    .description('Show a group leaderboard')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '20')
    .action(async (groupId: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.groups.ranking(groupId, {
          page: int(o.page, 1),
          limit: int(o.limit, 20),
        });
        emit(res, () => {
          heading('Ranking');
          table(
            ['#', 'Player', 'Points'],
            res.data.map((r) => [r.position, r.user.nickname, r.points]),
          );
        });
      });
    });
}
