# Estado TERMINAL B — Stream E4 Actividad (B1.10)

> Append-only. Cada entrada usa el formato §7 del `PROTOCOLO-PARALELO.md`.
> No editar entradas anteriores; agrega una nueva al final.

## 2026-10-05 — Arranque

- ESTADO: PENDIENTE DE INICIO
- Prompt: `docs/plan-erp-sii/paralelo/prompts/PROMPT-TERMINAL-B.md`
- Bloque: `docs/plan-erp-sii/01-sistema-catalogos.md` §1.10
- Migraciones: banda `2026100620xxxx`
- Bloqueos actuales: ninguno
- Siguiente: migración de `logs.correlation_id` + RPC `obtener_actividad` y pgTAP.

## 2026-10-05 17:20 — B1.10 Actividad (sub-bloque listo)

TERMINAL: B | FECHA-HORA: 2026-10-05 17:20
ESTADO: SUB-BLOQUE LISTO (pendiente de verificación del coordinador)
TAREAS:
- SII-B1.10-01 LISTO: `logs.correlation_id` + índice parcial + RPC `obtener_actividad` (SECURITY DEFINER, `search_path=''`, solo service_role, actor activo con `actividad_vista` o admin, contexto solo admin, etiquetas resueltas en SQL, cursor `(creado_en,id)` con tope 100).
- SII-B1.10-02 LISTO (vista `/actividad` con filtros usuario/módulo/acción/registro/rango, paginación por cursor y agrupación visual por `correlationId`). Sin Realtime: el prompt de E4 no lo pidió y la pestaña Bitácora se conserva intacta.
- SII-B1.10-03 LISTO: `registrar-log` acepta `correlationId` opcional (compatible hacia atrás) y exporta `nuevoCorrelationId()`.

ARCHIVOS:
- Nuevos: `supabase/migrations/20261006200001_sii_b1_actividad.sql`, `supabase/tests/sii_b1_actividad.test.sql`, `src/modulos/auditoria/acciones/obtener-actividad.ts`, `src/modulos/auditoria/componentes/tabla-actividad.tsx`, `src/modulos/auditoria/utilidades/actividad.ts`, `src/modulos/auditoria/validaciones/esquemas-actividad.ts`, `src/app/(privado)/actividad/page.tsx`, `src/app/(privado)/actividad/loading.tsx`, `tests/unitarias/actividad-filtros.test.ts`, `tests/unitarias/actividad-agrupacion.test.ts`, `tests/unitarias/actividad-correlacion.test.ts`, `tests/e2e/actividad.spec.ts`.
- Modificados: `src/nucleo/auditoria/registrar-log.ts`, `src/modulos/auditoria/tipos/indice.ts`, `src/modulos/auditoria/utilidades/enlace-registro.ts` (función nueva, no cambia la existente), `src/compartido/componentes/navegacion/modulos-navegacion.ts` (entrada Actividad, permiso `actividad_vista`), `src/compartido/tipos/supabase.ts` (bloqueo §4; el bloque `logs.correlation_id` + `obtener_actividad` ya estaba presente al tomar el lock y se verificó; no se tocó nada ajeno).

MIGRACIONES: `20261006200001_sii_b1_actividad.sql` | APLICADA EN LOCAL CON AUTORIZACIÓN EXPLÍCITA DEL PO (pregunta interactiva; psql + `migration repair --status applied --local`). NO aplicada en remoto: pendiente PO. Para reaplicar limpio: `supabase migration up --local` cuando A/C también estén listas.

GATES:
- unit: 840/840 (incluye 34 focal de actividad: filtros/agrupación/enlaces/correlación).
- lint: 0 errores en árbol combinado. typecheck: 0. build: OK (`/actividad` presente).
- pgTAP focal `sii_b1_actividad.test.sql`: 27/27.
- pgTAP suite completa: 440/449; los 9 fallos son SOLO de `sii_b1_catalogos.test.sql` (A) y `sii_b2_clientes.test.sql` (C) porque sus migraciones aún no están aplicadas en local (bloqueo de sus streams, no mío).
- integración: 223/223.
- E2E focal `actividad.spec.ts` 2/2 + regresión `bitacora-configuracion.spec.ts` 2/2 y `configuracion-flujo.spec.ts` 2/2 = 6/6.
- Visual: `.ai-shared/qa/sii-b1-e4/visual/actividad-{escritorio,tableta}-{claro,oscuro}.png` (4 capturas, `E2E_CAPTURAR_VISUAL=1`).

