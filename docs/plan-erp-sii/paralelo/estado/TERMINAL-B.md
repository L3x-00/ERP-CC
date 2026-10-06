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

## 2026-10-05 19:45 — B3 RFQ ola 2 (UI, archivos, gate LISTO, consumidores y retiro del puente)

TERMINAL: B | FECHA-HORA: 2026-10-05 19:45
ESTADO: SUB-BLOQUE LISTO (pendiente de verificación del coordinador)
TAREAS:
- Consumidores SQL LISTO: `privado.metricas_ejecutivas_rango`, `public.obtener_metricas_vendedor` y `public.obtener_metricas_pipeline_equipo` recreadas con `estado_rfq` conservando firmas y claves JSON (`pipelinePorEtapa` con los 6 buckets, `cotizacionesSinSeguimiento`, meta/comisión, órdenes y finanzas). Helper `privado.etapa_legacy_de_rfq(text)`.
- Retiro del puente LISTO: `DROP` del trigger `trigger_pipeline_sincronizar_etapa_rfq` y de `privado.sincronizar_etapa_rfq()`; `etapa` queda como columna histórica con COMMENT de deprecación.
- UI `/rfq` LISTO: cola con chips por estado, filtros (texto, estado, prioridad, etiqueta, área, cliente, responsable, próxima vencida, fechas, TI), vistas Tablero (8 columnas por estado) y Lista, alta de RFQ; ficha con encabezado `folio_rfq ?? folio_op`, chip de estado, acciones de negocio por estado y pestañas Resumen/Ítems/Archivos/Propuestas (placeholder B4)/Actividad. `/pipeline` redirige a `/rfq` conservando query (`?rfq=` y `?oportunidad=`).
- Ítems LISTO: CRUD ITxx con material y espesor dependiente de `catalogo_espesores`, operaciones de `catalogo_procesos`, cancelación sin reutilizar número; bloqueado en READY/terminal (igual que la RPC).
- Archivos LISTO: subida general (`rfq`) y por ítem (`rfq_item`) al bucket privado con metadata en `archivos` (E3), listado de vigentes y URL firmada; clases CAD/DIBUJO/IMAGEN/ESPECIFICACIONES/OTROS.
- Gate LISTO LISTO: panel con faltantes por sección consultado fresco en cada apertura; el botón solo se habilita sin faltantes y el servidor revalida (`rfq_no_listo`).
- Consumidores TS LISTO: pipeline (tipos `estadoRfq`, servicios, filtros, alertas, resumen, gates de acciones, kanban→cola, tarjeta/tabla/controles), `actualizar-etapa` neutralizada con error de negocio, `marcar-ganada`/`marcar-perdida` conservadas pero fuera de la UI, dashboard (claves intactas; sin cambios TS necesarios), historial de cliente (3 archivos transferidos) y `auditoria/actividad` (etiqueta RFQ, enlaces a `/rfq?rfq=`).

ARCHIVOS:
- Nuevos: `supabase/migrations/20261007100004_sii_b3_rfq_consumidores.sql`, `20261007100005_sii_b3_retirar_puente.sql`, `supabase/tests/sii_b3_rfq_consumidores.test.sql`, `src/modulos/rfq/acciones/{obtener-catalogos,actualizar-datos-rfq,archivos-rfq}.ts`, `src/modulos/rfq/componentes/{ficha-rfq,panel-acciones-rfq,formulario-general-rfq,tabla-items-rfq,panel-archivos-rfq,actividad-rfq}.tsx`, `src/modulos/pipeline/componentes/cola-rfq.tsx`, `src/modulos/pipeline/utilidades/proxima-accion.ts`, `src/app/(panel)/rfq/{page,loading}.tsx`, `tests/e2e/rfq-flujo.spec.ts`, `tests/unitarias/pipeline-transiciones.test.ts` (reescrito).
- Modificados: `src/app/(panel)/pipeline/page.tsx` (redirect), `src/compartido/componentes/navegacion/modulos-navegacion.ts` (entrada `/rfq`), `src/compartido/componentes/diseno/badge-estado.tsx` (8 estados RFQ aditivos), `src/modulos/pipeline/{tipos/indice, utilidades/indice, servicios/{reglas-transicion,calcular-alertas,resumen-pipeline,filtrar-oportunidades,obtener-oportunidades}, acciones/{crear-prospecto,actualizar-etapa,asignar-cliente-oportunidad,actualizar-datos-oportunidad,actualizar-orden-interna,retirar-oportunidad,marcar-ganada,marcar-perdida}}`, componentes de pipeline, `validaciones/esquemas-transicion-etapa.ts`, `src/modulos/clientes/{tipos/historial,servicios/obtener-historial-cliente,componentes/historial-cliente}`, `src/modulos/auditoria/utilidades/{actividad,enlace-registro}.ts`, `src/modulos/rfq/validaciones/esquemas-rfq.ts`, specs E2E (comercial-realtime, aceptacion-comercial, clientes-historial, bitacora-configuracion, actividad) y unitarias de pipeline/rfq/clientes-historial.
- Eliminados: `src/modulos/pipeline/componentes/{tablero-kanban,selector-etapa}.tsx` (reemplazados por la cola y las acciones de negocio).

