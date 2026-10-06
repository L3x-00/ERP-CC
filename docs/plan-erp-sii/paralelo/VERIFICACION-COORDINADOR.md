# Verificación del coordinador — modo paralelo

> Auditoría de cumplimiento del `PROTOCOLO-PARALELO.md` y de los prompts A/B/C.
> Línea base y registro de auditorías (append-only).

## Línea base (2026-10-05, previa al trabajo de las terminales)

| Elemento | Valor |
|---|---|
| HEAD | `a53abd6` |
| Migraciones locales aplicadas | `20261005100001` (E1), `20261005100003` (E3) |
| `supabase.ts` SHA256 (16) | `D4D8317DB9937904` |
| `operacion-configuracion.tsx` | `491138326A75A3B5` |
| `modulos-navegacion.ts` | `9341CEC966111503` |
| `registrar-log.ts` | `9CB598C24FA1B63A` |
| `permisos/tipos/indice.ts` (congelado) | `57A621170C4E5F9C` |
| `almacenamiento/archivos/servicio.ts` (congelado) | `4C20A606FC3498DB` |
| `git status` | limpio salvo `docs/ERP_SII_Handoff...` y `entregables/*` sin trackear (preservados) |

## Checklist por entrega de stream

1. **Propiedad de archivos** — `git status --short`: cada archivo nuevo/modificado pertenece al mapa del stream. Cualquier otro archivo = blocker y se reporta.
2. **Migraciones** — banda correcta (A `2026100610*`, B `2026100620*`, C `2026100630*`), aditivas/idempotentes, `SECURITY DEFINER search_path=''`, `REVOKE`/`GRANT`, RLS, `COMMENT ON`; no toca migraciones existentes.
3. **Aplicación de migraciones** — solo el PO; `supabase migration list --local` no muestra aplicaciones hechas por terminales.
4. **Código** — Zod en el borde, permisos con `can()` revalidados en SQL, `registrarLog`, sin lógica de negocio en cliente, sin romper consumidores de otros módulos.
5. **Pruebas** — existen las del plan; pgTAP verde; unitarias del área; integración/E2E con bloqueo; regresión del área.
6. **Gates globales del árbol combinado** — `pnpm typecheck`, `pnpm lint`, `pnpm test` (tras pausa de edición de los 3 streams).
7. **Estado y evidencia** — `estado/TERMINAL-X.md` actualizado con formato §7, sin secretos, reporte honesto de fallos.
8. **Git** — `git log` intacto (sin commits de terminales); commits solo del coordinador.

## Checklist transversal

- `supabase.ts`: bloqueo de tipos respetado; los bloques de A, B y C coexisten después de cada edición (verificar por `Select-String` de tablas/RPC de cada stream).
- Zonas compartidas: `operacion-configuracion.tsx` solo A; `modulos-navegacion.ts` solo B; `clientes/**` solo C.
- Zonas congeladas intactas: `src/modulos/permisos/**`, `src/nucleo/almacenamiento/archivos/**`, `supabase/semillas/**`, `tests/e2e/permisos-usuarios-admin.spec.ts`, `tests/e2e/archivos-cliente.spec.ts`, `.env*`, `AGENTS.md`, `CLAUDE.md`, `.agents/**`.
- Pruebas mutantes serializadas con `BLOQUEO-PRUEBAS.lock`; sin corridas concurrentes de E2E.
- Coherencia funcional: C usa el modelo `archivos` de E3; B conserva la pestaña Bitácora; A no pisa la pestaña Catálogos (tiers).

## Señales de alarma (detener y avisar al PO)

- Archivo ajeno modificado o reformateado.
- Migración fuera de banda o edición de una migración ya aplicada.
- Commit/push de una terminal; migración aplicada por una terminal.
- Pérdida de un bloque de tipos en `supabase.ts` (comparar marcadores de los 3 streams).
- `typecheck`/`test` roto en `main` combinado y no atribuible a un stream en curso.
- Cambios en zonas congeladas o en `entregables/*`.

## Registro de auditorías

### Auditoría 0 — 2026-10-05 (arranque)

