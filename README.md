# ORCA MFG ERP v2

ERP de CC Manufacturing Group para cotización, órdenes, planeación, producción, entregas, finanzas y tesorería. Next.js + TypeScript + Supabase/PostgreSQL.

## Estado actual (2026-10-19)

- **Órdenes C8, Planeación C9 y Finanzas C10 cerrados localmente.** C10.1–C10.3 fusionados; C10.4 (aceptación de punta a punta y registro) en el PR de cierre. El PO fusiona cada PR y aplica las migraciones en remoto.
- **Finanzas C10:** costo estimado/comprometido/real por Orden, margen sin IVA, una factura por entrega, cancelación bloqueada con cobros aplicados, flujo por cuenta en Tesorería y reversos visibles. F10 (ajuste manual del costo real) queda **parcial** por decisión del PO.
- No hay migraciones pendientes de Finanzas. Las migraciones nuevas se crean y aplican **solo en local**; el PO las aplica en remoto antes del despliegue.

## Stack

- Next.js (App Router), React, TypeScript, Tailwind.
- Supabase local: PostgreSQL, Auth, Storage, RLS y pgTAP.
- Vitest, Testing Library, Playwright y pgTAP.

## Puesta en marcha

Requisitos: Node 24, pnpm 11, Docker y Supabase CLI.

```bash
pnpm install --frozen-lockfile
supabase start
supabase migration up --local
pnpm dev
```

La app queda en `http://localhost:3000`. Las variables locales salen del stack de Supabase (`supabase status`); no uses credenciales de producción para pruebas que mutan datos.

## Comandos de verificación

```bash
pnpm typecheck          # TypeScript
pnpm lint               # ESLint
pnpm test               # Vitest (tests/unitarias)
pnpm build              # build de Next.js
supabase test db        # pgTAP
pnpm exec playwright test tests/e2e/<spec>.spec.ts   # E2E contra loopback
```

Los gates y el cierre de una tanda están en `.agents/skills/cerrar-tanda/` y `.agents/skills/orca-ejecutar-tanda/`. Antes de tocar migraciones, lee `docs/CUELLOS-DE-BOTELLA.md`.

## Mapa del código

- `src/app/` — rutas y páginas (RSC).
- `src/modulos/` — dominio por módulo (componentes, acciones, servicios, tipos, validaciones).
- `src/compartido/` — tipos, utilidades y UI compartida.
- `src/nucleo/` — autenticación, Supabase y permisos.
- `supabase/migrations/` — esquema y RPC; `supabase/tests/` — pgTAP.
- `tests/unitarias/`, `tests/integracion/`, `tests/e2e/`.

## Documentación

- `AGENTS.md` — autoridad, roles y reglas de ingeniería.
- `.ai-shared/memory/PROJECT_STATE.md` — estado operativo vigente.
- `.ai-shared/memory/decisions/` — ADR; el cierre de Finanzas está en `ADR-0016-cierre-finanzas-c10.md`.
- `docs/observaciones-cliente-2026-10-07/CHECKPOINT-EJECUCION.md` — checkpoint de las correcciones del cliente.
- `docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md` — decisiones y refinamientos del cliente.
- `docs/CUELLOS-DE-BOTELLA.md` — fallos que ya costaron ciclos y cómo evitarlos.

## Reglas de integración

- Una tanda por rama desde `origin/main`; PR verde y revisión; **el PO fusiona**, no el agente.
- Nunca `git add -A`, `push --force`, `db push` masivo ni migraciones remotas.
- No se versionan `docs/observaciones-cliente-2026-10-07/` (salvo `DECISIONES-ACEPTADAS.md` y `REPORTE-HALLAZGOS-Y-CORRECCIONES.md`), la migración local con typo `20261014110000_tarifario_unico_estacion_grupo.sql` ni el bloque de estado de `tasks/todo.md`.
- Las respuestas registradas del cliente mandan sobre los defaults de las fichas.
