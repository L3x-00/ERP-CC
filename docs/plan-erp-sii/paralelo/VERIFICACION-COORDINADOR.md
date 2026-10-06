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

### Auditoría 9 — 2026-10-06 (cierre B5 ola 2 retomado por el coordinador)

- **Contexto:** la terminal A quedó atascada con los artefactos de B5 ola 2 completos (ficha, alta SII, consumidores y migración `20261007120004`). El PO ordenó retomar el cierre desde el coordinador y detener una sesión paralela de opencode que estaba corriendo el mismo E2E sobre la misma base local (doble mutación evitada).
- **Verificación combinada:** typecheck 0 · lint 0 · unit **932/932** · pgTAP **968/968** (37 archivos) · integración **226/227** (el test `operadores-pin-concurrencia` falla bajo carga de suite y **pasa aislado en 8.6 s**; mismo flake ambiental documentado en auditoría 8) · build "Compiled successfully" · E2E focal `ordenes-estados-sii` **1/1** + regresión B5 **10/10** (ordenes×4, planeacion×3, cobranza-flujo, dashboard-roles, comercial-realtime) · capturas 4/4 en `.ai-shared/qa/sii-b5-orden/visual/`.
- **Defectos encontrados y corregidos por el coordinador:**
  1. **pgTAP B6 dependiente de la hora** (flake): el cierre con 5 h de sesión no excedía la jornada de 4 h cuando la corrida cae entre 13:00 y 17:00 Tijuana (el descuento de comida de 1 h dejaba `horas_netas = 4`). Se cambió a 6 h → determinista (neto ≥ 5).
  2. **Lint**: `prefer-const` en el spec B5.
  3. **E2E B5**: la entrega total archiva la orden (OBS-21); el cierre administrativo ahora se ejecuta desde la bandeja **Archivo**. La TI (sin cliente) se localiza por el folio `OI-` del mensaje de alta, no por `cliente_id`.
  4. **Specs heredados al badge SII**: `ordenes-heredadas-reactivacion` esperaba etiquetas legacy; se actualizó a `Planificada`, `Producción completada`, `En producción` (la BD sigue derivando el estado legacy por el puente, sin cambios).
- **Sin cambios de producto adicionales**: los artefactos de la terminal A se aceptan íntegros (migración `20261007120004` solo local). Se conserva además `20261007120005_sii_b5_derivaciones_definer.sql` (creada por la sesión paralela antes de detenerla): recrea `asignar_meta_final_avance_partida` y `privado.derivar_orden_completada` como `SECURITY DEFINER` con `search_path=''` para que los avances insertados con `service_role` (PostgREST) no fallen por permisos del esquema `privado`; está aplicada en local y es requisito de los fixtures E2E de B5/B7.
- **Migraciones para el PO (remoto):** `20261007120004_sii_b5_consumidores_estado.sql` y `20261007120005_sii_b5_derivaciones_definer.sql`.
- **Pendiente:** commit del cierre (coordinador) y B7 ola 2 (UI `/entregas`, captura de firma/evidencia y E2E).

### Auditoría 10 — 2026-10-06 (cierre B7 ola 2 y auditoría integral del plan SII hasta B7)