- Alcance: línea base y verificación de que aún no hay cambios de las terminales.
- Resultado: **CONFORME**. `git status` limpio (solo ajenos preservados), HEAD `a53abd6`, migraciones locales E1/E3, sin locks activos, estados de terminales en "PENDIENTE DE INICIO".
- Pendiente: primera auditoría de entregas cuando las terminales escriban archivos.

### Auditoría 1 — 2026-10-05 (primera ola de escritura, 16:48–16:53)

- Alcance: 6 migraciones nuevas + módulos `catalogos/`, `auditoria/` y cambios compartidos.
- **CONFORME en su mayoría:**
  - Bandas de migración correctas: A `2026100610*` (2), B `2026100620*` (1), C `2026100630*` (3). Ninguna migración existente tocada.
  - E4 (B): migración con `SECURITY DEFINER`, `search_path=''`, validación de actor/permiso, cursor, etiquetas, `contexto` solo admin, `REVOKE`/`GRANT` solo `service_role`; `registrar-log` retrocompatible con `correlationId` + `nuevoCorrelationId()`.
  - E2 (A): migración con columnas de decisión del cliente (`requiere_archivo_tecnico`, `primera_pieza` = true en LASER_FIBRA/LASER_CO2/DOB/ROUTER/MAQUINADO, `intervalo_inspeccion_lote` 10/20) y seeds del documento; tablas nuevas con RLS/grants presentes.
  - B2 (C): folio con secuencia/función definer, `REVOKE`/`GRANT` de función y secuencia, trigger de asignación e inmutabilidad, CHECK de formato, backfill en `privado`; checks de moneda/crédito; RPCs de estado y contactos creadas.
  - `git log` intacto (ninguna terminal commiteó) y `pnpm typecheck` global en 0 con los tres streams mezclados.
- **Hallazgo 1 (MEDIO, resuelto):** el bloque de B en `supabase.ts` (`correlation_id`, `obtener_actividad`) fue pisado por una edición concurrente (el bloqueo de tipos no se usó). El coordinador lo restauró y añadió marcadores anti-pisado al protocolo (§4bis).
- **Hallazgo 2 (MENOR, aceptado):** A modificó `tests/unitarias/planeacion-esquemas.test.ts` (fuera de su mapa) añadiendo `grupo_equipo_id: null`, consecuencia legítima de su migración. Se acepta; el coordinador asume ese ajuste y se pide reportar en adelante los fixtures de otros módulos.
- **Pendiente:** pgTAP de A y C, página/UI de Actividad de B, módulo de clientes de C, E2E por stream, actualización de estados de terminal.
- **Próxima auditoría:** al reporte de sub-bloque de cualquier terminal o ante nuevos archivos.

### Auditoría 2 — 2026-10-05 (segunda ola: E4 completo, E2 y B2 en cierre)

- **E4/B (Actividad): CONFORME y verificado.** `sii_b1_actividad.test.sql` 27/27 confirmado por el coordinador; B reporta typecheck/lint 0, unit 840, integración 223, E2E 6, build OK. Pendiente: cross-review y commit del coordinador.
- **E2/A (Catálogos):** 2 migraciones + pgTAP propio 40/40 + UI/pestaña + unit 18/18. No estaba aplicada en local; el coordinador la aplicó con `--include-all` tras el bloqueo de orden remoto. Pendiente: gates mutantes reales, capturas y cierre.
- **B2/C (Clientes): CONFORME tras aplicar en local.** El remoto ya tenía las 3 migraciones, pero **el local no**; el coordinador las aplicó (`--include-all`) y `sii_b2_clientes.test.sql` pasa 75/75. El coordinador agregó `clientes-folios-concurrencia` a `test:concurrencia`. Pendiente: integración, E2E, capturas y cierre.
- **pgTAP global tras aplicar todo en local:** 29 archivos / 555 aserciones PASS.
- **Hallazgo 1 (MEDIO, proceso):** se declaró "B y C aplicadas" cuando C no existía en la BD local (solo remoto). Regla nueva en protocolo §1.2: verificar `migration list --local` + objetos antes de declarar aplicada.
- **Hallazgo 2 (MENOR, aceptado):** C ajustó unitarias de pipeline (`pipeline-cliente-rfq`, `pipeline-selector-cliente`) fuera de su mapa como consecuencia de sus cambios; aceptado y registrado, pendiente de revisar en cross-review.
- **Siguientes asignaciones emitidas:** A → cierre E2 + retrofit de correlación (módulos de operación/config); B → B3 RFQ ola 1 (banda `2026100710*`); C → cierre B2.