MIGRACIONES: `20261007100004_sii_b3_rfq_consumidores.sql`, `20261007100005_sii_b3_retirar_puente.sql` | APLICADAS EN LOCAL CON AUTORIZACIÓN EXPRESA DEL PO (`supabase migration up --local`; la CLI aplicó también pendientes de C `2026100711*` y A `20261007150001`, ya listas). NO aplicadas en remoto: pendiente PO.

GATES:
- unit: 886/886. lint: 0. typecheck: 0. build: OK (`/rfq` y `/pipeline` presentes).
- pgTAP focal `sii_b3_rfq_consumidores.test.sql`: 17/17; `sii_b3_rfq_base.test.sql` actualizado a la ola 2: 56/56.
- pgTAP global: 33 archivos, 744/744 PASS.
- integración: 226/226 (fixture de `aprobacion-credito-identidad` actualizado con `estado_rfq`).
- E2E focal `rfq-flujo.spec.ts` + regresión (`comercial-realtime`, `aceptacion-comercial`, `dashboard-roles`, `clientes-historial`, `actividad`, `bitacora-configuracion`, `configuracion-flujo`): 15/15 con `BLOQUEO-PRUEBAS.lock`.
- Visual: `.ai-shared/qa/sii-b3-ola2/visual/rfq-ficha-{escritorio,tableta}-{claro,oscuro}.png` (4 capturas).

EVIDENCIA (comandos):
- `pnpm typecheck` EXIT 0; `pnpm lint` EXIT 0; `pnpm test` 886 passed; `pnpm build` EXIT 0.
- `supabase test db --local` → Files=33, Tests=744, PASS.
- `pnpm test:integracion` → 30 archivos, 226 passed.
- `pnpm exec playwright test tests/e2e/rfq-flujo.spec.ts tests/e2e/comercial-realtime.spec.ts tests/e2e/aceptacion-comercial.spec.ts tests/e2e/dashboard-roles.spec.ts tests/e2e/clientes-historial.spec.ts tests/e2e/actividad.spec.ts tests/e2e/bitacora-configuracion.spec.ts tests/e2e/configuracion-flujo.spec.ts` → 15 passed.

DECISIONES / INTERPRETACIONES:
- Buckets del embudo (contrato JSON sin cambios): prospecto=NEW; contactado=INCOMPLETE/WAITING_CUSTOMER/WAITING_TECHNICAL; cotizado=READY_FOR_PROPOSAL; negociacion=CONVERTED sin orden; ganada=RFQ con orden vinculada; perdida=CLOSED/CANCELLED. `porcentajeConversion` y `cotizacionesSinSeguimiento` usan el mismo criterio.
- `marcar-ganada`/`marcar-perdida` se conservan (retiro de UI) pero sus gates/fixtures migraron a `estado_rfq`; `marcar-perdida` además escribe `estado_rfq='CLOSED'`. `aprobar_oportunidad_y_crear_orden` y `guardar_cotizacion_atomica` siguen leyendo `etapa` como camino legacy: sus sustitutos llegan en B4/B5 y entonces se retirará esa última lectura (nota para el coordinador).
- `aceptacion-comercial.spec.ts` se adaptó a la transición: la orden se crea con la RPC legacy vía service_role tras preparar líneas/etapa (la UI de etapas se retiró); la UI nueva cubre el flujo RFQ en `rfq-flujo.spec.ts`. Se restaurará el flujo UI sobre propuestas en B4/B5.
- El log de acciones RFQ usa módulo `'pipeline'` (misma decisión de ola 1) y los enlaces de Actividad/Bitácora apuntan a `/rfq?rfq=`.

