# penca-ovacion (`penca`)

Cliente de línea de comandos para **Penca Antel Ovación** (no oficial).

```bash
npm install -g penca-ovacion    # próximamente; por ahora usá la CLI desde el clon del repo
penca login
penca matches <tournamentId> --view upcoming
penca predict <matchId> 2 1
```

Corré `penca --help` para ver la lista completa de comandos. Todos soportan `--json` para
salida procesable por máquina, además de `--no-color`, `--base-url` y `--debug`.

El ingreso es sin contraseña por defecto (magic link por email). Los tokens se guardan en el
llavero del sistema (con respaldo a archivo). Definí `PENCA_TOKEN` para usar un token desde
el entorno.

Mirá el [README del repositorio](https://github.com/agurod42/penca-ovacion#readme) para todo
lo demás. **No oficial** — sin afiliación con Ovación/Antel/FutbolX.

MIT © Agustín Rodríguez
