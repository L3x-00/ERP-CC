## Corte 2026-10-24 — RFQ: conservar la próxima acción vigente al cambiar de estado · PR #109

Rama `fix/rfq-seguimiento-vigente` (sobre `main` con #108 fusionado).

- [x] **Marcar listo / transiciones:** con una acción vigente no se pregunta «¿Qué hacemos con este seguimiento?» ni se pide redefinirla; se conserva automáticamente con `mantenerProximaAccion`.
- [x] **Sustitución:** se hace desde el Resumen, que mantiene el resultado mínimo. Una acción vencida o inexistente sí pide resultado y siguiente acción en el modal.
- [x] **Pruebas:** cobertura nueva de «Marcar listo» con acción vigente; sustitución y reprogramación se prueban con una acción vencida.
- Sin migración.

**Pruebas:** tsc, ESLint focal, `pnpm build` y suite completa 2302/2302 en verde. E2E local no corrido por falta de Docker; CI pendiente del head final.

## Corte 2026-10-23 — RFQ: próxima acción al finalizar/validar y limpieza de Propuestas · PR #108

Rama `feat/rfq-proxima-accion-validar` (sobre `main` con #106 y #107 fusionados).

- [x] **«Finalizar más tarde» captura la próxima acción:** desde Ítems o Archivos abre el modal existente; fecha y responsable se autocompletan con quien registra el RFQ y quedan guardados en la misma fila.
- [x] **Cola RFQ:** muestra acción, fecha y responsable (incluido el detalle de «Otro»); el catálogo incorpora las opciones de captura incompleta.
- [x] **«Marcar listo»:** si el único pendiente es el seguimiento, el mismo modal lo captura, habilita «Confirmar y marcar listo» y la transición lo guarda y revalida LISTO sin exigir pasar por el Resumen.
- [x] **Propuestas:** se elimina el componente huérfano de utilidad/precio mínimo; se conservan cálculos, totales e históricos para estimado vs real.
- Migración `20261023100000_rfq_proximas_acciones_captura.sql`: aplicada en remoto por el PO.

**Pruebas:** tsc, ESLint focal, `pnpm build` y suite completa 2301/2301 en verde. E2E focal, pgTAP y migración local no corridos: Docker/Supabase local no disponible. CI pendiente de la corrida del head final.

## Corte 2026-10-22 — Plazo comercial en el PDF de la propuesta · PR #106

Rama `feat/propuesta-pdf-plazo-comercial` (sobre `main` con #104 y #105 fusionados).

- [x] **PDF:** el documento público imprime «Plazo comercial: …» con el plazo del RFQ de origen (ajuste de línea,
  sin la línea si no hay plazo; nunca imprime la fecha compromiso). Cierra el pendiente de #105. Sin migración nueva;
  depende de `20261022120000_rfq_plazo_comercial.sql` (#105).

**Pruebas:** vitest `propuestas-` 28 archivos / 368 en verde (nuevas: `propuestas-pdf`, `propuestas-pdf-plazo-accion`);
typecheck y ESLint focal 0; E2E `propuestas-flujo` 2/2 en loopback. Suite completa y vista del PDF en un lector: no corridos.

## Corte 2026-10-22 — Plazo comercial del RFQ (obs. cliente punto 6) · PR #105

Rama `feat/rfq-plazo-comercial` (apilada sobre #104).

- [x] **Plazo comercial:** campo opcional de texto libre (≤ 120) en el alta del RFQ y en el Resumen; el Resumen
  declara «Fecha compromiso comercial: Se confirma al aceptar la propuesta». No obliga a inventar una fecha ni
  alimenta el compromiso ni la fecha operativa.
- [x] **Versionado/congelamiento:** `plazo_comercial` entra al snapshot de `rfq_versiones` y a la cabecera congelada
  al crear la Rev A; el historial de versiones muestra también la fecha requerida.
- [x] **Aceptación de la Propuesta:** al confirmar la fecha compromiso se muestra «El cliente pidió… · Plazo
  ofrecido…» como referencia (la fecha compromiso sigue siendo obligatoria).
- [x] **Migración** `20261022120000_rfq_plazo_comercial.sql` (columna + dos funciones): aplicada solo en local;
  **pendiente de aplicación remota por el PO antes o junto con el despliegue** (la ficha del RFQ la lee).
- [ ] Plazo comercial en el PDF de la Propuesta: fuera de este corte.

**Pruebas:** typecheck y ESLint focal 0; unitarias `rfq-`/`pipeline-`/`propuestas-`/`auditoria-` 70 archivos / 835 en
verde; pgTAP `c2_1` 33/33 + `sii_b4_propuestas` 88, `b4_obs2` 25, `sii_b5_orden` 69, `sii_b3_rfq_consumidores` 17;
E2E `rfq-flujo` 2/2 en loopback (el alta captura el plazo y el Resumen lo muestra). Suite completa, pgTAP completo y
capturas visuales: no corridos.

## Corte 2026-10-21 — DC-06 (resultado al sustituir el seguimiento) y DC-09 (fecha compromiso desde la aceptación) · PR #104

Rama `feat/rfq-seguimiento-resultado-y-dc09`, commits `f6ace27` y `b3f434b`.

- [x] **DC-06 Resumen:** cambiar o retirar la próxima acción vigente desde el Resumen (o cambiar el detalle de «Otro»)
  exige un resultado (Completada / Sin respuesta / Reprogramada / Ya no aplica) y el servidor lo revalida contra la fila
  guardada; queda en Actividad como `seguimiento_<resultado>` con la misma correlación. Mover solo fecha o responsable
  conserva la acción y no pide resultado. Sin migración.
- [x] **DC-09 Orden:** `crear_orden_desde_revision` toma `solicitudes_orden.fecha_compromiso_comercial` (respaldo en
  `propuesta_revisiones`) y falla con `fecha_compromiso_comercial_requerida` (23514) si falta, en vez de
  `coalesce(pipeline.fecha_requerida, now())`. Migración `20261022025747_dc09_orden_compromiso_desde_aceptacion.sql`,
  aplicada en local y en remoto por el PO el 2026-10-21.
- [ ] **DC-09 plazo comercial** («Fabricación 57 días»): pendiente, fuera de este corte.

**Pruebas:** typecheck y ESLint focal 0; unitarias `rfq-` 27 archivos / 267 en verde; pgTAP focal 5 archivos / 153 en
verde; E2E `rfq-flujo` 2/2 en loopback. Suite completa, pgTAP completo y capturas visuales: no corridos (los cubre CI).

## Corte 2026-10-22 — Disponibilidad y ajuste visual en Propuestas · PR #107

Rama `codex/propuestas-disponibilidad-visual`, independiente del cambio de PDF en PR #106.

- [x] Comercial consulta, junto a la fecha compromiso, un resumen informativo de carga y capacidad de los grupos del ruteo; no reserva, programa, crea Orden ni elige la fecha.
- [x] El cambio visual retira el protagonismo de utilidad y precio recomendado; conserva los importes comerciales, el costo estimado y la información histórica.
- [x] La consulta reutiliza los datos existentes y advierte ruteos o capacidad incompletos; no añade migraciones ni fórmulas de precio o rentabilidad.

**Pruebas:** en la rama independiente, typecheck y ESLint focal sin errores; unitarias de Propuestas 27 archivos / 362 pruebas. En el árbol original, E2E del recorrido principal 1/1; consultar el PR para el estado del spec completo, CI y fusión a `main`.

# Ejecución por cortes — observaciones del cliente 2026-10-07

Estado: decisiones `DC-01..DC-15` aceptadas; **P0 y C1–C6 completos** y fusionados a `main` (PR #31–#43); **C7 (cierre local) completo el 2026-10-10** sobre `main` `f642036` + árbol de trabajo. Pendientes menores declarados: prueba de dos conexiones de `procesar_solicitud_orden` y conversión de moneda del costeo. Remoto, CI, despliegue y aceptación quedan en manos del PO.

Regla de coordinación: antes de cada tarea, `ACTIVE_TASKS.md` debe fijar un dueño, archivos exclusivos y gates. Codex y Claude no editan el mismo archivo a la vez. Solo Codex integra mediante Git.

## P0 — Preparación y contrato

### P0.1 Fijar decisiones y aislar la rama — Codex

**Aceptación**

- [x] Las respuestas están normalizadas como `DC-01..DC-15` en una fuente durable.
- [x] La auditoría B1–B9 permanece pausada y la rama es `feature/observaciones-cliente`.
- [x] Los documentos previos no se sobrescribieron ni se confundieron con aceptación de producto.

**Verificación:** `git status --short --branch` y revisión de `DECISIONES-ACEPTADAS.md`.

### P0.2 Preparar toolchain local — Codex

**Aceptación**

- [x] Node 24.14.0, pnpm 11.9.0, Supabase CLI 2.109.0, Docker 29.4.0 y Playwright 1.62.1 disponibles.
- [x] `pnpm install --frozen-lockfile` termina sin modificar el lockfile.
- [x] Supabase local y puertos 54321/54322/54323 confirmados; variables mutantes se obtendrán del stack local, nunca de `.env.local`.
- [x] El wrapper `entorno-local.ps1` tolera los avisos normales de servicios opcionales detenidos y `validar-entorno.mjs` confirma loopback.

**Verificación:** versiones, `docker ps`, `supabase status` y árbol Git.

### P0.3 Crear y sincronizar Skill de correcciones — Claude implementa, Codex revisa

**Aceptación**

- [x] Existe `.agents/skills/orca-correcciones-cliente/SKILL.md`, sin duplicar la auditoría B1–B9.
- [x] La Skill define contratos, propietarios, cortes, defectos incidentales y checkpoints 20/10 %.
- [x] `quick_validate.py` y `sync-ai-skills.ps1 -Check` pasan después de sincronizarla hacia Claude.

**Dependencias:** P0.1.
**Archivos exclusivos durante ejecución:** `.agents/skills/orca-correcciones-cliente/**` para Claude; sincronización para Codex.

### P0.4 Caracterizar contratos compartidos — Codex

**Aceptación**

- [x] Pruebas existentes o nuevas fijan: RFQ sin propuesta implícita, archivos versionados, revisión de Propuesta, aceptación y consumo congelado (`CARACTERIZACION-CORTE-0.md`).
- [x] Los contratos de fechas, `INCOMPLETO`, tarifa Grupo/override, Orden pendiente y snapshot de consumo están documentados antes de migraciones (`CONTRATOS-CORTE-0.md`).
- [x] Se registra el baseline visual claro/oscuro en 320, 768, 1024 y 1440 px, sin desbordamiento de página ni errores de consola.

**Verificación:** pruebas focales RED/GREEN de caracterización y revisión visual registrada.
**Dependencias:** P0.1–P0.3.

### Checkpoint P0

- [x] Skill compartida sincronizada y validada para Codex/Claude.
- [x] Contratos listos para repartir trabajo sin editar archivos comunes.
- [x] `HANDOFF.md`, `ACTIVE_TASKS.md`, estado Git y gates baseline actualizados.

## C1 — RFQ visual y alta recuperable

### C1.1 Lista única, Resumen y tokens semánticos

**Aceptación**

- [x] RFQ abre únicamente en lista; no existe selector/tablero (`7bd9945`).
- [x] Resumen muestra Datos generales, Próxima acción y Descripción como tarjetas de solo lectura.
- [x] Estados verdes/amarillos/ámbar usan tokens accesibles en claro/oscuro.

**Verificación:** unitarias/componentes, E2E de navegación y revisión `orca-ui-review`.
**Dependencias:** P0.4. **Tamaño:** M, máximo cinco archivos por encargo.

### C1.2 Wizard durable y campos aprobados

**Avance**

- [x] C1.2a: modal accesible, alta `INCOMPLETE`, campos DC-01, permiso `rfq_crear`, navegación al mismo RFQ y `Continuar captura`.
- [x] C1.2b: integrar Ítems, Archivos y Revisar como pasos operables del mismo flujo, con reanudación E2E después de interrumpir.
  - [x] UI de Claude: navegación de cinco pasos y panel Revisar (`8bc9697`).
  - [x] Integración Codex: cálculo del primer paso pendiente, `?continuar=1` y ficha montada (`98ceffd`); unitarias 1052/1052, typecheck y lint 0.
  - [x] Revisión cruzada de la UI de Claude: corregido un paso previo con faltantes que se mostraba como completado.
  - [x] E2E de interrumpir y reanudar en el mismo RFQ (2/2 con el flujo completo y archivo de 2 MiB), revisión visual 320/1440 claro/oscuro. Corregida la carrera en la que "Continuar captura" sobrescribía la navegación del usuario.

**Aceptación**

- [x] Pasos: Cliente → Solicitud → Ítems → Archivos → Revisar.
- [x] Orden de compra/Horas estimadas no aparecen; Fecha requerida por cliente es opcional y claramente distinta de Fecha compromiso.
- [x] Cerrar después de guardar deja `INCOMPLETO`; Continuar captura recupera datos y archivos confirmados.

**Verificación:** validaciones, integración de reanudación y E2E cliente existente/nuevo/interrupción.
**Dependencias:** P0.4. **Tamaño:** dividir contrato servidor y UI en encargos M independientes.

### C1.3 Canal configurable y Espesor

**Avance**

- [x] C1.3a: Espesor permanece visible debajo de Material y explica los estados sin selección/sin catálogo.
- [x] C1.3b: catálogo configurable de canales y regla de detalle para “Otro”.

**Aceptación**

- [x] Catálogo inicial contiene WhatsApp, Correo, Teléfono, Visita, Referido y Otro.
- [x] “Otro” exige detalle y valores históricos sobreviven a una desactivación.
- [x] Espesor aparece debajo de Material o muestra por qué el material no tiene espesores.

**Verificación:** pgTAP/validación, integración y E2E del formulario.
**Dependencias:** P0.4.

### Checkpoint C1

- [x] RFQ nuevo puede iniciarse, interrumpirse y reanudarse sin pérdida.
- [x] Typecheck, lint, unitarias/integración focales y revisión responsive verdes.
- [x] Commits atómicos locales (C1.2b cerrado por Claude a pedido del PO; Codex revisa al retomar).

## C2 — RFQ versionado, estados y documentos

### C2.1 Snapshot RFQ y congelamiento Rev A

**Aceptación**

- [x] Cada versión append-only congela cabecera + ítems, actor, fecha y causa.
- [x] Crear explícitamente Propuesta Rev A congela el RFQ; navegar o editar nunca crea propuesta.
- [x] Bajas de ítems son lógicas y un ITxx no se reutiliza.

**Verificación:** pgTAP append-only/CAS/RBAC, carrera de dos conexiones e integración.
**Dependencias:** C1.2.

**Hecho (`9b43580`):** migración `20261008160000` solo local; versión por guardado (cabecera/ítem) y versión final atómica al crear Rev A con revalidación si el RFQ se editó en la app; congelamiento `rfq_congelado`; CV-01 resuelto (Listo editable hasta Rev A); RFQ legados sin versión final no se bloquean. pgTAP 29/29, E2E RFQ + Propuestas 3/3. Pendiente menor: la versión por guardado se registra después del guardado (no en la misma transacción); la carrera de dos conexiones no tiene prueba dedicada.

### C2.2 Próxima acción por transición

**Aceptación**

- [x] Transiciones no terminales exigen próxima acción en la misma operación.
- [x] Estados terminales no exigen acción futura y solicitan motivo/resultado según contrato.
- [x] Fallar seguimiento revierte la transición completa.

**Verificación:** pgTAP, integración por estado y E2E comercial.
**Dependencias:** P0.4.

**Hecho:** migración `20261008170000` solo local; `cambiar_estado_rfq` exige y guarda la próxima acción en transiciones no terminales, limpia la pendiente en cerrar/cancelar y revierte todo si falla; diálogo de próxima acción en el panel de acciones. pgTAP 12/12 + B3 adaptado.

### C2.3 Historial documental y archivos ITxx

**Aceptación**

- [x] “Ver versiones” incluye metadata no vigente y no ofrece borrado físico.
- [x] DXF/DWG aparecen en ayuda/selector y suben/descargan correctamente, incluido >1 MiB.
- [x] Archivos de `rfq_item` llegan autorizadamente a Propuesta, Orden y piso sin duplicar blobs.

**Verificación:** integración Storage/RLS, E2E de versión repetida y E2E de piso.
**Dependencias:** P0.4; coordinar con H-B1-29 parcial sin reimplementarlo.

**Hecho:** RFQ y Propuesta muestran la versión vigente por defecto y abren el historial en solo lectura; ambas firmas validan pertenencia al RFQ/Propuesta abiertos. Orden y Producción consumen por ID la versión exacta congelada en el snapshot aceptado, conservan el código ITxx y registran archivos posteriores bajo la Orden sin reabrir el RFQ. El DTO operativo no expone el snapshot comercial; las referencias faltantes y cargas legadas quedan visibles sin incorporar cambios vivos. E2E RFQ repite un DXF de 2 MiB y descarga v1 histórica; E2E de piso abre el DXF congelado y conserva dos versiones de un DWG de 2 MiB. Sin migración nueva.

### Checkpoint C2

- [x] RFQ conserva versiones y documentos independientes.
- [x] Ningún flujo implícito crea propuesta ni borra historial.
- [x] SQL focal previo, integración, concurrencia, UI y E2E verdes.

**Gates de cierre C2:** 1107/1107 unitarias; 246/246 integración en serie (la primera corrida paralela mostró interferencia entre suites y los 16 casos afectados pasaron aislados); typecheck, lint y build verdes; E2E RFQ 2/2, Propuesta 1/1 y Producción 2/2. pgTAP C2.1/C2.2 ya estaba verde y C2.3 no añadió SQL.

## C3 — Propuesta, ruteo y costos

### C3.1 Ítems nuevos y revisiones

**Aceptación**

- [x] Una nueva revisión puede agregar IT consecutivo estable sin modificar RFQ.
- [x] Se registra la revisión de origen; quitar ítems/procesos conserva la revisión previa y la baja del ítem es lógica.
- [x] Historial abre versiones anteriores en solo lectura.

**Verificación:** pgTAP de numeración/concurrencia, unitarias e E2E de dos revisiones.
**Dependencias:** C2.1.

**Evidencia 2026-10-09:** pgTAP C3.1 55/55, concurrencia 1/1, 129 unitarias focales/consumidoras del snapshot, typecheck/lint focales, build y E2E Propuesta/Orden 2/2. IT03 nace en B, no aparece en A, marca B como origen, no toca RFQ, invalida costeo previo y recibe un DXF de más de 1 MiB como `propuesta_item`. La revisión siguiente conserva los archivos de cabecera y del mismo ITxx; Orden congela A..revisión aceptada por identidad estable y excluye revisiones futuras sin copiar blobs.

### C3.2 Tarifa estándar de Grupo y override de recurso

**Aceptación**

- [x] `grupos_equipo` posee tarifa estándar versionada y Configuración permite mantenerla.
- [x] El override de recurso tiene indicador explícito; cero no equivale a “sin override”.
- [x] Falta de tarifa bloquea el costeo con mensaje accionable.

**Verificación:** pgTAP de constraints/historial, servicios y UI de Configuración.
**Dependencias:** P0.4.

**Hecho (Claude, 2026-10-09):** migración `20261009140000` (solo local): `grupos_equipo.tarifa_hora` (NULL = sin configurar) + `tarifa_moneda` MXN/USD, versionadas por `versiones_catalogo`; override explícito en `recursos_planeacion` (`tarifa_override_activa/hora/moneda`, CHECK); `resolver_tarifa_hora` (override > grupo) con `tarifa_no_configurada`/`tarifa_sin_grupo` y DETAIL accionable. Configuración: «Tarifas por grupo de equipo» y «Tarifas por máquina». El editor de ruteo marca grupos «(sin tarifa)» sin exponer montos. `costo_hora_interno` no se tocó. pgTAP 16/16, unitarias focales 85/85, E2E Catálogos. **Riesgo para C4.3:** `recursos_planeacion` (incluido `costo_hora_interno`) es legible con `ver_planeacion`.

### C3.3 Snapshot y desglose de ruteo

**Aceptación**

- [x] Preparación + operación usan la misma tarifa en el MVP.
- [x] Cada fila congela tarifa, fuente, grupo, recurso opcional y fecha.
- [x] Desglose y total/margen evitan doble conteo con costos manuales.

**Verificación:** paridad SQL/TypeScript, redondeo/moneda, unitarias y E2E.
**Dependencias:** C3.1–C3.2.

**Hecho (Claude, 2026-10-09):** migración `20261009160000` (solo local): snapshot por renglón en `propuesta_item_ruteo` (recurso, tarifa, moneda, fuente, costo preparación/operación/total, `costeado_en`, CHECK de coherencia); `costear_ruteo_revision` (DRAFT, `propuesta_editar_costo`, todo o nada; bloquea sin tarifa y con moneda distinta, sin convertir); `calcular_totales_revision` suma ruteo costeado y deja de sumar el manual `maquina` cuando hay ruteo costeado, expone `costoManual`/`costoRuteo`; espejo TS compatible. UI: botón «Costear ruteo». Editar el ruteo reinserta renglones y obliga a recostear; una revisión nueva no copia el snapshot. pgTAP 14/14 (RED previo), regresión B4/B5/C3.1 241/241, unitarias 139/139. **Máquina por renglón (C3.3b):** migración `20261009170000`: `editar_ruteo_item` acepta `recurso_id` (activa y del mismo grupo; `recurso_grupo_distinto`) y `crear_nueva_revision` la copia; el editor ofrece «Máquina (tarifa del grupo)» filtrada por grupo, sin exponer costos. pgTAP 16/16. **Pendiente:** revisión financiera y conversión de moneda (hoy se bloquea).

### Checkpoint C3

- [x] Dos revisiones conservan sus propios ítems y costos históricos.
- [x] Cambiar una tarifa no altera revisiones previas.
- [ ] Gates focales y revisión financiera aprobados.

## C4 — Aceptación y Orden inmutable

### C4.1 Aceptación durable y Orden pendiente

**Aceptación**

- [x] Comercial acepta una revisión exacta y confirma Fecha compromiso.
- [x] La misma transacción guarda aceptación + solicitud única de orden.
- [x] Un gate fallido conserva `Orden pendiente`, causa y reintento; carreras crean exactamente una Orden.

**Verificación:** pgTAP, concurrencia, permisos aceptar/reintentar e integración de crédito/FX.
**Dependencias:** C3.3.

**Avance (Claude, 2026-10-09):** migración `20261009180000` (solo local):
- `aceptar_revision` exige `fecha_compromiso_comercial` (congelada en la revisión) y crea `solicitudes_orden` (PENDING, única por revisión) en la misma transacción.
- `procesar_solicitud_orden` (exige `orden_liberar`) intenta crear la Orden en una subtransacción: si un gate falla deja BLOCKED con `causa_codigo`/`causa_detalle` sin revertir la aceptación; reprocesar es idempotente (una sola Orden).
- Backfill de revisiones ya aceptadas.
- «Crear orden desde revisión» (módulo Órdenes) ya pasa por la solicitud; aceptar en la UI pide la fecha.
- pgTAP 13/13 (RED previo) y consumidores B4/B5/B9/C3 218/218; unitarias 19/19; E2E Propuestas/Entregas/Órdenes.

**UI (mismo día):** panel «Orden pendiente» en la ficha de propuesta (`propuesta-orden-pendiente`), con fecha compromiso, causa legible (`ordenes/utilidades/mensajes-orden.ts`), intentos y «Crear orden/Reintentar» (`propuesta-reintentar-orden`, permiso `orden_liberar`); con la Orden creada muestra el folio. El E2E de Propuestas verifica la solicitud PENDING tras aceptar.

**Pendiente menor:** prueba de dos conexiones procesando a la vez (la defensa es `FOR UPDATE` de la solicitud + índice único de la Orden). La copia de la fecha compromiso a la Orden queda en C4.2.

### C4.2 Snapshot comercial y cambios operativos

**Aceptación**

- [ ] Alcance, revisión, ítems, cantidades, precios y moneda son inmutables.
- [ ] Prioridad, fecha operativa, recurso y notas pueden cambiar con historial.
- [ ] Fecha compromiso comercial original permanece separada e inmutable.

**Verificación:** pgTAP de columnas protegidas/CAS, integración y E2E Planeación.
**Dependencias:** C4.1.

### C4.3 Confidencialidad y simplificación de Órdenes

**Aceptación**

- [x] Comentarios se reubican antes de retirar Seleccionar; se retiran mutaciones comerciales no permitidas.
- [x] La ruta exige permiso y el servidor no serializa finanzas a roles operativos.
- [x] Cancelación queda solo para Administración y permanece auditada.

**Verificación:** RBAC negativo sobre payload, unitarias, integración y E2E admin/operador.
**Dependencias:** C4.2.

**Cierre local (Codex, 2026-10-10):** proyecciones positivas para Orden, recursos y sesiones de
Producción; privilegios por columna reservan snapshot/importes/condición de pago, tarifas/costo
interno y costo histórico de sesión a servicios autorizados. Las rutas exigen `orden_vista`, el
documento exige además `ver_finanzas` y cancelar exige `orden_cancelar`. La cola ya no ofrece
Editar/Procesos/Seleccionar y los comentarios se abren por Orden; la reprogramación operativa
permanece en Planeación. Evidencia: pgTAP 17/17, unitarias focales 52/52, integración 10/10,
E2E Producción 2/2, typecheck, lint focal y build del E2E. Migración C4.3 solo local.

### Checkpoint C4

- [ ] Aceptación nunca se pierde y Orden nunca se duplica.
- [x] Operación no recibe campos financieros.
- [ ] Cobranza, crédito y documentos de Orden sin regresión.

## C5 — Acceso operativo

### C5.1 Flujo PIN simplificado

**Aceptación**

- [x] Ingreso, selección de trabajo y salida forman un flujo continuo en móvil/tablet.
- [x] PIN correcto/incorrecto, rate limit, revocación y expiración conservan seguridad vigente.
- [x] No aparecen precios ni rutas administrativas.

**Verificación:** unitarias, integración de sesión y E2E táctil.
**Dependencias:** C4.3.

### C5.2 “Ver como operador” de solo lectura

**Aceptación**

- [x] Administración entra sin conocer PIN, con operador, admin real, motivo y expiración auditados.
- [x] Banner permanente y salida explícita identifican la delegación.
- [x] Toda mutación productiva se rechaza en el MVP.

**Verificación:** RBAC negativo, expiración/revocación, auditoría y E2E.
**Dependencias:** C5.1.

**Cierre local C5:** sesión delegada firmada de 15 minutos sin renovación; revalidación de
administrador/operador; servidor bloquea y audita mutaciones de Órdenes y Producción; navegación
PIN y delegada verificada en tablet. Gates: 35/35 pruebas focales, prueba mutante efectiva,
E2E C5 2/2, typecheck, lint focal y build del E2E. Sin migración.

## C6 — Materiales y costos sin stock

### C6.1 Maestro e historial de costos

**Aceptación**

- [x] `catalogo_materiales` es canónico, con unidad base, MXN/USD y costo vigente.
- [x] Compra/Gasto propone; solo confirmación autorizada cambia el maestro.
- [x] Historial append-only congela anterior/nuevo/moneda/fecha/fuente/actor.

**Verificación:** pgTAP/RBAC/concurrencia, integración y UI de Materiales y costos.
**Dependencias:** P0.4.

### C6.2 Consumo congelado sin movimiento de stock

**Aceptación**

- [x] Consumo congela cantidad, unidad, costo, moneda y tipo de cambio.
- [x] Registrar consumo no crea entradas, salidas, reservas ni cambios de existencia.
- [x] Rentabilidad suma legado y nuevo sin doble conteo.

**Verificación:** pgTAP, integración, reconciliación antes/después y E2E.
**Dependencias:** C6.1.

**Cierre local C6.2:** el servicio y Piso consumen `catalogo_materiales`; la RPC de cinco
argumentos congela unidad/costo/moneda/tipo de cambio/actor, devuelve movimiento nulo y no toca
stock, reservas ni kardex. Legado y nuevo conservan orígenes separados y rentabilidad los suma una
vez. Gates: pgTAP 1428/1428, unitarias 1266/1266, integración 266/266, concurrencia 12/12,
E2E focal 8/8, typecheck, lint y build. C6.3 permanece separado.

### C6.3 Retiro operativo del inventario legado

**Aceptación**

- [x] Navegación diaria usa “Materiales y costos”; no ofrece stock/entradas/salidas/reservas.
- [x] Movimientos, existencias y kardex previos siguen consultables en solo lectura.
- [x] Ninguna tabla ni historia se elimina.

**Verificación:** RBAC, consultas históricas, E2E de navegación y reconciliación.
**Dependencias:** C6.2.

**Cierre local C6.3:** `/inventario` conserva su ruta y pasa a “Materiales y costos”. Costos es la
vista principal; existencias y kardex legados quedan identificados como históricos y solo lectura,
sin semáforos ni disparadores de altas, entradas o salidas. Las tres Server Actions legadas rechazan
en servidor y auditan intentos autorizados. Migración mínima `20261011120000` reemplaza las
políticas `USING (true)` de `materiales` y `reservas_material` por RBAC de
`gestionar_inventario`/admin (pgTAP focal 9/9), sin borrar tablas ni datos. Gates: focales,
unitarias, pgTAP global, integración C6, E2E navegación en cuatro anchos y dos temas, typecheck,
lint y build.

## C7 — Cierre

- [x] Ejecutar typecheck, lint, unitarias, build y, según cambios, pgTAP, integración, concurrencia y E2E.
- [x] Aplicar `code-simplification`, `cross-review`, revisión visual/accesible y seguridad.
- [x] Actualizar ADR, documentación y memoria compartida.
- [x] Entregar `REPORTE-HALLAZGOS-Y-CORRECCIONES.md` con síntoma, causa, severidad, corrección, evidencia y pendientes.
- [x] Separar claramente verificación local, remoto, despliegue y aceptación del cliente.

**Cierre local (2026-10-10):** revisión de cumplimiento contra las observaciones originales con
cinco brechas corregidas: etiquetas visibles del ruteo, desglose «costo total estimado de
fabricación» (con el margen del panel usando el snapshot costeado), Orden automática al aceptar
(disparo idempotente con `orden_liberar`, BLOCKED con causa si un gate falla), Historial RFQ
visible también en `CONVERTED` y firma de Propuesta a 300 s; además, el modal de alta captura
Canal/Fecha/Responsable/Descripción/Contacto y el tope de menciones sube de 200 a 1000 usuarios.
Gates finales sobre el árbol de trabajo: typecheck y lint 0, **1288/1288 unitarias** (166
archivos), **pgTAP 1437/1437**, **integración 266/266**, **concurrencia 12/12**, build OK y
**E2E 62/62** (1 skip intencional) en 20.8 min con capturas 320/768/1440 claro/oscuro. ADR-0015 y
`REPORTE-HALLAZGOS-Y-CORRECCIONES.md` actualizados; pendientes menores declarados (dos conexiones
de `procesar_solicitud_orden`, conversión de moneda del costeo). Remoto, CI, despliegue y
aceptación del cliente siguen fuera de este cierre local.

## Ajustes post-cierre 2026-10-11 — Seguimiento en modal (autorizado por el PO)

- [x] **Propuesta:** «Validar» abre un modal obligatorio de próxima acción; el servidor registra
  el seguimiento y valida con token CAS fresco, sin duplicar en reintentos. La pestaña Seguimiento
  conserva el historial y captura con el mismo modal.
- [x] **RFQ:** el modal de «Marcar listo» ya exigía la próxima acción; se refuerza el texto de
  obligatoriedad. Transiciones no terminales siguen pidiéndola en su modal.
- Evidencia: unitarias de la acción combinada (7) y del modal (5), E2E de Propuestas y RFQ verdes,
  captura `dialogo-validar-seguimiento` 1440/768 claro/oscuro.

## Ajustes post-cierre 2026-10-10 — Propuesta e inventario ligero (autorizados por el PO)

- [x] **Propuesta (obs. #8):** el encabezado de la ficha usa «Crear nueva versión» en lugar de
  «Actualizar»; diálogo con motivo que copia ítems/ruteo/costos en la letra siguiente; el Resumen
  muestra «Historial de versiones» navegable con apertura en solo lectura; el vocabulario de la
  acción visible pasa de «revisión» a «versión» (mensajes de congelamiento incluidos). La aceptación
  ya crea la Orden automáticamente (C7).
- [x] **Materiales y costos (DC-12 refinado):** el módulo expone solo la lógica ligera —catálogo con
  unidad base, costo vigente e historial, y propuestas de compra/gasto—; se retiran las pestañas de
  existencias y kardex y sus componentes, sin borrar datos, servicios legados ni RLS. El consumo y
  su costo congelado viven en las órdenes.
- Evidencia: unitarias focales del diálogo/panel/página, E2E de Propuestas completo y E2E de
  Materiales y costos (con material y kardex legados insertados que no deben aparecer) y capturas
  320/768/1024/1440 claro/oscuro.

## Cierre local Finanzas C10.1–C10.4 (2026-10-19)

Estado: C10.1, C10.2, C10.2b y C10.3 fusionadas (PR #78–#81) y migraciones aplicadas en remoto por
el PO. C10.4 es aceptación y registro, sin migración ni cambio funcional.

- [x] **F10 matriz de fuentes:** `f03_conciliacion_costos` 58/58 cubre material (consumo), fabricación
  (sesiones), gasto directo, subcontratación y compra; la columna Fuente se prueba en el render y en
  el E2E de aceptación.
- [x] **F10 columna Fuente:** `Compra · Consumo` y `Gasto` visibles en la tabla de conciliación.
- [ ] **F10 ajuste manual:** diferido por decisión del PO; F10 se registra como **parcial**. La tabla
  muestra «Ajuste manual: no disponible en este corte»; no se relajan CHECK ni permisos.
- [x] **F17 transferencias:** `tesoreria-saldos.test.ts` prueba que el par SALIDA/ENTRADA mueve saldos
  por cuenta pero no suma al total; `sii_b8_tesoreria` conserva la prueba de neutralidad.
- [x] **F18 pagos/movimientos:** `f15_guardarrailes_costos` prueba que un gasto indirecto grande no se
  reparte y que pagos de compra, movimientos y transferencias no alteran conciliación ni rentabilidad.
- [x] **F19 confidencialidad/contratos:** `ordenes-confidencialidad-c4-3` y `ficha-orden-c4-2` verdes;
  la ficha sin `ver_finanzas` no recibe costos. Horas reales = sesiones pausadas/finalizadas (pgTAP T2);
  la casilla de coherencia con C9.3 queda **pendiente de C9.3**.
- [x] **F20 aceptación E2E:** `finanzas-conciliacion-orden.spec.ts` siembra Orden + Propuesta + compra
  recibida + consumo + gasto directo y lee por UI: estimado `$7,800.00`, comprometido `$4,000.00`,
  real `$5,650.00`, margen estimado `61.0 %` y real `71.8 %`, con fuentes visibles. 1/1 en loopback.
- [x] **Registro documental:** `DECISIONES-ACEPTADAS.md` (4 refinamientos), `CLI-15` y Corte 10 en
  `tasks/plan.md`, marcas/reservas en `COLA-DE-TRABAJO.md` y `CONTINUIDAD.md`, hallazgos en
  `REPORTE-HALLAZGOS-Y-CORRECCIONES.md`.
- [ ] **C9.3 horas reales:** la prueba de coherencia dedicada queda pendiente de C9.3; no se marca.

**Pruebas de cierre C10.4:** Vitest focal 19/19 (`tesoreria-saldos`, `gastos-conciliacion`,
`ordenes-confidencialidad-c4-3`, `ficha-orden-c4-2`); pgTAP focal 99/99 (`f15`, `sii_b8_tesoreria`,
`f03`); typecheck y ESLint focales; E2E `finanzas-conciliacion-orden` 1/1 + `tesoreria-flujo` 1/1.
**Cierre:** PR #82 fusionado (merge `77339e6`); CI verde run `39199986179` sobre `9cefb14`.
**Límites:** una factura por entrega; flujo por cuenta informativo (no saldo conciliado); no se borra
historial financiero; F10 parcial. Sin migración en C10.4.

## Protocolo de continuidad

- [ ] A 20 % o menos: no iniciar tarea L; terminar el incremento y actualizar evidencia.
- [ ] A 10 % o menos: actualizar `HANDOFF.md`, `ACTIVE_TASKS.md`, estado Git, archivos, pruebas, fallos y siguiente acción exacta; detener trabajo nuevo.
- [ ] El agente disponible solo continúa encargos independientes con contrato y archivos ya asignados; nunca adivina el estado del agente pausado.
