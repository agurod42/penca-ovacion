import type { Command } from 'commander';
import { requireAuth, run } from '../context.js';
import { c, emit, heading, info, success, table } from '../output.js';
import { fmtDate, int, setup } from './helpers.js';

export function registerSocial(program: Command): void {
  const wall = program.command('wall').description('Read or post to the social wall');

  wall
    .command('read', { isDefault: true })
    .description('List wall posts')
    .option('-g, --group <groupId>', 'scope to a group')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '10')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { group?: string; page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.wall.posts({
          groupId: o.group,
          page: int(o.page, 1),
          limit: int(o.limit, 10),
        });
        emit(res, () => {
          heading('Wall');
          for (const p of res.data) {
            info(
              `${c.bold(p.user.nickname)} ${c.dim(fmtDate(p.createdAt))}  ♥${p.likes} 💬${p.comments}`,
            );
            info(p.content);
            info('');
          }
        });
      });
    });

  wall
    .command('post <content>')
    .description('Publish a post to a group wall')
    .requiredOption('-g, --group <groupId>', 'target group id')
    .action(async (content: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { group: string };
      await run(async () => {
        await requireAuth(client);
        const post = await client.wall.post({ content, groupId: o.group });
        emit(post, () => success(`Posted (id ${post.id}).`));
      });
    });

  program
    .command('polls')
    .description('List active polls')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const polls = await client.polls.list();
        emit(polls, () => {
          for (const poll of polls) {
            heading(`${poll.question}  (${poll.totalVotes} votes, ${poll.status})`);
            table(
              ['Option', 'Votes', '%'],
              poll.options.map((opt) => [opt.text, opt.voteCount, `${opt.percentage}%`]),
            );
          }
        });
      });
    });

  program
    .command('articles')
    .description('List news articles')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '5')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.articles.list({ page: int(o.page, 1), limit: int(o.limit, 5) });
        emit(res, () => {
          heading('Articles');
          for (const a of res.data) {
            info(`${c.bold(a.title)} ${c.dim(fmtDate(a.publishedAt))}`);
            if (a.subtitle) info(c.dim(a.subtitle));
            info('');
          }
        });
      });
    });

  program
    .command('predictions [userId]')
    .description('Show predictions and stats for a user (defaults to yourself)')
    .option('-g, --group <groupId>', 'scope to a group')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '20')
    .action(async (userId: string | undefined, _o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { group?: string; page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const id = userId ?? (await client.me()).id;
        const res = await client.users.predictions(id, {
          groupId: o.group,
          page: int(o.page, 1),
          limit: int(o.limit, 20),
        });
        emit(res, () => {
          heading(`${res.user.nickname} — predictions`);
          info(
            `total ${res.stats.totalPredictions}  points ${res.stats.totalPoints}  exact hits ${res.stats.exactHits}`,
          );
        });
      });
    });
}
