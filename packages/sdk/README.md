# penca-ovacion-sdk

Typed TypeScript SDK for the **Penca Antel Ovación** API (unofficial).

```bash
npm install penca-ovacion-sdk
```

```ts
import { PencaClient } from 'penca-ovacion-sdk';

const penca = new PencaClient();
await penca.login({ email: 'you@example.com', password: '••••••' });

const tournaments = await penca.tournaments.list();
const { data } = await penca.tournaments.matches(tournaments[0].id, { view: 'upcoming' });
await penca.matches.predict(data[0].id, { homeScore: 2, awayScore: 1 });
```

## Highlights

- Full typed surface: `tournaments`, `matches`, `groups`, `wall`, `polls`, `articles`,
  `users`, `home`.
- Auth with automatic refresh on 401.
- Pluggable token storage: `KeychainTokenStore` (default), `FileTokenStore`,
  `EnvTokenStore`, `MemoryTokenStore`.
- `paginate()` / `collect()` async-iterator helpers.
- `client.request()` escape hatch for endpoints not yet modeled.

See the [repository README](https://github.com/aguro/penca-ovacion-cli#readme) for the
full picture (CLI + MCP). **Unofficial** — not affiliated with Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