BLOQUEOS: ninguno propio.

SIGUIENTE: el PO aplica `20261007100004/0005` en remoto; el coordinador hace cross-review y commit; B4/B5 sustituirán la aceptación/orden y retirarán las últimas lecturas de `etapa` (`aprobar_oportunidad_y_crear_orden`, `guardar_cotizacion_atomica`).

## 2026-10-05 23:40 — B6 Producción básica ola 1 (modelo y reglas de piso)

TERMINAL: B | FECHA-HORA: 2026-10-05 23:40
ESTADO: SUB-BLOQUE LISTO (modelo, sin UI; pendiente de verificación del coordinador)
TAREAS:
- Modelo LISTO: `corridas` + `corrida_items` (compatibilidad por orden/proceso/grupo, código `<PREFIJO><NN>` con consecutivo CASE sin truncar), `sesiones_trabajo.corrida_id` nullable + auto-corrida legacy al primer inicio, `catalogo_motivos_pausa` (DUDA/MATERIAL liberan máquina) + columnas `motivo_pausa_codigo/nota`, `recurso_liberado`, `verificacion_inicio`, `autorizaciones_hora_extra` e `inspecciones_calidad`. RLS de lectura por permiso de producción/calidad, Realtime de `corridas`, backfill de motivos legacy.
- Acciones LISTO: `crear_corrida` (items compatibles, cantidades ≤ pendiente, nunca otra orden), `iniciar_corrida`/`completar_corrida` (todas las metas)/`cancelar_corrida` (sin avance), `reclamar_recurso_liberado` (≥60 min, motivo liberable, traza), `cerrar_jornada` (FIN_JORNADA, sin cruzar fecha), `autorizar_horas_extra` (Management/Admin; cierre valida contra la jornada configurada del turno vía capacidad efectiva, sin hardcodear 8 h), `registrar_inspeccion` (primera pieza, referencias 1/3/5 e intervalos 10/20, cierre).
- RPC de piso recreadas LISTO: `iniciar_sesion_trabajo_operador` (checklist obligatorio de 6 eventos, corrida explícita/única/auto-legacy, herencia del checklist al reanudar) y `cerrar_sesion_trabajo_operador` (motivo por catálogo o legacy, nota si el catálogo la exige, gate de primera pieza, horas extra con autorización consumida como USADA, estado de corrida derivado) conservando firma/returns y el contrato de locks partida→orden→operador→programación→recurso→sesión.
- Código LISTO: tipos/validaciones/servicios/acciones en `src/modulos/produccion/**` con `can()` + admin + `registrarLog` + `nuevoCorrelationId`; `supabase.ts` bajo lock con las 5 tablas, columnas de sesión y 8 RPC nuevas.
- Hook B5: ningún objeto de B6 asume `estado_sii`; el único update va en `DO`/`IF EXISTS` dentro de `completar_corrida`.

ARCHIVOS:
- Nuevos: `supabase/migrations/20261007130001_sii_b6_produccion_base.sql`, `20261007130002_sii_b6_produccion_acciones.sql`, `supabase/tests/sii_b6_produccion.test.sql`, `src/modulos/produccion/tipos/corridas.ts`, `src/modulos/produccion/utilidades/corridas.ts`, `src/modulos/produccion/validaciones/corridas.ts`, `src/modulos/produccion/servicios/{corridas,calidad}-servicio.ts`, `src/modulos/produccion/acciones/{utilidades-acciones,crear-corrida,estado-corrida,reclamar-recurso,cerrar-jornada,autorizar-horas-extra,registrar-inspeccion}.ts`, `tests/unitarias/produccion-corridas.test.ts`.
- Modificados: `src/compartido/tipos/supabase.ts`, `src/modulos/produccion/{tipos/produccion,tipos/indice,utilidades/indice,validaciones/produccion,validaciones/indice,servicios/sesiones-servicio,servicios/indice,acciones/indice,acciones/iniciar-sesion-operador}.ts`, `tests/unitarias/{produccion-esquemas,produccion-tablero}.test.ts`, `tests/integracion/produccion-sesiones.test.ts`, `supabase/tests/{a05_a06_areas_operador,a20_reanudar_sesion_contextual,sii_b3_rfq_base}.test.sql` (regresión al contrato B6 y al folio 999 de A).