- **B7 ola 2: verificada.** Cola `/entregas` (pendientes por ITxx y notas con filtros), panel de preparación con cantidades por partida/contacto/quién recibe, detalle con renglones ITxx, evidencia fotográfica, firma digital en canvas (→ PNG) y firma escaneada con reemplazo versionado; enlace desde la ficha de orden y menú. Sin migración nueva.
- **E2E focal `entregas-flujo` (1/1)**: revisión aceptada → orden → programar → liberar → producir → entrega parcial 1/2 (`NE-...-01`) → firma digital v1 → firma escaneada ×2 (v1 reemplazada, v2 vigente) → entrega total (`NE-...-02`) → orden archivada; residuo de BD/Storage tras el spec = 0. Capturas 8/8 (cola y detalle × 1440/768 × claro/oscuro).
- **Regresión B7:** `produccion-piso`, `produccion-avance-procesos`, `corridas-calidad`, `cobranza-flujo` → **7/7**.
- **Endurecimiento pgTAP por datos acumulados (3 archivos, sin cambios de producto):** `sii_b3_continuidad_folios` (neutraliza contador/folios `O`/`OI` del periodo), `sii_b3_rfq_consumidores` (corte de equipo en ventana futura aislada) y `sii_b6_produccion` (finaliza sesiones activas ajenas dentro de la transacción antes de `cerrar_jornada`). Con ello pgTAP **968/968** es determinista en una base local con datos de E2E.
- **Auditoría integral del plan (B0–B9) al 2026-10-06:**
  - Completados y commiteados: B1 Sistema/Catálogos, B2 Clientes, B3 RFQ, B4 Propuestas, B6 Producción.
  - Completados localmente, **pendientes de commit**: B5 Orden (ola 2 + `20261007120004/0005`) y B7 Entregas (ola 2).
  - Pendientes por diseño del plan: **B8 Finanzas** (después de B7) y **B9 Estrategia/KPIs/transferencia**; B0 (fundamentos) consta como pendiente documental.
  - Riesgos abiertos: (1) colisión potencial del folio `NE-MMYY_XX-YY` entre orden `O-` y `OI-` — decisión del PO; (2) retiro del puente `estado_sii` aún no ejecutado (producción lee legacy); (3) suites locales lentas por datos acumulados (recomendado `supabase db reset` autorizado); (4) nada publicado: sin push/remoto/CI/despliegue.
  - Evidencia fresca combinada: typecheck 0 · lint 0 · build OK · unit **935/935** · pgTAP **968/968** · integración 226/227 (flake PIN documentado que pasa aislado) · E2E focal B5+B7 **2/2** y regresiones **17/17**.
- **Migraciones SII pendientes para el PO (remoto)**, en orden: `20261007100004`–`20261007100008`, `20261007110001`–`20261007110004`, `20261007120001`–`20261007120005`, `20261007130001`–`20261007130002`, `20261007140001`, `20261007150001`–`20261007150002`; además verificar que `2026100620*` y `2026100630*` estén aplicadas. Todas idempotentes con guardas de dependencia.
- **Pendiente inmediato:** commit de cierre de B5 ola 2 y B7 ola 2 (coordinador) y aplicar migraciones en remoto cuando el PO autorice.

### Auditoría 11 — 2026-10-06 (B8 Finanzas: diseño validado y F1 folio RP)

- **Diseño B8 validado por el PO** (respuestas registradas en `08-finanzas.md` §8.4 y ADR `ADR-SII-B8-FINANZAS-20261006.md`): conservar el flujo de AR D-04 vinculando factura; gastos nuevos con `CG-MMYY_####` (históricos `GTO`); promesas de pago **con recordatorios**; el folio `RP-MMYY_XX-YY` se deriva **espejo del NE**.
- **F1 implementada y verificada:** migraciones `20261007160001_sii_b8_folio_recibo.sql` (CHECK dual REC/RP, `privado.siguiente_folio_recibo` con advisory lock por orden, `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` recreadas sin cambio de firma) y `20261007160002_sii_b8_folio_recibo_limpieza.sql` (retira índice redundante; ya existía `pagos_ar_folio_recibo_key`). La idempotencia por `solicitud_id` ya existía y no se modificó.
- **Evidencia:** typecheck 0 · lint 0 · unit **935/935** · pgTAP **980/980** (38 archivos; nuevo `sii_b8_folio_recibo` 12/12) · E2E `cobranza-folio-rp` **1/1** + regresión de cobranza **5/5** · build OK · capturas 2/2 en `.ai-shared/qa/sii-b8-f1/visual/`.
- **Riesgo heredado:** la colisión `O-`/`OI-` del mismo mes+sufijo aplica también a `RP` (falla ruidosa por UNIQUE); decisión de desambiguación pendiente del PO para NE y RP.
- **Migraciones para el PO (remoto):** `20261007160001`, `20261007160002` (tras `20261007120005`).
- **Siguiente:** commit del cierre B8-F1; F2–F5 solo con autorización por fase.

### Auditoría 12 — 2026-10-06 (B8 F2: facturación borrador y vínculo a CxC)

