# penca-ovacion-sdk

SDK tipado en TypeScript para la API de **Penca Antel Ovación** (no oficial).

```bash
npm install penca-ovacion-sdk   # próximamente; por ahora usalo desde el clon del repo
```

```ts
import { PencaClient } from 'penca-ovacion-sdk';

const penca = new PencaClient();
await penca.login({ email: 'vos@example.com', password: '••••••' });

const tournaments = await penca.tournaments.list();
const { data } = await penca.tournaments.matches(tournaments[0].id, { view: 'upcoming' });
await penca.matches.predict(data[0].id, { homeScore: 2, awayScore: 1 });
```

## Destacados

- Superficie tipada completa: `tournaments`, `matches`, `groups`, `wall`, `polls`,
  `articles`, `users`, `home`.
- Auth con renovación automática ante un 401 (magic link sin contraseña, email +
  contraseña, proveedores sociales).
- Guardado de tokens enchufable: `KeychainTokenStore` (por defecto), `FileTokenStore`,
  `EnvTokenStore`, `MemoryTokenStore`.
- Helpers de paginación con async iterator: `paginate()` / `collect()`.
- Escape hatch `client.request()` para endpoints todavía no modelados.

Mirá el [README del repositorio](https://github.com/agurod42/penca-ovacion#readme) para la
foto completa (CLI + MCP). **No oficial** — sin afiliación con Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
