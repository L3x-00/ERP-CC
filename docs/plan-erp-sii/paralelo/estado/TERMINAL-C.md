# Estado TERMINAL C — Stream B2 Clientes

> Append-only. Cada entrada usa el formato §7 del `PROTOCOLO-PARALELO.md`.
> No editar entradas anteriores; agrega una nueva al final.

## 2026-10-05 — Arranque

- ESTADO: PENDIENTE DE INICIO
- Prompt: `docs/plan-erp-sii/paralelo/prompts/PROMPT-TERMINAL-C.md`
- Bloque: `docs/plan-erp-sii/02-clientes.md`
- Migraciones: banda `2026100630xxxx` (3 archivos)
- Bloqueos actuales: ninguno
- Siguiente: migraciones folio + comercial/estado + contactos lógicos, y pgTAP.

## 2026-10-05 — Cierre de implementación B2 (pendiente aplicación de migraciones)

- TERMINAL: C | FECHA-HORA: 2026-10-05 (sesión única)
- ESTADO: SUB-BLOQUE LISTO (gates de BD pendientes de que el PO aplique las 3 migraciones)
- TAREAS: SII-B2.1-01/02/03, SII-B2.2-01/02, SII-B2.3-01/02/03, SII-B2.4, SII-B2.5, SII-B2.6 y SII-B2.7 implementadas.
- ARCHIVOS:
  - Migraciones nuevas: `supabase/migrations/20261006300001_sii_b2_cliente_folio.sql`, `20261006300002_sii_b2_cliente_comercial_estado.sql`, `20261006300003_sii_b2_contactos_logicos.sql`.
  - pgTAP nuevo: `supabase/tests/sii_b2_clientes.test.sql` (75 aserciones).
  - Tipos: `src/compartido/tipos/supabase.ts` (bloqueo §4 tomado y liberado; bloques B2 verificados tras la edición de A/B).
  - Módulo: `src/modulos/clientes/**` (acciones nuevas `cambiar-estado-cliente`, `marcar-contacto-principal`, `desactivar-contacto-cliente`, `reactivar-contacto-cliente`; `crear/actualizar` sobre RPC; `comercial-cliente.tsx`; `condiciones-comerciales.ts`; ficha/formulario/tabla/contactos/tipos/utilidades/servicios/schemas).
  - Página: `src/app/(panel)/clientes/page.tsx` (banderas de permiso).
  - Tests: `tests/unitarias/clientes-comercial.test.ts`, `clientes-contactos-logicos.test.ts`, `clientes-contactos-ui.test.ts`; actualizados `clientes-crear-accion`, `clientes-filtros`, `clientes-alerta-credito`, `clientes-panel-tier`; fixtures `tests/unitarias/pipeline-cliente-rfq.test.ts` y `pipeline-selector-cliente.test.ts` (solo agregar campos nuevos del tipo `Cliente`; no se tocó `src/modulos/pipeline/**`).
  - E2E: `tests/e2e/clientes-ficha.spec.ts` (nuevo) y `tests/e2e/clientes-contactos.spec.ts` (baja lógica).
  - Integración: `tests/integracion/clientes-folios-concurrencia.test.ts` (8 altas concurrentes ⇒ 8 folios).