MIGRACIONES: `20261007130001` y `20261007130002` | APLICADAS EN LOCAL CON AUTORIZACIÓN EXPRESA DEL PO (psql + `migration repair --status applied --local`, porque la CLI pedía `--include-all` por migraciones de A/C aún pendientes y las terminales no usan ese flag). NO aplicadas en remoto: pendiente PO.

GATES:
- unit: 916/916. lint: 0. typecheck: 0. build: OK.
- pgTAP focal `sii_b6_produccion.test.sql`: 71/71.
- pgTAP global: 36 archivos, 811 tests; 704 en verde y 3 archivos en rojo EXCLUSIVAMENTE por migraciones pendientes de A/C: `sii_b3_continuidad_folios` (A `20261007150002`), `sii_b4_propuestas_envio` (C `20261007110003`), `sii_b5_orden` (A `20261007120001/2`).
- integración: 226/226.
- E2E regresión del flujo mutado: `produccion-piso.spec.ts` + `produccion-avance-procesos.spec.ts` → 3/3 con `BLOQUEO-PRUEBAS.lock`.

EVIDENCIA (comandos):
- `pnpm typecheck` EXIT 0; `pnpm lint` EXIT 0; `pnpm test` 916 passed; `pnpm build` EXIT 0.
- `supabase test db supabase/tests/sii_b6_produccion.test.sql --local` → 71/71 PASS.
- `supabase test db --local` → Files=36, Tests=811 (fallos solo A/C por migraciones pendientes).
- `pnpm test:integracion` → 30 archivos, 226 passed.
- `pnpm exec playwright test tests/e2e/produccion-piso.spec.ts tests/e2e/produccion-avance-procesos.spec.ts` → 3 passed.

DECISIONES / INTERPRETACIONES:
- Corridas legacy: si no llega `p_corrida_id`, se usa la corrida de la última sesión de la programación (reanudación), o la única activa del ítem; con más de una activa se exige elegir (`corrida_ambigua`). Sin corrida se genera una automática con el proceso que la partida/metas declaren; si no hay match de catálogo, se usa un proceso activo sin `requiere_primera_pieza` como fallback técnico de grandfathering (evita bloquear producción legacy por un gate nuevo).
- `reanudar_sesion_trabajo_a20` conserva el checklist del inicio (lo hereda de la sesión pausada); no cambia su firma.
- Compatibilidad temporal de checklist: la Server Action de inicio de sesión del piso inyecta una verificación marcada como “compatibilidad B6 ola 1” cuando la UI aún no la captura; la ola 2 la sustituye por la captura real (el SQL ya la exige).
- La pausa acepta códigos del catálogo nuevo o los 6 motivos legacy (mapeo documentado); el CHECK legacy de `motivo_pausa` se conserva (ADR-09).
- Horas extra: solo se exige autorización cuando la jornada configurada del turno es > 0 (capacidad efectiva del recurso/fecha/turno); si el recurso no tiene capacidad configurada, no se bloquea (nunca se hardcodea 8 h).
- `corrida_ambigua`/`verificacion_inicio_incompleta` y demás códigos nuevos se agregaron al union `CodigoErrorProduccion` con mensajes es-MX.

BLOQUEOS: ninguno propio. A/C tienen migraciones pendientes en local (`20261007110003`, `20261007120001/2`, `20261007150002`) y sus tests pgTAP/typecheck en curso; no las toqué.

SIGUIENTE: el PO aplica `2026100713*` en remoto; el coordinador hace cross-review/commit; B6 ola 2 monta la UI de corridas/checklist/pausas/horas extra/calidad y retira la verificación de compatibilidad.
