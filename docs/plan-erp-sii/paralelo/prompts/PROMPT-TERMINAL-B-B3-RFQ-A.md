# Prompt — TERMINAL B · B3 RFQ, sub-bloque 1 (modelo, ítems, estados y folio)

Trabajas en `D:\ERP-CC` en paralelo con A y C. Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`, tu estado y `docs/plan-erp-sii/03-rfq.md` (§3.1–3.3, §3.5–3.6).

## Contexto verificado

- Tu E4 (Actividad) quedó **completo y verificado** (pgTAP 27/27 confirmado por el coordinador; typecheck/lint/unit/integración/E2E/build en verde según tu reporte). El coordinador hará cross-review y commit; **no lo toques más** salvo que el coordinador lo pida.
- Las migraciones de A (`2026100610*`) **ya están aplicadas en local**: tienes `catalogo_materiales`, `catalogo_espesores`, `catalogo_procesos` (con `requiere_archivo_tecnico`, `requiere_primera_pieza`, `intervalo_inspeccion_lote`), `grupos_equipo`, `grupos_planeados`, `catalogo_proximas_acciones` y `archivos` (E3).
- El **remoto** lo aplica el PO; tú nunca aplicas migraciones.

## Transferencia de propiedad para este bloque

- Pasas a ser dueño de: `src/modulos/rfq/**` (nuevo), `src/modulos/pipeline/**`, `src/app/(panel)/pipeline/**` (solo cuando la ola 2 lo pida), y consumidores de `etapa` en `src/modulos/dashboard/**` (solo ola 2).
- No toques `src/modulos/clientes/**` (C), `src/modulos/catalogos/**` ni `src/modulos/configuracion/componentes/pestana-catalogos-base.tsx` (A).
- Banda de migraciones propia de B3: `2026100710xxxx` (crea los archivos a mano, sin `supabase migration new`).

## Alcance de la ola 1 (sin UI ni cambio de rutas)

### 1. Folio periódico genérico + `RFQ-MMYY_XX`

`supabase/migrations/20261007100001_sii_b3_folio_periodico.sql`:

```sql
create table if not exists public.contadores_folio_periodico (
  tipo text not null, periodo text not null, ultimo integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (tipo, periodo)
);
create or replace function public.generar_folio_periodico(p_tipo text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_periodo text; v_num integer;
begin
  v_periodo := to_char(now(), 'MMYY');
  insert into public.contadores_folio_periodico as c (tipo, periodo, ultimo)
  values (p_tipo, v_periodo, 1)
  on conflict (tipo, periodo) do update set ultimo = c.ultimo + 1, actualizado_en = now()
  returning ultimo into v_num;
  if v_num > 99 then raise exception 'folio_periodo_agotado' using errcode = '23514'; end if;
  return p_tipo || '-' || v_periodo || '_' || lpad(v_num::text, 2, '0');
end $$;
-- REVOKE de PUBLIC/anon/authenticated; GRANT EXECUTE a service_role; COMMENT ON.
```

No toques el contador `CNC` existente ni la pestaña Folios (la continuidad administrativa de los nuevos tipos se hará en otra ola).

### 2. Modelo RFQ

`supabase/migrations/20261007100002_sii_b3_rfq_base.sql` (aditiva; DDL exacto en `03-rfq.md §3.1`):

- `pipeline`: `folio_rfq text` (+ índice único), `estado_rfq text NOT NULL DEFAULT 'NEW'` con CHECK de los 8 estados, `canal`, `fecha_solicitud date`, `contacto_id uuid → contactos_cliente`, `descripcion_general`, `responsable_id uuid → usuarios`, `proxima_accion_codigo text → catalogo_proximas_acciones`, `proxima_accion_texto`, `fecha_proxima_accion`, `responsable_proxima_accion_id uuid → usuarios`.
- `rfq_items` (rfq_id→pipeline, `numero` entero, `codigo` ITxx, descripción, cantidad>0, material_id, espesor_id, acabado, notas, `estado activo|cancelado`, únicos `(rfq_id,numero)` y `(rfq_id,codigo)`).
- `rfq_item_operaciones` (item_id, proceso_id→catalogo_procesos, orden, único item+proceso).
- `rfq_eventos` (rfq_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id, creado_en).
- **Backfill idempotente**: `estado_rfq` desde `etapa` (prospecto→NEW, contactado→INCOMPLETE, cotizado|negociacion|ganada→CONVERTED, perdida→CLOSED, resto INCOMPLETE); `fecha_solicitud = creado_en::date`; `responsable_id = vendedor_id`; `descripcion_general = notas`; un `rfq_item` por `cotizacion_linea` (`numero = orden`, `codigo = 'IT'||lpad(orden,2,'0')`); operaciones mapeadas por código/nombre contra `catalogo_procesos`; las no mapeadas se anexan a `notas` como `procesos_legacy: [...]` sin bloquear.
- RLS/Realtime para las tablas nuevas igual que `pipeline`/`cotizacion_lineas` (identidad activa + dueño/`ver_pipeline_equipo`/admin, ver `20260922000008_a09_identidad_activa_rls_pipeline.sql`); `GRANT SELECT` a authenticated y `ALL` a service_role; publicar `rfq_items` en Realtime.
- **Puente de transición obligatorio**: NO retires `etapa` ni cambies consumidores en esta ola. Un trigger/RPC mantiene `etapa` sincronizada (NEW→prospecto, INCOMPLETE/WAITING_*→contactado, CONVERTED→cotizado, CLOSED/CANCELLED→perdida) para que dashboard/alertas sigan funcionando. Documenta que la ola 2 migrará consumidores y retirará el puente.

### 3. Estados e ítems (RPC)

En `20261007100002` o `...0003_sii_b3_rfq_acciones.sql`:

- `cambiar_estado_rfq(p_rfq_id uuid, p_accion text, p_args jsonb, p_actor_id uuid, p_correlation_id uuid)`: acciones `marcar_incompleto`, `poner_en_espera_cliente`, `poner_en_espera_tecnica`, `marcar_listo`, `cerrar`, `cancelar`; valida estado de origen, permisos (`rfq_editar`, `rfq_marcar_listo`, `rfq_cerrar`; admin), CAS con `p_args->>'actualizado_en'`, motivo obligatorio en cerrar/cancelar; escribe `rfq_eventos`; `marcar_listo` **revalida en servidor** `validar_rfq_listo` y no permite listo con faltantes (`rfq_no_listo` con detalle); devuelve nuevo estado.
- `validar_rfq_listo(p_rfq_id uuid) returns jsonb`: secciones Cliente/General/Ítems/Archivos/Seguimiento según `03-rfq.md §3.6`; archivos solo si algún ítem activo usa un proceso con `requiere_archivo_tecnico=true` (lee `archivos` de `rfq`/`rfq_item`).
- `crear_item_rfq`, `actualizar_item_rfq` (CAS), `cancelar_item_rfq`, `reemplazar_operaciones_item`: lock del RFQ, `numero = max(numero)+1 considerando cancelados`, `codigo` ITxx, validación material/espesor (espesor obligatorio si el material tiene espesores activos), no cancelar ítem con documentos vinculados.
- Todas `SECURITY DEFINER`, `search_path=''`, `REVOKE`/`GRANT` solo `service_role`.

### 4. Código TypeScript (sin UI)

- `src/modulos/rfq/` (tipos, servicios, validaciones Zod y acciones servidor con `can()` + cliente admin + `registrarLog` + `nuevoCorrelationId()`): obtener RFQ con ítems, guardar/cancelar ítem, cambiar estado, validar listo.
- `supabase.ts`: agrega tu bloque (marcadores `rfq_items:`, `estado_rfq`, `cambiar_estado_rfq:`, `validar_rfq_listo:`, `crear_item_rfq:`) **bajo `BLOQUEO-TIPOS.lock`** y verifica los 3 marcadores del protocolo §4bis.
- No toques pantallas ni rutas en esta ola.

## Pruebas

- pgTAP `supabase/tests/sii_b3_rfq_base.test.sql`: backfill correcto; folio `RFQ-MMYY_XX` atómico, único y tope 99; `ITxx` no se reutiliza (cancelar IT02 → el siguiente es IT03); transiciones/CAS/permisos de `cambiar_estado_rfq`; `validar_rfq_listo` (faltantes por sección y caso listo); privilegios y RLS de las tablas nuevas.
- Unitarias `tests/unitarias/rfq-*.test.ts`: mapeo etapa↔estado_rfq, formateo ITxx, validación LISTO (helpers puros), esquemas Zod.
- Integración/E2E: **no** en esta ola (sin UI); se harán en la ola 2.
- Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase test db` (tu test + global), `pnpm build`.

## Reporte

Solicita al PO aplicar tus migraciones (`2026100710*`) y registra en `estado/TERMINAL-B.md` (formato §7). Reporta para cross-review/commit. No git, no remoto.

## Exclusiones

Sin UI/rutas, sin cambios a consumidores de `etapa`, sin propuestas (B4), sin tocar clientes/catálogos/archivos/permisos, sin migraciones fuera de tu banda.
