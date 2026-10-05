# Prompt — TERMINAL A · Stream E2: Catálogos base (B1.3–B1.8)

Trabajas como desarrollador autónomo en el repo `D:\ERP-CC` (Next.js 16 + Supabase), en paralelo con otras 2 terminales. **Lee primero** `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` y cúmplelo al pie de la letra. Tu stream no toca archivos de B ni de C.

## Lecturas obligatorias

1. `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` (reglas, mapa de archivos, bloqueos).
2. `docs/plan-erp-sii/01-sistema-catalogos.md` §1.3–§1.8 y §1.11 (tu bloque).
3. `docs/ERP_SII_Handoff_Tecnico_Funcional.md` §15.1 (catálogos) y §5 (permisos).
4. `docs/plan-erp-sii/00-fundamentos.md` §0.8 (patrones SQL/TS) y §0.6 (nomenclatura).

Estado de partida: E1 (permisos) y E3 (archivos) ya están implementados, verificados y commiteados. Los permisos `catalogo_ver` y `catalogo_editar` ya existen y están sembrados (gerente/admin).

## Objetivo

Entregar los catálogos configurables con activo/inactivo, versionado y auditoría, y su UI en Configuración. Resultado: B1.3–B1.8 del plan.

## Migraciones (banda propia `2026100610xxxx`)

Crea los archivos manualmente (NO uses `supabase migration new`, podría colisionar con otras terminales):

1. `supabase/migrations/20261006100001_sii_b1_catalogos_base.sql`
2. `supabase/migrations/20261006100002_sii_b1_catalogos_versionado.sql`

### Contenido mínimo exigido

**Tablas (idempotentes, aditivas):**

```sql
create table if not exists public.catalogo_materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  activo boolean not null default true, orden integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table if not exists public.catalogo_espesores (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.catalogo_materiales(id),
  etiqueta text not null, espesor_mm numeric(8,3) not null check (espesor_mm > 0),
  activo boolean not null default true, orden integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (material_id, etiqueta)
);
create table if not exists public.catalogo_procesos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  prefijo_corrida text not null,                      -- LAS, LCO, DOB, SOL, ROU, MAR, MAQ, ACA
  grupo_planeado_id uuid references public.grupos_planeados(id),
  area_trabajo_codigo text references public.areas_trabajo_config(codigo),
  requiere_archivo_tecnico boolean not null default true,   -- LISTO de RFQ (decisión cliente 2026-10-05)
  requiere_primera_pieza boolean not null default false,    -- B6
  intervalo_inspeccion_lote integer check (intervalo_inspeccion_lote in (10, 20)), -- B6
  activo boolean not null default true, orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create table if not exists public.grupos_equipo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  activo boolean not null default true, orden integer not null default 0
);
create table if not exists public.grupos_planeados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  activo boolean not null default true, orden integer not null default 0
);
create table if not exists public.catalogo_proximas_acciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  es_otro boolean not null default false, activo boolean not null default true,
  orden integer not null default 0
);
create unique index if not exists ux_proxima_accion_otro
  on public.catalogo_proximas_acciones (es_otro) where es_otro;
alter table public.recursos_planeacion
  add column if not exists grupo_equipo_id uuid references public.grupos_equipo(id);
```

**Seeds** (idempotentes `on conflict do nothing`):
- Materiales (8): `ACERO_CARBON`, `GALVANIZADO`, `INOXIDABLE`, `ALUMINIO`, `BIRCH`, `MDF`, `ACRILICO`, `PLASTICO_ING` (§15.1).
- Procesos (8) con prefijo: `LASER_FIBRA/LAS`, `LASER_CO2/LCO`, `DOB/DOB`, `SOLD/SOL`, `ROUTER/ROU`, `MARCADO/MAR`, `MAQUINADO/MAQ`, `ACABADO/ACA`. `requiere_primera_pieza = true` en LASER_FIBRA, LASER_CO2, DOB, ROUTER, MAQUINADO; `intervalo_inspeccion_lote = 10` por defecto.
- Grupos planeados (6): CORTE, DOBLADO, SOLDADURA, MAQUINADO, ACABADO, ENSAMBLE.
- Grupos de equipo: sugiere códigos desde los recursos existentes (`select distinct area/equipo de recursos_planeacion` si aporta) o mínimos `CNC_ROUTER`, `LASER_FIBRA`, `PRESS_BRAKE`, `SOLDADURA`, `MAQUINADO`. **No inventes recursos**; solo catálogo.
- Próximas acciones (7 + OTHER): `FOLLOW_UP`, `CONFIRM_RECEIPT`, `WAIT_CUSTOMER_RESPONSE`, `REQUEST_APPROVAL_PO`, `RESOLVE_CUSTOMER_QUESTIONS`, `PREPARE_NEW_REVISION`, `OTHER` (es_otro=true).

