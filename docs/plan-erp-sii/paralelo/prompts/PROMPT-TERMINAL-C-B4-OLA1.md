# Prompt — TERMINAL C · B4 Propuestas, ola 1 (modelo, revisiones, costeo y aceptación)

Trabajas en `D:\ERP-CC` en paralelo con B (B3 ola 2) y A (folios). Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`, tu estado y `docs/plan-erp-sii/04-propuestas.md` §4.1–§4.5, §4.9–§4.10.

## Contexto

- `rfq_items` con `ITxx`, `catalogo_materiales/espesores/procesos`, `grupos_equipo/planeados`, `catalogo_proximas_acciones`, `archivos` y permisos `propuesta_*` ya existen y están aplicados.
- **Esta ola es solo SQL + dominio TS + pruebas**: sin UI, sin PDF, sin E2E (eso es la ola 2, con el spike ADR-SII-04).

## Migraciones (banda propia `2026100711xxxx`)

Crea los archivos a mano (no `migration new`). Guarda inicial de dependencias:

```sql
DO $$ BEGIN
  IF to_regclass('public.rfq_items') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100002_sii_b3_rfq_base antes';
  END IF;
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
END $$;
```

### 1) `...0001_sii_b4_propuestas_base.sql`

Tablas (DDL de referencia en `04-propuestas.md §4.1`; adáptalo con `IF NOT EXISTS`):
`propuestas` (rfq_id→pipeline, cliente_id, `folio_cnc` único con formato nuevo `CNC-MMYY_XX`, estado espejo, revision_vigente_id, `accepted_revision_id`, responsable, timestamps), `propuesta_revisiones` (letra A..Z, `folio_revision` único `CNC-MMYY_XX-A`, estado, `motivo_creacion`, `snapshot_cabecera jsonb`, flags `requiere_revision_ruteo/costeo`, canal/destino/envío/validación), `propuesta_items` (revision_id, `rfq_item_id`, `codigo` ITxx, descripción, cantidad>0, material/espesor, acabado/notas, precio, `es_descuento`, `activo`), `propuesta_item_operaciones`, `propuesta_item_ruteo` (secuencia, proceso, grupos, setup/run, `total_horas` generada, `requiere_revision`), `propuesta_revision_costos` (categoría enum, monto, nota), `propuesta_pdfs` (con `vigente` + único parcial por revisión), `propuesta_revision_acciones`.

- Folio: usa `generar_folio_periodico('CNC')` para `CNC-MMYY_XX` (contador nuevo de 2 dígitos; **no** reutilices `generar_folio_cnc` de 4 dígitos, que queda para históricos).
- Flujo: propuesta nace al **crear desde RFQ** (no en el insert directo): el folio se asigna en la RPC.
- **Frozen**: trigger que bloquea INSERT/UPDATE/DELETE en hijos cuando la revisión padre no está `DRAFT`; edición solo por RPC.
- **Versionado de PDF**: un solo `vigente` por revisión (índice único parcial); reemplazar desmarca el anterior y encadena.
- RLS de lectura: `propuesta_vista` **y** (dueño del RFQ o `ver_pipeline_equipo`) — no amplíes accesos; `GRANT SELECT` authenticated, `ALL` service_role.

### 2) `...0002_sii_b4_propuestas_acciones.sql` (o sección en 0001)

RPC `SECURITY DEFINER`, `search_path=''`, solo `service_role`, con CAS (`actualizado_en`), locks deterministas y auditoría por action:
- `crear_propuesta(p_rfq_id, p_actor, p_correlation_id)`: exige RFQ `READY_FOR_PROPOSAL`; crea propuesta + revisión A `DRAFT` copiando ítems/operaciones (`ITxx` intacto) y deja el RFQ `CONVERTED` en la misma transacción; idempotente si ya hay una `DRAFT` activa.
- `crear_nueva_revision(p_revision_origen, p_motivo, p_actor, p_correlation_id)`: **motivo obligatorio**; copia profunda (cabecera, ítems, operaciones, ruteo, costos, próxima acción); letra siguiente; tope `Z` (`limite_revisiones_alcanzado`); marca `requiere_revision_*` comparando cantidad/material/espesor/operaciones contra el predecesor.
- `editar_item_propuesta`, `editar_ruteo_item`, `editar_costos_revision`, `registrar_seguimiento` (próxima acción del catálogo + `OTHER` con texto obligatorio): solo `DRAFT`, CAS y permisos.
- `validar_revision` (→`READY_TO_SEND`): bloquea con flags `requiere_revision_*` pendientes y exige validación completa (error `requiere_revision_pendiente` con detalle).
- `rechazar_propuesta`, `cerrar_propuesta` (motivo obligatorio).
- `aceptar_revision(p_revision_id, ...)`: revisión en `SENT/FOLLOW_UP`; fija `accepted_revision_id` (puede ser anterior a la última); `confirmar_venta` → `SALE_CONFIRMED`.
- `calcular_totales_revision(p_revision_id)`: subtotal (ítems activos menos descuentos), IVA, total y margen `(subtotal − costo_total)/subtotal` (null si subtotal 0).

Backfill idempotente: RFQs con `folio_cnc` y estado `CONVERTED` → propuesta + revisión A (estado según etapa/orden; `accepted_revision_id` si hay orden vinculada), conservando el folio legacy en `snapshot_cabecera.folio_legacy`.

## Código (dueño: tú, `src/modulos/propuestas/**`, sin UI)

Tipos, servicios y acciones servidor (Zod + `can()` + admin + `registrarLog` + `nuevoCorrelationId()`). `supabase.ts` con lock; marcadores: `propuestas:`, `propuesta_revisiones:`, `accepted_revision_id`, `crear_nueva_revision:`.

## Pruebas

- pgTAP `supabase/tests/sii_b4_propuestas.test.sql`: frozen (editar SENT falla), nueva revisión copia y exige motivo, ITxx preservado, aceptar revisión anterior, totales/margen, flags “requiere revisión” bloquean validar, folio `CNC-MMYY_XX-A` único y tope Z, privilegios/RLS.
- Unitarias: espejo TS de totales/margen con la misma tabla de casos que el SQL, validaciones Zod, mapeo de estados.

## Errores de la ola anterior que NO debes repetir

1. **Orden de dependencias**: A `0610*` → B3 `0710*` → B4 `0711*`. Tu migración lleva guarda; si el PO las aplica fuera de orden, el mensaje debe decir exactamente qué falta.
2. **`supabase.ts`**: lock + verificación de marcadores de los 4 streams; si falta el de otro, repórtalo.
3. **Ediciones masivas**: `pnpm typecheck` inmediato tras cada lote.
4. **Etiquetas/testids**: si tocas specs, grep de textos viejos antes de reportar.
5. **Migraciones**: solo PO/coordinador; sin git.
6. **Pruebas mutantes**: con lock; no toques `src/modulos/rfq/**` (B) ni `src/modulos/catalogos/**` (A).

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm build`. Reporta en `estado/TERMINAL-C.md` (§7) y pide al PO aplicar `2026100711*`. La UI/PDF/E2E van en la ola 2.
