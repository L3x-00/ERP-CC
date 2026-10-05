# Prompt — TERMINAL B · Stream E4: Actividad y auditoría con correlationId (B1.10)

Trabajas como desarrollador autónomo en el repo `D:\ERP-CC` (Next.js 16 + Supabase), en paralelo con otras 2 terminales. **Lee primero** `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` y cúmplelo al pie de la letra. Tu stream no toca archivos de A ni de C.

## Lecturas obligatorias

1. `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`.
2. `docs/plan-erp-sii/01-sistema-catalogos.md` §1.10 (tu bloque) y §1.11.
3. `docs/ERP_SII_Handoff_Tecnico_Funcional.md` §15.3 (Actividad) y §17 (UX).
4. `docs/plan-erp-sii/00-fundamentos.md` §0.8 (patrones).

Estado de partida: E1/E3 implementados y commiteados. `logs` ya tiene RLS que oculta `detalles` a `authenticated` (A18) y el permiso `actividad_vista` ya existe (E1; sembrado en gerente/admin). La vista Bitácora admin actual debe conservarse.

## Objetivo

Infraestructura de correlación de eventos + vista `/actividad` comprensible (sin UUID técnicos), filtrable y paginada. B1.10 del plan.

## Migración (banda propia `2026100620xxxx`)

`supabase/migrations/20261006200001_sii_b1_actividad.sql` (créala manualmente, NO uses `supabase migration new`):

```sql
alter table public.logs add column if not exists correlation_id uuid;
create index if not exists ix_logs_correlation
  on public.logs (correlation_id) where correlation_id is not null;
```

RPC de consulta `public.obtener_actividad(...)` (`SECURITY DEFINER`, `search_path=''`, solo `service_role`):

- Firma sugerida: `(p_actor_id uuid, p_usuario_id uuid, p_modulo text, p_accion text, p_actor_texto text, p_recurso_id text, p_desde timestamptz, p_hasta timestamptz, p_limite integer, p_cursor_creado timestamptz, p_cursor_id uuid)`.
- Valida dentro que `p_actor_id` esté activo y tenga `actividad_vista` o rol admin (error `sin_permiso_actividad`, 42501). Reutiliza el patrón de las RPC de E1 (`20261005100001`).
- Devuelve filas con: `id`, `creado_en`, `correlation_id`, `nombre_usuario`, `rol`, `accion`, `modulo`, `recurso_id`, `contexto jsonb` (solo si el actor es admin; para no-admin `null`), y **etiquetas legibles resueltas en SQL**: `recurso_etiqueta` (folio CNC/OP del pipeline, razón social del cliente, folio de orden) y `entidad` (`pipeline|cliente|orden|otro`) para que la UI construya el enlace.
- Paginación estable por `(creado_en desc, id desc)` con cursor; máximo de filas 100 (default 30).
- Grants: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role`.

## Código (dueño: tú)

- `src/nucleo/auditoria/registrar-log.ts`: agrega parámetro opcional `correlationId` al final (compatible hacia atrás) y exporta `nuevoCorrelationId()` (usa `randomUUID`). No cambies firmas existentes.
- `src/modulos/auditoria/**`: acción `obtenerActividadAccion` (valida sesión + permiso con `can`), tipos y utilidades; reutiliza/extiende `utilidades/enlace-registro.ts` para construir la ruta del registro (`/pipeline?oportunidad=`, `/clientes?cliente=`, `/ordenes?...`). Si un recurso no tiene enlace, muestra la etiqueta resuelta o el folio; **nunca UUID crudo**.
- Página nueva `src/app/(privado)/actividad/page.tsx` (RSC con guarda de permiso `actividad_vista` o admin) + componente de tabla con: filtros (usuario, módulo, acción, recurso, rango de fechas), paginación, agrupación visual por `correlation_id` (mismo grupo = misma acción de negocio), estados de carga/vacío/error con los primitivos del repo.
- Enlace en `src/compartido/componentes/navegacion/modulos-navegacion.ts` (eres dueño temporal de ese archivo; sigue el patrón de permisos existente).
- No toques `logs` RLS ni la pestaña Bitácora (`tabla-logs.tsx` se conserva tal cual; puedes reutilizar sus ideas, no sus archivos si eso rompe la regresión).
- Tipos: edita `src/compartido/tipos/supabase.ts` con el protocolo §4 del PROTOCOLO (bloqueo de tipos): columna `correlation_id` en `logs` + RPC nueva.

## Alcance de la propagación

En este stream **solo** se implementa el soporte (parámetro, helper, RPC y vista). El retrofit de `correlationId` en todas las Server Actions de otros módulos se hará coordinado al final (esos archivos son de A/C/congelados). Documenta en tu reporte la lista de acciones que lo usarán.

## Pruebas

- pgTAP `supabase/tests/sii_b1_actividad.test.sql`: columna e índice, privilegios de la RPC, actor sin permiso → 42501, actor sin sesión/inactivo, admin obtiene `contexto`, no-admin lo recibe `null`, paginación por cursor sin duplicados, resolución de etiquetas (crea pipeline/cliente/orden de prueba).
- Unitarias `tests/unitarias/actividad-*.test.ts`: builder de filtros, agrupación por `correlationId`, construcción de enlaces, `nuevoCorrelationId` único.
- E2E `tests/e2e/actividad.spec.ts`: admin crea (vía service_role) dos logs con el mismo `correlation_id` y uno suelto; abre `/actividad`, verifica agrupación, filtra por módulo, comprueba que no hay UUID crudo visible y que un operador no ve la sección; capturas 1440/768 claro/oscuro en `.ai-shared/qa/sii-b1-e4/visual/`.
- Regresión: `configuracion-flujo.spec.ts` y `bitacora-configuracion.spec.ts` verdes.

## Gates y reporte

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase test db`, `pnpm test:integracion`, E2E focal + regresión, `pnpm build`. Usa los bloqueos del protocolo para pruebas mutantes/E2E.
Reporta la migración al PO para que la aplique (no la apliques tú) y registra avance en `docs/plan-erp-sii/paralelo/estado/TERMINAL-B.md` (formato §7 del protocolo).

## Exclusiones

No toques catálogos/configuración (A), clientes (C), pipeline, órdenes, producción ni archivos. No hagas git add/commit. No modifiques migraciones existentes.