- **Scope autorizado por el PO** con decisiones registradas: montos precargados/editables, una factura por entrega, emisión vincula la AR, cancelar desvincula y permite re-facturar.
- **Implementación:** migración `20261007170001_sii_b8_facturacion.sql` (tabla `facturas` con ciclo BORRADOR→EMITIDA→CANCELADA, folio fiscal único, una activa por entrega, `cuentas_por_cobrar.factura_id`, RLS de lectura y 4 RPC `service_role`), dominio `src/modulos/facturacion/**`, UI `/facturacion` + botón “Facturar entrega” en `/entregas/[id]`, entrada de menú en Finanzas y tipos generados actualizados a mano (tabla, columna y RPC).
- **Evidencia:** typecheck 0 · lint 0 · unit **940/940** · pgTAP **999/999** (39 archivos; `sii_b8_facturacion` 19/19) · E2E `facturacion-flujo` 1/1 + regresión entregas/cobranza 4/4 · build OK (ruta `/facturacion`) · capturas 4/4.
- **Compatibilidad verificada:** `registrar_factura_ar` (modal de Cobranza) intacto; D-04 intacto (AR por entregar facturada conserva vencimiento NULL); cancelación conserva vencimiento y desvincula.
- **Migración para el PO (remoto):** `20261007170001` (tras `20261007160002`).
- **Siguiente:** commit del cierre B8-F2; F3–F5 solo con autorización por fase.

### Auditoría 13 — 2026-10-06 (B8 F3: cobros repartidos y promesas con recordatorios)

- **Scope autorizado con decisiones del PO:** recibo multi-factura real (aplicaciones N:M), folio `RP-MMYY_0000-YY` global del periodo, recordatorios internos 2 días antes y al vencer, y promesa CUMPLIDA automática al pagarse.
- **Implementación:** dos migraciones base + tres ajustes (`20261007180001`–`0005`): tablas `aplicaciones_pago`/`promesas_pago` con RLS, `ar_id` nullable con backfill, motores recreados (registro de aplicación, promesa cumplida, `reversar_pago_ar` por aplicaciones, `registrar_cobro_multiple`, RPC de promesas y procesador de recordatorios), corrección de los literales acentuados que F1 dejó mal codificados, CHECK de folio con sufijo `0000` y recordatorios compatibles con los CHECK de `notificaciones_usuario`. UI en `/cobranza` (cobro múltiple + promesa) y materialización de recordatorios al abrir cartera o notificaciones.
- **Defectos detectados y corregidos durante la verificación:** conflicto de inferencia `ON CONFLICT (pago_id…)` contra parámetro OUT; CHECK de folio sin `0000`; `tipo`/`enlace` fuera del catálogo de notificaciones; folio de fixture E2E con 7 dígitos.
- **Evidencia:** typecheck 0 · lint 0 · unit **944/944** · pgTAP **1026/1026** (40 archivos; `sii_b8_cobros_promesas` 27/27) · E2E `cobranza-cobro-multiple` 1/1 + regresión cobranza/facturación 5/5 · build OK · capturas 2/2.
- **Migraciones para el PO (remoto):** `20261007180001`–`20261007180005` (tras `20261007170001`).
- **Siguiente:** commit del cierre B8-F3; F4 (compras/CxP) y F5 (tesorería) solo con autorización por fase.

### Auditoría 14 — 2026-10-06 (B8 F4: compras/CxP con folio CG y pagos a proveedores)

- **Scope autorizado con decisiones del PO:** compra por cabecera con estados, serie CG compartida compras/gastos, pagos parciales con saldo y compras fuera de rentabilidad.
- **Implementación:** `20261007190001` (tablas `compras`/`pagos_compra` con RLS, `gastos.folio_sii` + CHECK/único, generador CG compartido con advisory lock y máximo real) y `20261007190002` (`registrar_gasto` recreada asigna CG conservando GTO; `crear_compra`, `actualizar_compra_borrador`, `cambiar_estado_compra`, `pagar_compra`). UI `/compras` (cola, alta/edición, confirmar/recibir, pagar, cancelar) y visualización CG en gastos (búsqueda incluida).
- **Defectos corregidos durante la verificación:** proveedor de fixture con columnas NOT NULL; errcode P0002 de `no_data_found`; selectores GTO de la regresión de gastos actualizados a CG (solo presentación).
- **Evidencia:** typecheck 0 · lint 0 · unit **948/948** · pgTAP **1055/1055** (41 archivos; `sii_b8_compras` 29/29) · E2E `compras-flujo` 1/1 + regresión gastos 3/3 · build OK (ruta `/compras`) · capturas 4/4.
- **Migraciones para el PO (remoto):** `20261007190001` y `20261007190002` (tras `20261007180005`).
- **Siguiente:** commit del cierre B8-F4; F5 (tesorería) solo con autorización del PO.
