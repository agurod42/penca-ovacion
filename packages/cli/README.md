# penca-ovacion (`penca`)

Command-line client for **Penca Antel Ovación** (unofficial).

```bash
npm install -g penca-ovacion
penca login
penca matches <tournamentId> --view upcoming
penca predict <matchId> 2 1
```

Run `penca --help` for the full command list. Every command supports `--json` for
machine-readable output, plus `--no-color`, `--base-url`, and `--debug`.

Tokens are stored in your OS keychain (file fallback). Set `PENCA_TOKEN` to use a token
from the environment instead.

See the [repository README](https://github.com/aguro/penca-ovacion-cli#readme) for
everything else. **Unofficial** — not affiliated with Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
