# Prompt — TERMINAL C · B7 Entregas, ola 1 (modelo, folio NE y evidencias)

Trabajas en `D:\ERP-CC` en paralelo con A (B5 ola 2: UI de órdenes) y B (B6 ola 2: UI de piso). Lee el protocolo, tu estado y `07-entregas.md` completo.

## Contexto

B4 quedó cerrado (`6b0c524`, `5aa3ca9` + fix `d91fdc8`). Ahora B7: las entregas actuales viven en `notas_entrega` (`NE-######`, parciales por partida) con activación de AR al entregar total. Esta ola es **SQL + dominio**, sin UI y **sin tocar `src/modulos/produccion/**`** (B lo está editando): crea el módulo `src/modulos/entregas/**` y una RPC nueva; el flujo actual sigue funcionando.

## Migración (banda propia `2026100714xxxx`)

Guarda `to_regclass` de dependencias (B5 `estado_sii`/`snapshot_json`, `archivos`, `ordenes_produccion`, B6 `corridas` si aplica) con mensaje de orden.

`...0001_sii_b7_entregas.sql`:

- `notas_entrega`: `folio_sii` (`NE-MMYY_XX-YY`, único; XX = consecutivo de la orden, YY = entrega de esa orden), `entregado_por_id`, `recibido_por_id` (contacto), `solicitud_id` (único parcial, idempotencia) y lo necesario para “quién entrega/recibe” y fecha de entrega.
- `partidas_nota_entrega`: `codigo_item` (ITxx del snapshot de la orden, backfill desde partida).
- Folio: deriva de `ordenes_produccion.folio_sii` (`O-MMYY_XX`) + consecutivo de entregas con lock de la orden; históricos conservan `NE-######` (grandfathering).
- **RPC `registrar_entrega(p_orden_id, p_renglones jsonb, p_recibido_por, p_contacto_id, p_entregado_por, p_solicitud_id, p_actor, p_correlation_id)`** (`SECURITY DEFINER`, service_role): valida permiso `entrega_generar`, orden en `EN_PRODUCCION|PRODUCCION_COMPLETADA`, cantidades ≤ producido y ≤ pendiente por ítem, **idempotente por `solicitud_id`**, locks partidas→orden→creador (mismo orden que hoy), escribe renglones con `codigo_item` y dispara lo existente: archivo de la orden y activación de AR al cubrir el total. **No dupliques** la lógica del trigger actual: reúsala.
- Evidencia y firma usan el modelo `archivos` (entidad `entrega`; clases `evidencia`, `firma`, `firma_escaneada`); sin reemplazo silencioso (versionado E3).
- RLS de lectura por `entrega_generar`/`orden_vista`/`ver_finanzas`; Realtime de `notas_entrega` si la UI futura lo usará.

## Código (dueño: `src/modulos/entregas/**`, sin UI)

Tipos, servicios y acciones servidor (Zod + `can()` + admin + `registrarLog` + `nuevoCorrelationId()`): preparar/registrar entrega, listar entregas por orden y pendientes por ítem, vincular evidencia/firma. `supabase.ts` con lock; marcadores: `registrar_entrega:`, `folio_sii` en `notas_entrega`, `solicitud_id`.

## Pruebas

- pgTAP `sii_b7_entregas.test.sql`: folio `NE-MMYY_XX-YY` consecutivo, único y no reutilizado; parciales por ITxx que no exceden producido/pendiente; idempotencia con el mismo `solicitud_id`; activación de AR al cubrir el 100 % (regresión); herencia a históricos legacy; privilegios/RLS.
- Unitarias: formateo del folio, agrupación de pendientes por ITxx, esquemas Zod.
- Integración/E2E: no en esta ola (la UI `/entregas` es la ola 2).

## Errores de olas anteriores — no repetir

1. **Consecutivos**: `CASE` (nunca `lpad` fijo ni `FM00`); prueba 9→10 y 99→100.
2. **Dependencias**: guardas `to_regclass`; orden `0610→0710→0711→0712→0713→0714`.
3. **No toques** `src/modulos/produccion/**` (B6 ola 2) ni `src/modulos/ordenes/**` (A): si necesitas su contrato, repórtalo como bloqueo.
4. **Idempotencia y locks**: mismo orden de locks del flujo actual; el reintento no duplica ni activa AR dos veces.
5. **Specs futuros**: filtra por folio/ITxx antes de aserciones; scopea botones duplicados; reintenta ante Realtime.
6. Migraciones solo PO/coordinador; `supabase.ts` con lock + marcadores; sin git; pruebas mutantes con lock.

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm build` (integración si el contrato existente no muta). Reporta en `estado/TERMINAL-C.md` (§7) y pide al PO aplicar `2026100714*`.
