import type { Command } from 'commander';
import type { MatchView } from 'penca-ovacion-sdk';
import { requireAuth, run } from '../context.js';
import { c, emit, heading, info, table } from '../output.js';
import { fmtDate, int, setup } from './helpers.js';

export function registerMatches(program: Command): void {
  program
    .command('tournaments')
    .description('List available tournaments')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const list = await client.tournaments.list();
        emit(list, () =>
          table(
            ['Name', 'Short', 'ID'],
            list.map((t) => [t.name, t.shortName, t.id]),
          ),
        );
      });
    });

  program
    .command('matches <tournamentId>')
    .description('List matches for a tournament')
    .option('-v, --view <view>', 'upcoming | finished', 'upcoming')
    .option('-g, --group <groupId>', 'scope statistics/context to a group')
    .option('--page <n>', 'page number', '1')
    .option('--limit <n>', 'page size', '10')
    .action(async (tournamentId: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { view: MatchView; group?: string; page: string; limit: string };
      await run(async () => {
        await requireAuth(client);
        const res = await client.tournaments.matches(tournamentId, {
          view: o.view,
          groupId: o.group,
          page: int(o.page, 1),
          limit: int(o.limit, 10),
        });
        emit(res, () => {
          heading(`Matches (${o.view})`);
          table(
            ['When', 'Match', 'Score', 'Status', 'ID'],
            res.data.map((m) => [
              fmtDate(m.startDate),
              `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`,
              m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : '—',
              m.status,
              m.id,
            ]),
          );
        });
      });
    });

  program
    .command('match <matchId>')
    .description('Show statistics, events and Ovi prediction for a match')
    .option('-g, --group <groupId>', 'scope statistics to a group')
    .action(async (matchId: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { group?: string };
      await run(async () => {
        await requireAuth(client);
        const [stats, events, ovi] = await Promise.all([
          client.matches.statistics(matchId, { groupId: o.group }).catch(() => null),
          client.matches.events(matchId).catch(() => []),
          client.matches.oviPrediction(matchId).catch(() => null),
        ]);
        emit({ statistics: stats, events, oviPrediction: ovi }, () => {
          if (stats) {
            heading('Prediction split');
            info(
              `home ${stats.homeWinPercentage}%  draw ${stats.drawPercentage}%  away ${stats.awayWinPercentage}%  (${stats.totalPredictions} predictions)`,
            );
            if (stats.popularScores.length) {
              table(
                ['Score', 'Share'],
                stats.popularScores.map((p) => [p.label, `${p.percentage}%`]),
              );
            }
          }
          if (ovi) {
            heading('Ovi says');
            info(
              `${c.bold(`${ovi.homeScore}-${ovi.awayScore}`)} (${ovi.confidence}) — ${ovi.tagline}`,
            );
            info(ovi.reasoning);
          }
          info(`events: ${events.length}`);
        });
      });
    });

  program
    .command('ovi <matchId>')
    .description("Show Ovi's AI prediction for a match")
    .action(async (matchId: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const ovi = await client.matches.oviPrediction(matchId);
        emit(ovi, () => {
          heading(`Ovi: ${ovi.homeScore}-${ovi.awayScore} (${ovi.confidence})`);
          info(c.italic(ovi.tagline));
          info('');
          info(ovi.reasoning);
        });
      });
    });

  program
    .command('predict <matchId> <home> <away>')
    .description('Submit your score prediction for a match')
    .action(async (matchId: string, home: string, away: string, _o, cmd: Command) => {
      const { client } = setup(cmd);
      await run(async () => {
        await requireAuth(client);
        const homeScore = Number(home);
        const awayScore = Number(away);
        if (
          !Number.isInteger(homeScore) ||
          !Number.isInteger(awayScore) ||
          homeScore < 0 ||
          awayScore < 0
        ) {
          throw new Error('Scores must be non-negative integers, e.g. `penca predict <id> 2 1`.');
        }
        const res = await client.matches.predict(matchId, { homeScore, awayScore });
        emit(res, () => {
          if (res.success) console.log(`✔ Prediction saved: ${home}-${away}`);
        });
      });
    });

  program
    .command('digest')
    .description("Show Ovi's daily AI digest")
    .option('-k, --kind <kind>', 'digest kind', 'home')
    .action(async (_o, cmd: Command) => {
      const { client } = setup(cmd);
      const o = cmd.opts() as { kind: string };
      await run(async () => {
        await requireAuth(client);
        const d = await client.home.oviDigest(o.kind);
        emit(d, () => {
          heading(d.title);
          info(c.dim(d.date));
          info(c.italic(d.subtitle));
          info('');
          info(d.summary);
        });
      });
    });
}