EVIDENCIA (comandos):
- `pnpm typecheck` EXIT 0; `pnpm lint` EXIT 0; `pnpm test` 840 passed.
- `supabase test db supabase/tests/sii_b1_actividad.test.sql --local` → 27/27 PASS.
- `pnpm test:integracion` → 29 archivos, 223 passed.
- `pnpm exec playwright test tests/e2e/actividad.spec.ts tests/e2e/bitacora-configuracion.spec.ts tests/e2e/configuracion-flujo.spec.ts` → 6 passed.
- `pnpm build` EXIT 0.

PROPAGACIÓN PENDIENTE (retrofit coordinado, fuera de este stream): acciones que deben generar `nuevoCorrelationId()` por acción de negocio y heredarlo en eventos hijos: clientes (crear/actualizar/estado/tier/contactos/documento/vincular), pipeline (prospecto, etapa, datos, etiquetas, cotización, adjuntos, ganada/pérdida/retiro, orden interna), órdenes (crear/heredada/repetir/reactivar, edición borrador, estado, avance, tiempos, consumo, metas, archivos, operador), planeación (programar/reprogramar/capacidad/preparación), producción (sesiones, archivos, nota de entrega), cobranza (AR, pagos, abono heredado, factura, aplicar saldo, anular, reverso, consolidar), gastos (gasto, OCR, estado), inventario (material, entradas/salidas), configuración (operador, continuidad folios), permisos (matriz, rol, estado). Lecturas y login/logout pueden quedarse sin correlación.

BLOQUEOS: ninguno propio. Nota: A/C tienen migraciones sin aplicar en local; no me bloquean. El bloque de tipos de `supabase.ts` preexistía (otro escritor) y se verificó bajo lock; si A/C guardan encima, el coordinador debe confirmar que sigue presente.

SIGUIENTE: verificación del coordinador y commit; después, retrofit de `correlationId` en Server Actions (coordinador) y aplicación remota de la migración por el PO.

## 2026-10-05 18:10 — B3 RFQ ola 1 (modelo, ítems, estados y folio) — SUB-BLOQUE LISTO

TERMINAL: B | FECHA-HORA: 2026-10-05 18:10
ESTADO: SUB-BLOQUE LISTO (sin UI ni rutas; pendiente de verificación del coordinador)
TAREAS:
- B3.5 folio periódico genérico LISTO: `contadores_folio_periodico` + `generar_folio_periodico(tipo)` con UPSERT atómico, tope 99 (`folio_periodo_agotado`) y alta automática de `folio_rfq` en `pipeline`.
- B3.1 modelo RFQ LISTO: columnas de cabecera en `pipeline`, tablas `rfq_items`/`rfq_item_operaciones`/`rfq_eventos`, RLS de lectura por RFQ, Realtime de `rfq_items`, puente `estado_rfq`↔`etapa` y `backfill_rfq_legacy()` idempotente.
- B3.2/B3.3/B3.6 RPCs LISTO: `validar_rfq_listo`, `cambiar_estado_rfq` (CAS + permisos + transiciones + motivo + eventos), `crear_item_rfq`, `actualizar_item_rfq`, `cancelar_item_rfq`, `reemplazar_operaciones_item` (todas SECURITY DEFINER `search_path=''`, solo service_role).
- B3.1 TS sin UI LISTO: `src/modulos/rfq/**` (tipos, utilidades puras, Zod, servicio de ficha y 5 acciones con `can()` + cliente admin + `registrarLog` + `nuevoCorrelationId()`).