- MIGRACIONES: `20261006300001_sii_b2_cliente_folio.sql`, `20261006300002_sii_b2_cliente_comercial_estado.sql`, `20261006300003_sii_b2_contactos_logicos.sql` | APLICADA POR PO: no.
- GATES: unit 844/844 · lint 0 · typecheck 0 · pgTAP 75/75 (ejecutado en copia scratch del esquema local, sin tocar la BD del proyecto) · integración PENDIENTE (requiere migraciones aplicadas) · E2E focal+regresión PENDIENTE · `pnpm build` OK.
- EVIDENCIA:
  - Migraciones aplicadas 2 veces seguidas sobre `sii_b2_probe` (copia `pg_dump --schema-only` del stack local) sin errores ⇒ idempotentes; `pgTAP 75 ok / 0 not ok`.
  - `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 103 archivos / 844 pruebas, `pnpm build` OK.
  - Capturas visuales 1440/768 claro/oscuro: PENDIENTES (se generan con `E2E_CAPTURAR_VISUAL=si` en `tests/e2e/clientes-ficha.spec.ts` hacia `.ai-shared/qa/sii-b2/visual/`).
- BLOQUEOS:
  1. Las 3 migraciones requieren aplicación del PO (protocolo §2.3). Sin ellas no corren `supabase test db`, `pnpm test:integracion`, E2E ni capturas.
  2. `tests/integracion/clientes-folios-concurrencia.test.ts` no está en `pnpm test:concurrencia` (script del coordinador); sí corre en `pnpm test:integracion`. Pedir al coordinador agregarlo al script.
- SIGUIENTE: aplicadas las migraciones, correr pgTAP + integración + E2E focal (`clientes-ficha`, `clientes-contactos`, `clientes-historial`, `aceptacion-comercial`, `archivos-cliente`) con bloqueo de pruebas y generar capturas; luego reportar al coordinador para cross-review.

## 2026-10-05 — Cierre de B2: gates de BD, E2E y capturas VERDES

- TERMINAL: C | FECHA-HORA: 2026-10-05 (sesión de cierre)
- ESTADO: SUB-BLOQUE LISTO PARA CROSS-REVIEW/COMMIT (gates propios verdes; 2 fallos ajenos en el árbol reportados abajo).
- TAREAS: cierre de SII-B2.1 a SII-B2.7.
- MIGRACIONES: `20261006300001_sii_b2_cliente_folio`, `20261006300002_sii_b2_cliente_comercial_estado`, `20261006300003_sii_b2_contactos_logicos` | APLICADA POR PO: sí, local (por el coordinador con `supabase migration up --local --include-all`); remoto pendiente.
- GATES (con `BLOQUEO-PRUEBAS.lock` tomado y liberado):
  - `pnpm test:concurrencia` 5 archivos / 10 pruebas PASS (incluye `clientes-folios-concurrencia`: 8 altas concurrentes ⇒ 8 folios CLI distintos).
  - `pnpm test:integracion` 30 archivos / 226 pruebas PASS.
  - E2E focal + regresión 6/6 PASS: `clientes-ficha` (nuevo), `clientes-contactos` (baja lógica), `clientes-historial`, `aceptacion-comercial` (2), `archivos-cliente` (versión 2 + `reemplaza_a`).
  - `supabase test db`: `sii_b2_clientes.test.sql` 75/75 ok; el resto de suites ok salvo `sii_b3_rfq_base.test.sql` (ajeno, ver BLOQUEOS).
  - Sin bloqueo: `pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm build` 0.
  - `pnpm test` (unitarias): 843/862; los 19 fallos están en `ordenes-acciones`, `planeacion-acciones` y `operadores-gestion-acciones` (ajenos, ver BLOQUEOS). Todos los `clientes-*` y los fixtures de pipeline pasan.
  - Capturas: 12 PNG en `.ai-shared/qa/sii-b2/visual/` (`lista-clientes`, `ficha-comercial`, `ficha-contactos` × 1440/768 × claro/oscuro) generadas con `E2E_CAPTURAR_VISUAL=si`.
- EVIDENCIA:
  - Comandos exactos en el orden del protocolo §5: env local vía `supabase status -o env` (API_URL/ANON_KEY/SERVICE_ROLE_KEY, sin exponer valores), `E2E_HABILITAR_PRUEBAS_REMOTAS=si` y `E2E_CAPTURAR_VISUAL=si`.
  - Revisión del diff fuera de mapa (`tests/unitarias/pipeline-cliente-rfq.test.ts`, `pipeline-selector-cliente.test.ts`): **solo** se agregaron los campos nuevos `folio`, `moneda`, `creditoHabilitado`, `diasCredito` al fixture `Cliente`; cero cambios de lógica de negocio ni de aserciones.
- BLOQUEOS (ajenos, no tocados por C):
  1. `pnpm test`: 19 fallos en `tests/unitarias/{ordenes,planeacion,operadores-gestion}-acciones.test.ts` porque sus mocks de `@/nucleo/auditoria/registrar-log` no exportan `nuevoCorrelationId` (retrofit de E4/coordinador). Corrección: agregar `nuevoCorrelationId: () => '...'` a esos mocks (fuera del mapa de C).
  2. `supabase test db`: `supabase/tests/sii_b3_rfq_base.test.sql` falla por `catalogo_procesos_prefijo_valido` al insertar `B3_SIN_ARCH`/prefijo `B3S` (stream B3/A, fuera del mapa de C).
- SIGUIENTE: cross-review y commit del coordinador. Tras integrar, recordar que las 3 migraciones B2 siguen pendientes de aplicación en remoto por el PO.

## 2026-10-06 — B4 Propuestas ola 1 (SQL + dominio + pruebas): SUB-BLOQUE LISTO

- TERMINAL: C | FECHA-HORA: 2026-10-06
- ESTADO: SUB-BLOQUE LISTO (SQL/dominio/pruebas); pendiente que el PO aplique `2026100711*` para pgTAP en la BD del proyecto. Sin UI/PDF/E2E (ola 2).
- TAREAS: SII-B4.1 (modelo), B4.2 (estados y acciones), B4.3 (revisiones A..Z), B4.4 (congelamiento SENT), B4.5 (ítems/ruteo/costeo/totales), B4.9 (requiere revisión), B4.10 (aceptación de la revisión exacta).
- ARCHIVOS:
  - Migraciones: `supabase/migrations/20261007110001_sii_b4_propuestas_base.sql` (9 tablas, checks, RLS, frozen, PDF versionado, backfill) y `20261007110002_sii_b4_propuestas_acciones.sql` (12 RPC).
  - pgTAP: `supabase/tests/sii_b4_propuestas.test.sql` (88 aserciones).
  - Dominio: `src/modulos/propuestas/**` (`tipos/indice.ts`, `servicios/calcular-totales-propuesta.ts`, `servicios/errores-propuesta.ts`, `servicios/obtener-propuesta.ts`, `utilidades/indice.ts`, `validaciones/esquemas-propuestas.ts`, 11 acciones servidor en `acciones/**`).
  - Tipos: `src/compartido/tipos/supabase.ts` (bloqueo §4 tomado/liberado; 9 tablas + 12 funciones insertadas desde `supabase gen types` de la copia scratch).
  - Unitarias: `tests/unitarias/propuestas-totales.test.ts` (tabla de casos compartida con el SQL) y `propuestas-esquemas.test.ts` (Zod, estados, mapeos, errores).
- MIGRACIONES: `20261007110001_sii_b4_propuestas_base`, `20261007110002_sii_b4_propuestas_acciones` | APLICADA POR PO: no (validadas 2× idempotentes en copia scratch `sii_b4_probe`).
- GATES: unit 109 archivos / 887 pruebas · lint 0 · typecheck 0 · build 0 · pgTAP `sii_b4_propuestas` 88/88 en scratch · integración/E2E N/A en ola 1.
- EVIDENCIA:
  - Copia scratch del esquema local (pg_dump) + `-f b4m1.sql -f b4m2.sql` dos veces sin errores; `ok=88 notok=0`.
  - Guardas de dependencia: M1 exige `rfq_items`, `contadores_folio_periodico`, `catalogo_procesos`; M2 exige `propuestas` y `privado.actor_con_permiso`.
  - Marcadores §4bis verificados: `credito_habilitado` (C-B2), `catalogo_materiales` (A), `obtener_actividad` (B), `propuestas:`/`propuesta_revisiones:`/`accepted_revision_id`/`crear_nueva_revision:` (C-B4).
- NOTAS DE IMPLEMENTACIÓN (para el cross-review):
  1. Folio nuevo `CNC-MMYY_XX` vía `generar_folio_periodico('CNC')`; el histórico de 4 dígitos se conserva y el folio legacy del RFQ queda en `snapshot_cabecera.folio_legacy`.
  2. Frozen: GUC local `sii.b4_rpc` que fijan las RPC; cualquier UPDATE directo de la revisión o DML de hijos con padre no-DRAFT falla `revision_congelada`.
  3. "Requiere revisión" (4.9): la copia A→B nace idéntica; los flags se marcan al editar cantidad/material/espesor de una revisión B+ (comparación contra el predecesor) y se limpian al confirmar ruteo/costeo. `validar_revision` bloquea con `requiere_revision_pendiente` + detalle.
  4. `registrar_seguimiento_propuesta` se permite en DRAFT/SENT/FOLLOW_UP (tabla §4.2); en SENT pasa a FOLLOW_UP.
  5. Extra técnico: tabla `propuesta_revision_eventos` (bitácora de transición con correlationId, §4.2 "evento en la revisión") y `actualizado_en` en `propuesta_items` para el CAS de ítem.
  6. `enviar_revision`/PDF/UI quedan explícitamente para la ola 2 (spike ADR-SII-04); la aceptación se probó con revisiones SENT preparadas en el arnés.
- BLOQUEOS: ninguno propio. Dependencia de orden: aplicar A `2026100610*` → B3 `2026100710*` → C `2026100711*` (las guardas lo verifican).
- SIGUIENTE: PO aplica `2026100711*` en local/remoto; luego `supabase test db` completo y pase a ola 2 (UI `/propuestas`, PDF, envío atómico).


