---
name: penca
description: >-
  Interactuar con Penca Antel Ovación, el juego de pronósticos de fútbol de
  Uruguay (Mundial 2026, Copa Libertadores, Intermedio). Usá este skill cuando el
  usuario quiera ver el fixture/partidos, hacer o revisar pronósticos, ver los
  pronósticos con IA de Ovi, mirar el ranking/la tabla de un grupo, unirse o salir
  de grupos, leer o publicar en el muro social, ver encuestas o noticias, o leer
  el resumen diario de Ovi. Se dispara con "penca", "Ovación", "pronóstico",
  "Mundial 2026 penca", "mi grupo de la penca", "ranking de la penca".
---

# Penca Antel Ovación

Manejá la CLI `penca` (del paquete `penca-ovacion`) para interactuar con la penca. Pasá
siempre `--json` para obtener salida estructurada sobre la cual razonar.

## Requisitos previos

El usuario tiene que estar logueado. Verificá con:

```bash
penca whoami --json
```

Si eso falla con un error de auth, decile al usuario que corra `penca login` él mismo. El
ingreso es sin contraseña: le mandan un magic link por email que tiene que pegar de vuelta.
Nunca le pidas ni manejes su contraseña ni su token de magic link.

## Tareas comunes

```bash
# Torneos y sus ids
penca tournaments --json

# Partidos próximos / finalizados de un torneo
penca matches <tournamentId> --view upcoming --json
penca matches <tournamentId> --view finished --json

# Un partido: reparto de pronósticos, eventos y la elección con IA de Ovi
penca match <matchId> --json
penca ovi <matchId> --json

# Hacer un pronóstico (primero el local, después el visitante)
penca predict <matchId> 2 1

# Grupos, rankings
penca groups --json                 # los grupos del usuario
penca groups public --json
penca ranking <groupId> --json
penca group join <CODIGO>
penca group leave <groupId>

# Muro social
penca wall --group <groupId> --json
penca wall post "mensaje" --group <groupId>

# Encuestas, noticias, resumen, pronósticos de un usuario
penca polls --json
penca articles --json
penca digest --json
penca predictions [userId] --json
```

## Pautas

- Resolvé los nombres a ids vos mismo: listá primero `penca tournaments`/`penca groups` y
  después usá el `id` devuelto.
- `penca predict` y `penca wall post` **escriben** en la cuenta del usuario. Confirmá el
  partido/resultado (o el texto del post y el grupo destino) con el usuario antes de
  ejecutarlos.
- Antes de sugerir un pronóstico, conviene leer el razonamiento de Ovi (`penca ovi`) y el
  reparto de pronósticos (`penca match`).
- Esta es una herramienta no oficial. No scrapees datos de otros usuarios en masa ni
  llenes el muro de spam.