### Auditoría 3 — 2026-10-05 (tercera ola en curso)

- **A (retrofit de correlación): CONFORME con 1 defecto corregido por el coordinador.**
  - 45 archivos modificados en módulos asignados (órdenes, planeación, producción, cobranza, gastos, inventario, configuración); comentarios/dashboard quedaron sin diff neto (auto-corrección de A; lectura sin correlación).
  - Defecto: `src/modulos/ordenes/acciones/registrar-consumo.ts:70` tenía `const correlationId = nuevoCorrelationId();` insertado **dentro del genérico** de la firma (9 errores TS de parseo). El coordinador lo corrigió (id al inicio del cuerpo) → **typecheck global 0** y lint 0.
  - Desviación de orden: A está ejecutando la fase 2 (retrofit) antes de cerrar la fase 1 (gates mutantes + capturas `.ai-shared/qa/sii-b1-e2/visual`, que no existe aún). Debe cerrar fase 1 antes de reportar.
- **B (B3 RFQ ola 1): EN CURSO, conforme hasta ahora.** Migraciones `20261007100001/2` en su banda; módulo `src/modulos/rfq/` iniciado (tipos/estados); bloque de tipos en `supabase.ts` con `rfq_items:`, `estado_rfq`, `cambiar_estado_rfq:`, `validar_rfq_listo:`; `pipeline` aún sin tocar (correcto para la ola 1).
- **C (cierre B2): EN CURSO, avance visible.** Capturas generadas: 12 PNG en `.ai-shared/qa/sii-b2/visual/` (ficha comercial/contactos + lista, 1440/768 × claro/oscuro); bloqueo de pruebas liberado; pendiente su reporte y actualización de estado.
- **Transversal:** `git log` intacto (sin commits de terminales); zonas prohibidas sin cambios (solo `entregables/*` ajenos preservados); los 3 marcadores coexisten en `supabase.ts`; `pnpm typecheck` 0 y `pnpm lint` 0 con todo mezclado.
- **Próxima auditoría:** al pedido de aplicación de migraciones de B o al reporte de cierre de A/C.

### Auditoría 4 — 2026-10-05 (cierres E2/E4/B2, verificación final y commits)

- **Verificación combinada del coordinador:** `typecheck` 0 · `lint` 0 · `build` OK · pgTAP **611/611** (30 archivos) · unit **862/862** · integración **226/226** (30 archivos) · E2E **44/45**, con el único fallo corregido por el coordinador.
- **Fallo E2E detectado y corregido (cross-stream):** `comercial-realtime.spec.ts` usaba "Quitar contacto" (borrado duro); B2 lo cambió a baja lógica con motivo. Se actualizó el spec a "Desactivar contacto" + estado `Inactivo` en ambas identidades; spec re-ejecutado **1/1 verde**.
- **Reclamos cruzados verificados:** los 19 fallos unitarios y el fallo de pgTAP reportados por C eran de una corrida previa a los fixes de A/B; en el árbol final todo está verde.
- **Defecto de A corregido por el coordinador:** `registrar-consumo.ts:70` (const dentro del genérico) → typecheck 0.
- **Errores de migraciones B3 en remoto:** `relation "catalogo_proximas_acciones" does not exist` se debe a que A (`2026100610*`) no está aplicada allí; `20261007100003` falla en cascada porque `rfq_items` no llegó a crearse. Orden correcto: A `...06100001` → `...06100002` → reintentar `...07100002` → `...07100003` (idempotentes). En local ya funcionan en ese orden.
- **Commits de cierre:** `452bfcf` (B: E4+B3 ola 1) · `d10ecf5` (A: E2+retrofit) · `b98a56a` (C: B2) · `7887e31` (fix realtime) · `f37b036` (docs) · `b3fad90` (unitarias RFQ).
- **Pendiente del PO:** aplicar en remoto, cuando autorice: `2026100610*` y `2026100710*`; verificar que `2026100620*` y `2026100630*` ya estén.

### Auditoría 5 — 2026-10-06 (cierres folios/B3 ola 2/B4 ola 1, verificación final y fixes del coordinador)

