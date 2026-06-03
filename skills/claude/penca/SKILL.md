---
name: penca
description: >-
  Interact with Penca Antel Ovación, Uruguay's football-prediction game (Mundial
  2026, Copa Libertadores, Intermedio). Use this skill when the user wants to
  check fixtures/matches, make or review score predictions ("pronósticos"), see
  Ovi's AI predictions, view group rankings/leaderboards ("tabla", "ranking"),
  join/leave groups, read or post to the social wall, check polls or news, or
  read Ovi's daily digest. Triggers on "penca", "Ovación", "pronóstico",
  "Mundial 2026 penca", "mi grupo de la penca", "ranking de la penca".
---

# Penca Antel Ovación

Drive the `penca` CLI (from `penca-ovacion`) to interact with the penca. Always pass
`--json` so you get structured output to reason over.

## Prerequisites

The user must be logged in. Check with:

```bash
penca whoami --json
```

If that fails with an auth error, tell the user to run `penca login` themselves. Sign-in
is passwordless: it emails them a magic link which they paste back. Never ask for or
handle their password or magic-link token yourself.

## Common tasks

```bash
# Tournaments and their ids
penca tournaments --json

# Upcoming / finished matches for a tournament
penca matches <tournamentId> --view upcoming --json
penca matches <tournamentId> --view finished --json

# A match: prediction split, events, and Ovi's AI pick
penca match <matchId> --json
penca ovi <matchId> --json

# Make a prediction (home then away score)
penca predict <matchId> 2 1

# Groups, rankings
penca groups --json                 # the user's groups
penca groups public --json
penca ranking <groupId> --json
penca group join <CODE>
penca group leave <groupId>

# Social wall
penca wall --group <groupId> --json
penca wall post "mensaje" --group <groupId>

# Polls, articles, digest, a user's predictions
penca polls --json
penca articles --json
penca digest --json
penca predictions [userId] --json
```

## Guidance

- Resolve names to ids yourself: list `penca tournaments`/`penca groups` first, then use
  the returned `id`.
- `penca predict` and `penca wall post` **write** to the user's account. Confirm the
  match/score (or the post text and target group) with the user before running them.
- Prefer reading Ovi's reasoning (`penca ovi`) and the prediction split
  (`penca match`) before suggesting a prediction.
- This is an unofficial tool. Don't bulk-scrape other users' data or spam the wall.