**Versionado:**
```sql
create table if not exists public.versiones_catalogo (
  id uuid primary key default gen_random_uuid(),
  entidad text not null, entidad_id uuid not null,
  version integer not null, datos jsonb not null,
  actor_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (entidad, entidad_id, version)
);
-- trigger privado.registrar_version_catalogo() BEFORE INSERT OR UPDATE en las 6 tablas de catálogo
-- (snapshot completo de la fila, version = max+1, security definer, search_path='')
```
Reglas de oro: los catálogos **no se borran** (solo `activo=false`); toda mutación pasa por Server Actions con `can(usuario,'catalogo_editar')`, cliente admin y `registrarLog`; RLS de solo lectura para `authenticated` (permiso `catalogo_ver`), sin políticas de escritura; `GRANT ALL` a `service_role`; `REVOKE` de `anon`.

## Código y UI (dueño: tú)

- Nuevo módulo `src/modulos/catalogos/` con tipos, servicios, validaciones Zod y acciones (`guardar-material`, `guardar-espesor`, `guardar-proceso`, `guardar-grupo-equipo`, `guardar-grupo-planeado`, `guardar-proxima-accion`, `alternar-activo`, `obtener-catalogos-base`, `listar-versiones`).
- Pestaña nueva “Catálogos base” en Configuración: crea `pestana-catalogos-base.tsx` y regístrala en `operacion-configuracion.tsx` (eres la única terminal que toca ese archivo; usa `PESTANAS_SOLO_ADMIN` o visibilidad por permiso `catalogo_editar`/`catalogo_ver`).
- UI: CRUD por catálogo, activo/inactivo, orden, historial de versiones desplegable; **selector de espesor dependiente del material**; los códigos inactivos no se ofrecen en registros nuevos pero se ven en historial.
- No toques `pestana-catalogos.tsx` (tiers/categorías existentes) ni `areas_trabajo_config` salvo el FK de procesos.
- Tipos: edita `src/compartido/tipos/supabase.ts` con el protocolo §4 del PROTOCOLO (bloqueo de tipos).

## Pruebas

- pgTAP `supabase/tests/sii_b1_catalogos.test.sql`: tablas, seeds exactos, unicidad de códigos, `es_otro` único, trigger de versionado (INSERT=1, UPDATE=2, snapshot), deactivate (activo=false) permitido y DELETE directo sin política, FK proceso→grupo planeado.
- Unitarias `tests/unitarias/catalogos-*.test.ts`: validaciones Zod, agrupación por secciones, dependencia material→espesor, permisos.
- E2E `tests/e2e/catalogos-base.spec.ts`: admin entra a Configuración → Catálogos base, crea material + espesor, edita un proceso (toggle `requiere_archivo_tecnico`), revisa historial de versiones; capturas 1440/768 claro/oscuro en `.ai-shared/qa/sii-b1-e2/visual/`.
- Regresión: `catalogos-comerciales.spec.ts` y `configuracion-flujo.spec.ts` deben seguir verdes.

## Gates y reporte

Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase test db`, `pnpm test:integracion`, E2E focal + regresión, `pnpm build`. Usa bloqueos del protocolo para integración/E2E.
Migración: repórtala al PO para que la aplique (no la apliques tú). Registra avance en `docs/plan-erp-sii/paralelo/estado/TERMINAL-A.md` con el formato §7 del protocolo.

## Exclusiones

No toques RFQ, clientes, propuestas, órdenes, producción, auditoría/actividad ni archivos. No edites `supabase.ts` fuera de tu bloque. No hagas git add/commit. No cambies reglas de negocio no especificadas: si falta una decisión, anótala como pendiente en tu reporte.