ARCHIVOS:
- Nuevos: `supabase/migrations/20261007100001_sii_b3_folio_periodico.sql`, `20261007100002_sii_b3_rfq_base.sql`, `20261007100003_sii_b3_rfq_acciones.sql`, `supabase/tests/sii_b3_rfq_base.test.sql`, `src/modulos/rfq/tipos/indice.ts`, `src/modulos/rfq/utilidades/estados.ts`, `src/modulos/rfq/validaciones/esquemas-rfq.ts`, `src/modulos/rfq/servicios/obtener-rfq.ts`, `src/modulos/rfq/acciones/{obtener-rfq,validar-rfq-listo,cambiar-estado-rfq,guardar-item-rfq,cancelar-item-rfq,utilidades-acciones}.ts`, `tests/unitarias/rfq-{estados,items,errores}.test.ts`.
- Modificados: `src/compartido/tipos/supabase.ts` (bajo `BLOQUEO-TIPOS.lock`: columnas RFQ de `pipeline`, 4 tablas y 7 RPC nuevas; marcadores §4bis verificados: `catalogo_materiales:`, `obtener_actividad:`, `credito_habilitado:`).

MIGRACIONES: `20261007100001/0002/0003_sii_b3_*` | APLICADAS EN LOCAL CON AUTORIZACIÓN EXPRESA DEL PO (`supabase migration up --local`). NO aplicadas en remoto: pendiente PO.

GATES:
- unit: 862/862 (incluye 18 nuevas de RFQ).
- lint: 0. typecheck: 0. build: OK.
- pgTAP focal `sii_b3_rfq_base.test.sql`: 56/56.
- pgTAP global: 30 archivos, 611/611 PASS (sin regresión por los triggers de folio/puente).
- Integración/E2E: no aplican en la ola 1 (sin UI). `BLOQUEO-PRUEBAS.lock` estaba en uso por Terminal A; no se requirió.

DECISIONES / INTERPRETACIONES (sin inventar reglas de negocio):
- Puente bidireccional `estado_rfq`↔`etapa`: `READY_FOR_PROPOSAL`↔`negociacion` es la única correspondencia posible (`cotizado` ya mapea a CONVERTED). Se retira en la ola 2 al migrar consumidores.
- CRUD de ítems bloqueado en `READY_FOR_PROPOSAL` y terminales (`rfq_no_editable`): editar exige `marcar_incompleto` para no invalidar LISTO en silencio (la UI de ola 2 lo reflejará).
- Validación LISTO: "cliente activo" = existe y no está `inactivo` (un prospecto es válido); contacto debe existir, pertenecer al cliente y estar activo; archivo técnico = `archivos.vigente` con clase CAD/DIBUJO/ESPECIFICACIONES del RFQ o de un ítem activo, solo si algún proceso de ítem activo tiene `requiere_archivo_tecnico`.
- Backfill: `numero = orden` si está en 1..99 y es único; si no, primer consecutivo libre; >99 ítems por RFQ aborta con `items_agotados` (fallo seguro). Material/espesor legacy se mapean al catálogo por código/nombre/etiqueta; lo no mapeado queda en `notas` (`material_legacy`/`espesor_legacy`/`procesos_legacy`).
- `cancelar_item_rfq` considera "documentos vinculados" los `archivos` vigentes del ítem; B4/B5 extenderán la guarda a propuesta/orden.
- Los `logs` de las acciones RFQ usan módulo `'pipeline'` para que la vista Actividad (E4) resuelva etiquetas y enlaces; la ola 2 lo cambia a `'rfq'` junto con la ruta.

EVIDENCIA (comandos):
- `pnpm typecheck` EXIT 0; `pnpm lint` EXIT 0; `pnpm test` 862 passed; `pnpm build` EXIT 0.
- `supabase test db supabase/tests/sii_b3_rfq_base.test.sql --local` → 56/56 PASS.
- `supabase test db --local` → Files=30, Tests=611, Result: PASS.
- `supabase migration up --local` (autorizado por PO) aplicó solo `2026100710*`.

BLOQUEOS: ninguno propio. Nota: `BLOQUEO-PRUEBAS.lock` activo de Terminal A (no me bloqueó).

SIGUIENTE: ola 2 (UI `/rfq`, ficha, pestaña Archivos, migración de consumidores de `etapa` y retiro del puente) cuando el coordinador la asigne; el PO aplica `2026100710*` en remoto.
