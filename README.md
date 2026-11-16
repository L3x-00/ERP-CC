# ORCA MFG ERP v2

ERP de CC Manufacturing Group / Mi Robot Centro CNC para cotización, órdenes, planeación, producción, entregas, finanzas y tesorería. Next.js + TypeScript + Supabase/PostgreSQL.

## Estado actual

El sistema está **en producción** y cubre el ciclo completo de manufactura: comercial (RFQ, pipeline y propuestas), órdenes, planeación y capacidad, piso de taller, entregas, cobranza, tesorería, compras, gastos, facturación interna, dashboard por rol y configuración maestra.

- El detalle operativo vigente está en [`docs/estado-actual.md`](docs/estado-actual.md).
- El PO fusiona cada PR y aplica las migraciones en Supabase remoto. Las migraciones nuevas se crean y validan **solo en local**.
- El ERP no timbra CFDI; el alcance fiscal sigue pendiente de decisión.

## Stack

- Next.js 16 (App Router), React 19, TypeScript estricto y Tailwind CSS v4.
- Supabase: PostgreSQL, Auth, Storage, Realtime, RLS y pgTAP.
- TanStack Query, Zustand, Zod y React Hook Form.
- Vitest, Testing Library, Playwright y pgTAP.

Las versiones exactas están en [`docs/tecnologias.md`](docs/tecnologias.md).

## Puesta en marcha

Requisitos: Node 24, pnpm 11, Docker y Supabase CLI.

```bash
pnpm install --frozen-lockfile
supabase start
supabase migration up --local
pnpm dev
```

La app queda en `http://localhost:3000`. Las variables locales salen del stack de Supabase (`supabase status`); no uses credenciales de producción para pruebas que mutan datos. La plantilla de variables es `.env.example`.

## Comandos de verificación

```bash
pnpm typecheck          # TypeScript
pnpm lint               # ESLint
pnpm test               # Vitest (tests/unitarias)
pnpm build              # build de Next.js
supabase test db        # pgTAP
pnpm exec playwright test tests/e2e/<spec>.spec.ts   # E2E contra loopback
```

Los gates y el cierre de una tanda están en `.agents/skills/cerrar-tanda/` y `.agents/skills/orca-ejecutar-tanda/`. Antes de tocar migraciones, CI o E2E, lee `docs/CUELLOS-DE-BOTELLA.md`.

## Mapa del código

- `src/app/` — rutas y páginas (RSC).
- `src/modulos/` — dominio por módulo (componentes, acciones, servicios, tipos, validaciones).
- `src/compartido/` — tipos, utilidades y UI compartida.
- `src/nucleo/` — autenticación, Supabase, permisos, IA y correo.
- `supabase/migrations/` — esquema y RPC; `supabase/tests/` — pgTAP.
- `tests/unitarias/`, `tests/integracion/`, `tests/e2e/`.
- `content/docs/` — documentación que se muestra dentro del producto.

## Documentación

- [`docs/README.md`](docs/README.md) — índice de la documentación del sistema.
- [`docs/estado-actual.md`](docs/estado-actual.md) — qué está operativo y qué queda pendiente.
- [`docs/arquitectura.md`](docs/arquitectura.md) — capas, seguridad, concurrencia y flujos críticos.
- [`docs/tecnologias.md`](docs/tecnologias.md) — stack frontend, backend, pruebas e infraestructura.
- [`docs/apis.md`](docs/apis.md) — Server Actions, RPCs, integraciones y reglas de contrato.
- [`docs/contexto.md`](docs/contexto.md) y [`docs/alcance.md`](docs/alcance.md) — negocio, flujo, límites y decisiones pendientes.
- [`docs/CUELLOS-DE-BOTELLA.md`](docs/CUELLOS-DE-BOTELLA.md) — fallos que ya costaron ciclos y cómo evitarlos.
- `AGENTS.md` — autoridad, roles y reglas de ingeniería.
- `.ai-shared/memory/` — estado y decisiones de los agentes; `.ai-shared/context/` — contexto estable.

## Reglas de integración

- Una rama por cambio desde `origin/main`; PR verde y revisión; **el PO fusiona**, no el agente.
- Nunca `git add -A`, `push --force`, `db push` masivo ni migraciones remotas.
- No se versionan `.env` reales, evidencia local de pruebas ni archivos `scratch-*`.
- Las respuestas registradas del cliente mandan sobre los defaults de las fichas.
