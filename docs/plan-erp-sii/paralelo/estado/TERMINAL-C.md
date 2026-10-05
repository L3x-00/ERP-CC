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


