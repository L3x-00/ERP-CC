# Prompt — TERMINAL A · B5 Orden de trabajo, ola 1 (modelo, snapshot y estados)

Trabajas en `D:\ERP-CC` en paralelo con B (B6 producción ola 1) y C (B4 propuestas ola 2). Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`, tu estado y `docs/plan-erp-sii/05-orden-trabajo.md` completo.

## Contexto

- B4 ola 1 ya está aplicada: `propuestas`, `propuesta_revisiones` con `accepted_revision_id` y `SALE_CONFIRMED`, `propuesta_items` con ITxx.
- B3 ola 2 retiró el puente `etapa`; la orden nace de la **revisión aceptada** (ADR-SII-03).
- Esta ola es solo SQL + dominio TS + pruebas: sin UI y sin migrar consumidores (eso es la ola 2).

## Fase 0 — Alinear el folio periódico (pequeño, primero)

El contador ahora crece a 3 dígitos (100+) con la mejora `20261007100008`. Tu RPC `ajustar_continuidad_folio_periodico` sigue limitando a 0..99:

- Nueva migración en tu banda `2026100715xxxx` (`...0002_sii_b3_continuidad_folios_rango.sql`): recrea `ajustar_continuidad_folio_periodico`/`consultar_continuidad_folio_periodico` con rango `0..999` y `siguiente` coherente; ajusta el hint/máximo del campo en `pestana-folios.tsx`.
- Prueba pgTAP: ajustar a 100 y 999 funciona; 1000 falla.

## Migraciones (banda propia `2026100712xxxx`)

Crea a mano; guarda de dependencias al inicio (B4 `20261007110001`, catálogos `20261006100001`, archivos E3).

### 1) `...0001_sii_b5_orden_base.sql`

- `ordenes_produccion`: `propuesta_id`, `propuesta_revision_id`, `rfq_id`, `folio_sii` (único; `O-MMYY_XX`), `estado_sii` (CHECK `CONFIRMADA|PLANIFICADA|LISTA|EN_PRODUCCION|PRODUCCION_COMPLETADA|CERRADA|CANCELADA`), `snapshot_json` jsonb, `cerrada_admin_en/por`; índice único parcial por `propuesta_revision_id`.
- `partidas_orden_produccion`: `codigo_item` (ITxx), `propuesta_item_id`.
- Tabla `orden_eventos_cambio` (orden_id, tipo, detalle jsonb, motivo, actor_id, correlation_id, creado_en).
- **Backfill**: `estado_sii` desde `estado` (borrador→CONFIRMADA, programada→PLANIFICADA, en_proceso→EN_PRODUCCION, completada→PRODUCCION_COMPLETADA, cancelada→CANCELADA, pausada→EN_PRODUCCION); históricos conservan `OP-######` sin `folio_sii` (grandfathering).
- RPC `crear_orden_desde_revision(p_revision_id, p_actor, p_correlation_id)` (SECURITY DEFINER, service_role): valida revisión `ACCEPTED`/`SALE_CONFIRMED`, cliente activo y gate de crédito (sobregiro solo admin, como hoy), locks deterministas, **idempotente** por `propuesta_revision_id` (`ya_existia`), copia partidas con `codigo_item`/ruteo/archivos vivos referenciados, congela `snapshot_json` (cabecera, ítems, ruteo, ids de archivos, observaciones), folio `O-MMYY_XX` (u `OI-MMYY_XX` si es interna), crea AR no cobrable como hoy salvo TI, auditoría.
- RPC `crear_orden_interna(p_datos, p_autorizacion, p_actor, p_correlation_id)` con permiso `orden_crear_interna` y autorización registrada (decisión del cliente: alta directa autorizada, sin propuesta).
- La aprobación antigua (`aprobar_oportunidad_y_crear_orden`, `marcar-ganada`) queda **deprecada**: no la borres, pero no la uses desde código nuevo.

### 2) `...0002_sii_b5_orden_estados.sql`

- `liberar_orden` (permite PLANIFICADA→LISTA con permiso `orden_liberar`), `cerrar_orden_administrativa` (100 % entregado, permiso `orden_cerrar_admin`; independiente del cobro), `ajustar_orden_post_aceptacion` (solo pre-producción, motivo, CAS, registra `orden_eventos_cambio`).
- Derivaciones automáticas: CONFIRMADA→PLANIFICADA cuando todas las partidas tienen programación; LISTA→EN_PRODUCCION con la primera sesión (trigger sobre `sesiones_trabajo` INSERT); →PRODUCCION_COMPLETADA cuando todas las metas se cumplen (reutiliza `privado.orden_produccion_completa`); CANCELADA conserva reglas de AR/pagos actuales.
- **Puente temporal de estados**: mantén `estado` legacy sincronizado con `estado_sii` (CONFIRMADA→borrador, PLANIFICADA→programada, LISTA→programada, EN_PRODUCCION→en_proceso, PRODUCCION_COMPLETADA→completada, CERRADA→completada, CANCELADA→cancelada) para no romper consumidores hasta la ola 2. Documenta que se retira en la ola 2.
- No inicies "a mano": sin RPC de "iniciar orden"; el estado deriva del avance.

## Código (dueño: `src/modulos/ordenes/**` dominio, sin UI)

Tipos, servicios y acciones servidor (Zod + `can()` + admin + `registrarLog` + `nuevoCorrelationId()`): crear desde revisión, crear interna, liberar, cerrar admin, ajustar post-aceptación. `supabase.ts` con lock; marcadores nuevos: `estado_sii`, `folio_sii`, `crear_orden_desde_revision:`.

## Pruebas

- pgTAP `sii_b5_orden.test.sql`: orden desde revisión aceptada (rechaza DRAFT/SENT), idempotencia, snapshot reconstruible tras mutar origen, folio O-/OI-, backfill, derivaciones (programación→PLANIFICADA; sesión→EN_PRODUCCION; metas→COMPLETADA; cierre admin al 100 %), TI con autorización, inmutabilidad post-producción de `ajustar_orden_post_aceptacion`.
- Unitarias: mapeo estado↔estado_sii, forma del snapshot, validaciones Zod.

## Errores de la ola anterior que NO debes repetir

1. **Formato numérico**: no uses `lpad(x, 2, '0')` sobre números que pueden superar 2 dígitos (trunca) ni `to_char(x,'FM00')` (desborda a `##`). Usa `CASE` como en `20261007100008` y prueba en pgTAP 99→100→101.
2. **"Hoy" único**: para fechas de calendario usa `hoyIso()` (fecha local del operador); no `toISOString()` para "hoy".
3. **Dependencias**: guarda `to_regclass`/columna al inicio de cada migración (orden `0610→0710→0711→0712→0715`).
4. **Migraciones**: solo PO/coordinador; sin git; `supabase.ts` solo con lock y marcadores de los 4 streams.
5. **Tras lotes de edición**: `pnpm typecheck` inmediato; si cambias etiquetas de UI, grep en `tests/` y actualiza.
6. **Pruebas mutantes** con `BLOQUEO-PRUEBAS.lock`; no toques módulos de B/C.

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (con lock) · `pnpm build`. Reporta en `estado/TERMINAL-A.md` (§7) y pide al PO aplicar tus migraciones.