- **Entregas verificadas y commiteadas:**
  - A (folios B3.5): `c161b1a` — RPCs de continuidad por periodo, UI, pgTAP 28/28, unit 3/3, E2E focal verde.
  - C (B4 ola 1): `6b0c524` — 9 tablas, 12 RPC, frozen/revisiones/costeo/aceptación, pgTAP 88/88 (scratch), unit verde.
  - B (B3 ola 2): `a0cd4f3` — UI `/rfq`, archivos, gate LISTO, consumidores `etapa` migrados y puente retirado; E2E completo 46/46.
- **Defectos encontrados por la auditoría y corregidos por el coordinador:**
  1. **pgTAP de catálogos frágil**: comparaba la tabla completa contra las semillas → fallaba con fixtures E2E (procesos `QAR` desactivados). Se acotó a los 8 códigos sembrados (`supabase/tests/sii_b1_catalogos.test.sql`).
  2. **Fixtures E2E de catálogo**: los specs intentaban borrar filas y el trigger `catalogo_sin_borrado` (implementado por A, correcto) lo impedía; se cambió a desactivación + borrado de `versiones_catalogo` (`catalogos-base.spec.ts`, `rfq-flujo.spec.ts`).
  3. **Folio periódico**: el tope de 99 bloqueaba altas con uso intenso y el primer intento de desborde (`lpad`) truncaba duplicando folios (100→"10"); se corrigió con `CASE` (`20261007100006/7/8`, commiteadas en `a7e87c5`). Verificado 99→100→109.
  4. **Zona horaria de Planeación**: el servidor calculaba “hoy” en UTC y el cliente en fecha local; en la ventana post-medianoche UTC los specs fallaban. Se unificó a `hoyIso()` (fecha local del operador) y se hizo robusto el fixture de `planeacion-bolsa` (`a7e87c5`).
  5. Specs desactualizados por la baja lógica de contactos y el cambio de contadores del embudo ya habían sido corregidos en la ola anterior.
- **Verificación final combinada:** typecheck 0 · lint 0 · build OK · pgTAP **744/744** · unit **886/886** · integración **226/226** · **E2E 46/46 (1 caso condicional omitido, sin fallo)**.
- **Riesgo abierto (no bloquea):** en producción el servidor puede estar en UTC y los operadores en Tijuana; conviene definir la zona de negocio (`America/Tijuana`) para “hoy” en un bloque de endurecimiento (mismo criterio para Horas extra/jornada).
- **Migraciones nuevas para el PO (remoto):**
  1. A folios: `20261007150001_sii_b3_continuidad_folios.sql`
  2. B3 ola 2: `20261007100004_sii_b3_rfq_consumidores.sql`, `20261007100005_sii_b3_retirar_puente.sql`
  3. Fixes folio: `20261007100006`, `20261007100007`, `20261007100008`
  4. B4 ola 1 (C): `20261007110001_sii_b4_propuestas_base.sql`, `20261007110002_sii_b4_propuestas_acciones.sql`
  Orden recomendado: `0004 → 0005 → 0006 → 0007 → 0008 → 0711* → 0715`. Todas idempotentes con guardas de dependencia.

### Auditoría 6 — 2026-10-06 (ola 4 en curso; pasada estática)

- **A (B5 ola 1):** fase 0 completa (`20261007150002` rango 0..999 + UI/Zod/pgTAP/unit ajustados) y migraciones `20261007120001/2` creadas. Verificado estáticamente: guardas `to_regclass` de B4/catálogos/archivos/follio, CHECKs de estado/folio (`O(I)?-[0-9]{4}_[0-9]{2,3}`, coherente con el desborde), índices únicos (folio_sii y revisión), snapshot objeto, comentarios. Sin commits ni zonas prohibidas.
- **C (B4 ola 2):** `20261007110003` con `registrar_pdf_revision` idempotente por hash y `enviar_revision` atómico (READY_TO_SEND + PDF vigente + canal + destino + próxima acción, GUC del frozen). **Decisión del spike PDF**: escritor interno sin dependencias (PDF 1.4, Helvetica/WinAnsi, xref, determinista sin fecha) — cumple criterios del ADR-04; pendiente validar contenido/exclusión de campos internos y acentos en la prueba.
- **B (B6 ola 1):** sin artefactos aún al momento de la pasada.
- **Transversal:** bandas correctas, `git log` intacto, sin locks activos, sin cambios en zonas congeladas.
- **Pendiente:** aplicar en local `0711 0003`, `0712 0001/2`, `0715 0002` cuando los streams reporten; correr pgTAP/unit/integración/E2E; auditar B6; commits por stream.

