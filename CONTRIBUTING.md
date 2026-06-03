# Contribuir

¡Gracias por ayudar a mejorar el toolkit de Penca Ovación!

## Preparación

```bash
pnpm install
pnpm build
pnpm test
```

## Estructura del proyecto

- `packages/sdk` — el cliente tipado de la API. **Todo endpoint nuevo empieza acá.** Agregá
  el método al resource que corresponda (o uno nuevo), agregá los tipos en `src/types.ts` y
  agregá un test unitario con el fetch mockeado en `test/`.
- `packages/cli` — capa fina de comandos sobre el SDK. Dejá el formateo en `src/output.ts`;
  todo comando debe soportar `--json`.
- `packages/mcp` — registrá una herramienta en `src/server.ts` que refleje el método del SDK.
- `skills/` — wrappers específicos por LLM sobre la CLI/MCP.

## Reglas básicas

- **Nunca commitees credenciales, tokens ni capturas de red crudas** (`*.mitm`, `*.har`
  están en el `.gitignore`). Los fixtures de tests deben usar datos **sintéticos** —
  nada de información personal de usuarios reales, ni emails/IDs reales.
- Corré `pnpm lint` y `pnpm test` antes de abrir un PR; CI corre typecheck + lint + test +
  build.
- Respetá el estilo de código existente (Biome impone el formato).
- Sé buen ciudadano de la API: no agregues nada que le pegue sin control ni que scrapee
  datos de otros usuarios en masa.

## Agregar un endpoint nuevo

1. Capturá/confirmá la forma del request y la respuesta.
2. SDK: agregá el método del resource + tipos + un test.
3. CLI: agregá un comando (vista para humanos + `--json`).
4. MCP: agregá una herramienta.
5. Actualizá la lista de endpoints del README si corresponde.