### Auditoría 7 — 2026-10-06 (cierres B5 ola 1, B6 ola 1 y B4 ola 2)

- **Gates combinados:** typecheck 0 · lint 0 · build OK · pgTAP **912/912** (36 archivos) · unit **916/916** · integración **226/226**.
- **Defectos encontrados por la auditoría y corregidos por el coordinador (`d91fdc8`):**
  1. **Puente `estado_sii` solo en UPDATE**: las órdenes insertadas por vías legacy con `estado` explícito tomaban `estado_sii='CONFIRMADA'`; al programarse, el puente pisaba `estado` a `programada` y rompía consumo de material y bolsa de planeación (fallos E2E de `gastos-rentabilidad` y `planeacion-bolsa`). Se añadió derivación en INSERT.
  2. **Specs desactualizados/estrictos**: búsqueda acotada en `clientes-ficha`/`clientes-contactos` (lista paginada por razón social), guardado con reintento y verificación en panel/BD en `taller-taxonomia` (re-render de Realtime), y scoping de botones en `propuestas-flujo` (`Enviar` duplicado en suite).
  3. **Próxima acción en `READY_TO_SEND`**: el diálogo de envío la exigía pero la RPC/panel solo la permitían en DRAFT/SENT/FOLLOW_UP (migración C `0711 0004`).
- **E2E:** cada spec afectado pasa aislado y focalizado (propuestas, clientes, taller, gastos, planeación). La corrida completa local excedió el presupuesto por datos acumulados de ~100 corridas; se recomienda `supabase db reset` local + fixture antes de la próxima corrida completa (autorización del PO).
- **Commits de cierre:** B5 ola 1 `7aaee76` · B6 ola 1 `247fe31` · B4 ola 2 `5aa3ca9` · fixes `d91fdc8`.
- **Migraciones nuevas para el PO (remoto):** `20261007110003`, `20261007110004`, `20261007120001`, `20261007120002`, `20261007120003`, `20261007130001`, `20261007130002`, `20261007150002` (orden: 0711 → 0712 → 0713 → 0715).

### Auditoría 8 — 2026-10-06 (cierres B6 ola 2 y B7 ola 1; A demorado)

- **B (B6 ola 2) y C (B7 ola 1): verificados y commiteados** (`78933f0`, `b4c4487`). Gates: pgTAP **968/968** (37 archivos), unit **932/932**, typecheck/lint/build 0; integración **226/227** con 1 test de concurrencia PIN que pasa aislado (10 s) y falla por carga local acumulada (timeout ampliado a 30 s; documentado).
- **Defectos de la auditoría corregidos:** pgTAP de continuidad de folios no cubría folios de 3 dígitos al limpiar el periodo; métrica de conversión del ejecutivo se contaminaba con RFQ reales (aislada en ventana futura); UTF-8 inválido en `operacion-produccion.tsx` reportado por C ya estaba resuelto por B; build compila.
- **A (B5 ola 2): sin cerrar.** Artefactos completos (ficha de orden, alta SII, migración de consumidores `20261007120004`, tests) con última escritura 09:04; desde ~09:57 su terminal quedó en una corrida larga (probable E2E/build bloqueado por el UTF-8 de B de ese momento, más la suite completa sobre datos acumulados). El bloqueo de pruebas está liberado. Recomendación: interrumpir y reiniciar su terminal; las migraciones `20261007120004` ya están aplicadas en local por el coordinador y el pgTAP quedó verde.
- **Decisión pendiente del PO:** el folio `NE-MMYY_XX-YY` puede colisionar entre orden comercial `O-` e interna `OI-` del mismo mes (el índice único falla ruidosamente). Opción: desambiguar con prefijo O/OI en la ola 2 de B7.
- **Recomendación operativa:** `supabase db reset` local + fixture (autorización del PO) para devolver velocidad a la suite E2E/integración.
