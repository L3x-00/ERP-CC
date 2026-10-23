# Mapa estático del módulo «planeacion» (generado sin modelo el 2026-10-14T14:15:54.077Z)
Fuente: `src/modulos/planeacion` · 32 archivos · 4873 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/activar-modo-preparacion.ts | 50 | sí | activarModoPreparacionAccion |  |  |  | autenticacion |
| acciones/actualizar-capacidad-recurso.ts | 70 | sí | actualizarCapacidadRecursoAccion |  | recursos_planeacion |  | autenticacion |
| acciones/indice.ts | 6 |  |  |  |  |  |  |
| acciones/obtener-calendario-planeacion.ts | 52 | sí | obtenerCalendarioPlaneacionAccion |  |  |  | autenticacion |
| acciones/programar-partida-recurso.ts | 59 | sí | programarPartidaRecursoAccion |  |  |  | autenticacion |
| acciones/proponer-hueco-reprogramacion.ts | 69 | sí | proponerHuecoReprogramacionAccion |  | recursos_planeacion |  | autenticacion |
| acciones/reprogramar-partida-recurso.ts | 59 | sí | reprogramarPartidaRecursoAccion |  |  |  | autenticacion |
| componentes/acciones-tarjeta-orden.tsx | 135 |  | PropsAccionesTarjetaOrden, AccionesTarjetaOrden |  |  | acciones-tarjeta-${programacion.ordenId}, accion-bandeja-${programacion.ordenId}, accion-liberar-${programacion.ordenId}, accion-sesion-${programacion.ordenId}, accion-entregar-${programacion.ordenId}, accion-imprimir-${programacion.ordenId}, accion-reactivar-${programacion.ordenId} | ordenes |
| componentes/calendario-planeacion.tsx | 380 |  | FiltrosConsultaCalendario, PropsCalendarioPlaneacion, CalendarioPlaneacion |  |  | vista-planeacion-${valor} |  |
| componentes/claves-consulta.ts | 7 |  | CLAVE_CALENDARIO_PLANEACION |  |  |  |  |
| componentes/dialogo-reprogramacion-planeacion.tsx | 223 |  | PropsDialogoReprogramacionPlaneacion, DialogoReprogramacionPlaneacion |  |  | dialogo-reprogramacion-planeacion, fecha-destino-reprogramacion, capacidad-reprogramacion, buscar-hueco-reprogramacion, confirmar-reprogramacion-planeacion |  |
| componentes/indice.ts | 18 |  |  |  |  |  |  |
| componentes/operacion-planeacion.tsx | 329 |  | PropsOperacionPlaneacion, OperacionPlaneacion |  |  |  |  |
| componentes/panel-asignacion-planeacion.tsx | 556 |  | PartidaProgramablePlaneacion, DatosAsignacionPlaneacion, ResultadoAsignacionPlaneacion, ResultadoProponerHueco, EntradaProponerHueco, PropsPanelAsignacionPlaneacion, PanelAsignacionPlaneacion |  |  | panel-asignacion-planeacion, desglose-partida-planeacion, resumen-programacion-planeacion, aviso-capacidad-insuficiente, buscar-hueco-planeacion, hueco-sugerido-planeacion, usar-hueco-sugerido-planeacion, guardar-asignacion-planeacion, activar-preparacion-planeacion |  |
| componentes/panel-bolsa-planeacion.tsx | 134 |  | ResultadoAsignarSugerencia, PropsPanelBolsaPlaneacion, PanelBolsaPlaneacion |  |  | bolsa-planeacion, bolsa-pausadas, bolsa-hoy, bolsa-sugerencias, bolsa-sugerencia-${sugerencia.partidaId}, asignar-sugerencia-${sugerencia.partidaId} |  |
| componentes/panel-capacidad-instalada.tsx | 214 |  | PanelCapacidadInstalada |  | recursos_planeacion | panel-capacidad-instalada, capacidad-recurso-${recurso.codigo}, capacidad-total-${recurso.codigo} |  |
| componentes/sincronizador-planeacion-realtime.tsx | 137 |  | PropsSincronizadorPlaneacionRealtime, SincronizadorPlaneacionRealtime |  |  |  |  |
| componentes/tarjeta-programacion-planeacion.tsx | 173 |  | TIPO_ARRASTRE_PROGRAMACION, PropsTarjetaProgramacionPlaneacion, TarjetaProgramacionPlaneacion |  |  | programacion-${programacion.id} |  |
| componentes/vistas-calendario-planeacion.tsx | 257 |  | PropsVistaCalendario, idProgramacionArrastrada, VistaDia, VistaSemana, VistaMes |  |  | vista-dia, vista-semana, columna-${fecha}, vista-mes, celda-${fecha} |  |
| servicios/bolsa-planeacion-servicio.ts | 213 |  | PartidaBolsa, SugerenciaBolsa, BolsaPlaneacion, horasSugeridas, siguienteSecuencia, elegirHueco, obtenerBolsaPlaneacionServicio |  | ordenes_produccion, partidas_orden_produccion, programacion_areas, recursos_planeacion |  |  |
| servicios/capacidad-servicio.ts | 417 |  | UMBRAL_OCUPACION_AJUSTADA, UMBRAL_OCUPACION_SATURADA, UMBRAL_OCUPACION_SOBRECARGA, CLASIFICACIONES_SATURACION, ClasificacionSaturacion, CargaRecursoTurno, OcupacionRecursoTurno, OpcionesCuellosBotella |  |  |  |  |
| servicios/desglose-servicio.ts | 158 |  | obtenerDesglosePartidasServicio |  | partidas_orden_produccion, materiales, catalogo_materiales, areas_trabajo_config, ordenes_produccion |  |  |
| servicios/indice.ts | 63 |  |  |  |  |  |  |
| servicios/planeacion-servicio.ts | 342 |  | CodigoErrorPlaneacion, ErrorPlaneacion, ProgramacionActualizada, ReprogramarPartidaRecursoEntrada, ProgramarPartidaRecursoEntrada, FiltrosCalendarioPlaneacion, DatosCalendarioPlaneacion, programarPartidaRecursoServicio | programar_partida_recurso_auditada, reprogramar_partida_recurso_auditada, activar_modo_preparacion, obtener_carga_capacidad_diaria | programacion_areas, ordenes_produccion, recursos_planeacion |  |  |
| tipos/indice.ts | 30 |  |  |  |  |  |  |
| tipos/planeacion.ts | 225 |  | AREAS_PLANEACION, TURNOS_PLANEACION, ESTADOS_PLANEACION, AreaPlaneacion, TurnoPlaneacion, EstadoPlaneacion, RecursoPlaneacion, CapacidadRecursoTurno |  |  |  | ordenes |
| utilidades/capacidad.ts | 33 |  | JORNADA_ESTANDAR_HORAS, jornadaBaseHoras, capacidadInstaladaHoras |  |  |  |  |
| utilidades/desglose.ts | 80 |  | TEXTO_POR_DEFINIR, textoODefecto, formatearDuracionMinutos, calcularPendientes, etiquetaAvancePartida, etiquetaProcesos, etiquetaMaterial, etiquetaArea |  |  |  |  |
| utilidades/etiquetas.ts | 42 |  | ETIQUETA_AREA, ETIQUETA_TURNO, ETIQUETA_ESTADO, VARIANTE_ESTADO |  |  |  |  |
| utilidades/fechas-planeacion.ts | 189 |  | VISTAS_PLANEACION, VistaPlaneacion, RangoFechas, hoyIso, sumarDias, inicioSemana, finSemana, inicioMes |  |  |  |  |
| validaciones/indice.ts | 18 |  |  |  |  |  |  |
| validaciones/planeacion.ts | 135 |  | esquemaProgramarOrden, esquemaCambiarModoPreparacion, esquemaReprogramarPartidaRecurso, esquemaActivarModoPreparacion, esquemaProponerHuecoPlaneacion, esquemaConsultarCalendarioPlaneacion, ProgramarOrdenInput, CambiarModoPreparacionInput |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/planeacion/loading.tsx
- src/app/(privado)/planeacion/page.tsx
- src/app/(privado)/produccion/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/planeacion/page.tsx <- operacion-planeacion, panel-capacidad-instalada, panel-asignacion-planeacion, desglose-servicio, bolsa-planeacion-servicio, planeacion-servicio, fechas-planeacion
- src/app/(privado)/produccion/page.tsx <- fechas-planeacion
### otros
- src/estado/uso-tienda-planeacion.ts <- indice
### produccion
- src/modulos/produccion/servicios/sesiones-servicio.ts <- indice
- src/modulos/produccion/servicios/tablero-produccion-servicio.ts <- indice
### propuestas
- src/modulos/propuestas/acciones/generar-pdf-revision.ts <- fechas-planeacion
- src/modulos/propuestas/acciones/obtener-propuestas.ts <- fechas-planeacion
- src/modulos/propuestas/componentes/dialogo-seguimiento-propuesta.tsx <- fechas-planeacion

## RPC usadas por el módulo -> última migración que las define
- programar_partida_recurso_auditada: 20261009193327_c4_2_orden_comercial_operativa.sql (1 definiciones)
- reprogramar_partida_recurso_auditada: 20261009193327_c4_2_orden_comercial_operativa.sql (1 definiciones)
- activar_modo_preparacion: 20260813211519_fase_6_corregir_conflicto_cas.sql (2 definiciones)
- obtener_carga_capacidad_diaria: 20260919000007_d02_capacidad_instalada.sql (2 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)
- recursos_planeacion: 20261009140000_c3_2_tarifas_grupo_recurso.sql (5 migraciones)
- ordenes_produccion: 20261012130000_b5_obs5_orden_interna_sin_cliente.sql (9 migraciones)
- partidas_orden_produccion: 20261010130000_c6_2_consumo_sin_stock.sql (5 migraciones)
- programacion_areas: 20260813201729_fase_6_planeacion_base.sql (1 migraciones)
- materiales: 20260911000004_auditoria_seguridad_rls_y_folios.sql (2 migraciones)
- catalogo_materiales: 20261013120000_c6_obs8_materiales_padre.sql (3 migraciones)
- areas_trabajo_config: 20260921000002_obs14_taxonomia_operadores_areas.sql (2 migraciones)

## Otras funciones SQL del dominio (nombre coincide con los términos) -> última migración
- area_planeacion_catalogo: 20260922000006_a06_ancestros_area_sin_fail_open.sql (2 definiciones)
- cerrar_jornada: 20261007130002_sii_b6_produccion_acciones.sql (1 definiciones)
- obtener_capacidad_efectiva_recurso_turno: 20260919000007_d02_capacidad_instalada.sql (2 definiciones)
- obtener_jornada_recurso_turno: 20261007230003_sii_b6_jornada_horas_extra.sql (1 definiciones)

## Pruebas relacionadas (129) — términos: planeacion, programar_partida_recurso_auditada, reprogramar_partida_recurso_auditada, activar_modo_preparacion, obtener_carga_capacidad_diaria, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, materiales, catalogo_materiales, areas_trabajo_config, capacidad, turno, jornada
- tests/e2e/aceptacion-comercial.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, areas_trabajo_config
- tests/e2e/actividad.spec.ts — ordenes_produccion
- tests/e2e/cancelacion-financiera.spec.ts — ordenes_produccion
- tests/e2e/catalogos-base.spec.ts — planeacion, recursos_planeacion, materiales
- tests/e2e/clientes-historial.spec.ts — ordenes_produccion, partidas_orden_produccion
- tests/e2e/cobranza-cobro-multiple.spec.ts — ordenes_produccion
- tests/e2e/cobranza-ficha.spec.ts — ordenes_produccion
- tests/e2e/cobranza-flujo.spec.ts — ordenes_produccion, partidas_orden_produccion
- tests/e2e/cobranza-folio-rp.spec.ts — ordenes_produccion
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — ordenes_produccion
- tests/e2e/compras-flujo.spec.ts — ordenes_produccion
- tests/e2e/corridas-calidad.spec.ts — planeacion, programar_partida_recurso_auditada, activar_modo_preparacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion (+3)
- tests/e2e/entregas-flujo.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- tests/e2e/facturacion-flujo.spec.ts — ordenes_produccion
- tests/e2e/gastos-rentabilidad-ti.spec.ts — ordenes_produccion
- tests/e2e/gastos-rentabilidad.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, materiales (+3)
- tests/e2e/materiales-costos-c6-3.spec.ts — materiales, catalogo_materiales
- tests/e2e/ordenes-edicion-borrador.spec.ts — ordenes_produccion, partidas_orden_produccion
- tests/e2e/ordenes-estados-sii.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, materiales (+2)
- tests/e2e/ordenes-flujo-completo.spec.ts — ordenes_produccion, partidas_orden_produccion, materiales, catalogo_materiales
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- tests/e2e/planeacion-bolsa-acciones.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, capacidad (+1)
- tests/e2e/planeacion-capacidad.spec.ts — planeacion, recursos_planeacion, capacidad, turno, jornada
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — planeacion, programar_partida_recurso_auditada, reprogramar_partida_recurso_auditada, activar_modo_preparacion, recursos_planeacion, ordenes_produccion (+4)
- tests/e2e/produccion-avance-procesos.spec.ts — planeacion, programar_partida_recurso_auditada, activar_modo_preparacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion (+3)
- tests/e2e/produccion-piso.spec.ts — planeacion, programar_partida_recurso_auditada, activar_modo_preparacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion (+3)
- tests/e2e/propuestas-flujo.spec.ts — planeacion, ordenes_produccion, programacion_areas, materiales, catalogo_materiales
- tests/e2e/rfq-flujo.spec.ts — materiales, catalogo_materiales
- tests/e2e/taller-taxonomia.spec.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, areas_trabajo_config
- tests/integracion/aislamiento-entorno.test.ts — capacidad
- tests/integracion/aprobacion-credito-identidad.test.ts — ordenes_produccion
- tests/integracion/ar-anulacion-consolidacion.test.ts — ordenes_produccion
- tests/integracion/ar-excepcion-concurrencia.test.ts — ordenes_produccion
- tests/integracion/ar-movimientos.test.ts — ordenes_produccion
- tests/integracion/archivos-sesion-rls.test.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- tests/integracion/avance-proceso-concurrencia.test.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- tests/integracion/c2-3-documentos-orden.test.ts — ordenes_produccion
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — planeacion, recursos_planeacion, ordenes_produccion
- tests/integracion/cancelacion-cobro-concurrencia.test.ts — ordenes_produccion
- tests/integracion/concurrencia-estricta.test.ts — ordenes_produccion, partidas_orden_produccion, materiales, catalogo_materiales
- tests/integracion/inventario-movimientos.test.ts — materiales
- tests/integracion/materiales-costos-acciones.test.ts — materiales
- tests/integracion/orden-heredada.test.ts — ordenes_produccion, partidas_orden_produccion, programacion_areas
- tests/integracion/reactivar-orden.test.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- tests/integracion/repetir-trabajo.test.ts — ordenes_produccion, partidas_orden_produccion, programacion_areas
- tests/unitarias/catalogos-canales-ui.test.ts — materiales
- tests/unitarias/catalogos-esquemas.test.ts — materiales, catalogo_materiales
- tests/unitarias/catalogos-mappers.test.ts — materiales, catalogo_materiales
- tests/unitarias/catalogos-utilidades.test.ts — materiales
- tests/unitarias/clientes-historial.test.ts — ordenes_produccion, partidas_orden_produccion
- tests/unitarias/cobranza-historial-servicio.test.ts — ordenes_produccion
- tests/unitarias/gastos-rentabilidad.test.ts — materiales
- tests/unitarias/inventario-c6-3-panel.test.ts — materiales
- tests/unitarias/inventario-servicios.test.ts — materiales
- tests/unitarias/materiales-catalogo-obs8.test.ts — materiales
- tests/unitarias/materiales-costos-esquemas.test.ts — materiales
- tests/unitarias/materiales-costos-servicio.test.ts — materiales, catalogo_materiales
- tests/unitarias/materiales-costos-ui.test.ts — materiales
- tests/unitarias/ordenes-lotes-servicio.test.ts — ordenes_produccion, partidas_orden_produccion
- tests/unitarias/ordenes-servicio.test.ts — ordenes_produccion
- tests/unitarias/pipeline-selector-cliente.test.ts — materiales
- tests/unitarias/planeacion-acciones.test.ts — planeacion, turno
- tests/unitarias/planeacion-bolsa.test.ts — planeacion, capacidad, turno
- tests/unitarias/planeacion-capacidad-instalada.test.ts — planeacion, capacidad, turno, jornada
- tests/unitarias/planeacion-capacidad.test.ts — planeacion, capacidad, turno
- tests/unitarias/planeacion-componentes.test.ts — planeacion, capacidad, turno
- tests/unitarias/planeacion-desglose.test.ts — planeacion
- tests/unitarias/planeacion-esquemas.test.ts — planeacion, capacidad, turno, jornada
- tests/unitarias/planeacion-realtime.test.ts — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, capacidad (+1)
- tests/unitarias/planeacion-servicio.test.ts — planeacion, programar_partida_recurso_auditada, reprogramar_partida_recurso_auditada, activar_modo_preparacion, capacidad, turno
- tests/unitarias/planeacion-tienda.test.ts — planeacion, turno
- tests/unitarias/produccion-area-operadores.test.ts — planeacion
- tests/unitarias/propuestas-costeo-fabricacion.test.ts — materiales
- tests/unitarias/propuestas-items-revision-ui.test.ts — materiales
- tests/unitarias/propuestas-seguimiento-modal.test.ts — materiales
- tests/unitarias/rfq-alta-modal.test.ts — materiales
- tests/unitarias/rfq-campos-faltantes.test.ts — materiales
- tests/unitarias/rfq-canales.test.ts — materiales
- tests/unitarias/rfq-contacto-formulario.test.ts — materiales
- tests/unitarias/rfq-flujo-captura-ui.test.ts — materiales
- tests/unitarias/rfq-historial-versiones.test.ts — materiales
- tests/unitarias/rfq-items-formulario.test.ts — materiales
- tests/unitarias/rfq-resumen.test.ts — materiales
- supabase/tests/a02_cancelacion_ar.test.sql — ordenes_produccion
- supabase/tests/a03_a04_ingreso_neto.test.sql — ordenes_produccion
- supabase/tests/a05_a06_areas_operador.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, areas_trabajo_config (+1)
- supabase/tests/a07_a09_publicacion_identidad.test.sql — ordenes_produccion, partidas_orden_produccion, areas_trabajo_config
- supabase/tests/a15_estimado_por_tarifa.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas
- supabase/tests/a16_plazo_credito.test.sql — ordenes_produccion, partidas_orden_produccion
- supabase/tests/a20_ar08_ar09_movimientos.test.sql — ordenes_produccion
- supabase/tests/a20_ar16_cfg12.test.sql — ordenes_produccion
- supabase/tests/a20_ar_excepcion_entregada.test.sql — ordenes_produccion
- supabase/tests/a20_cli08_repetir_trabajo.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- supabase/tests/a20_factura_ar_existente.test.sql — ordenes_produccion
- supabase/tests/a20_metas_proceso_partida.test.sql — ordenes_produccion, partidas_orden_produccion
- supabase/tests/a20_ord06_orden_heredada.test.sql — planeacion, ordenes_produccion, partidas_orden_produccion, areas_trabajo_config
- supabase/tests/a20_prd09_avance_proceso.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, capacidad (+1)
- supabase/tests/a20_prd15_reactivar_orden.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, turno
- supabase/tests/a20_reanudar_sesion_contextual.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, areas_trabajo_config (+2)
- supabase/tests/a20_referencia_interna_ar.test.sql — ordenes_produccion
- supabase/tests/b4_obs2_flujo_versiones.test.sql — materiales, catalogo_materiales
- supabase/tests/b5_obs5_orden_interna_sin_cliente.test.sql — ordenes_produccion, partidas_orden_produccion, materiales, catalogo_materiales, areas_trabajo_config
- supabase/tests/c2_1_rfq_versiones.test.sql — materiales, catalogo_materiales
- supabase/tests/c3_1_linaje_documental_orden.test.sql — ordenes_produccion, partidas_orden_produccion
- supabase/tests/c3_2_tarifas_grupo_recurso.test.sql — planeacion, recursos_planeacion
- supabase/tests/c3_3_costeo_ruteo.test.sql — planeacion, recursos_planeacion, materiales, catalogo_materiales
- supabase/tests/c4_1_aceptacion_orden_pendiente.test.sql — ordenes_produccion, materiales, catalogo_materiales
- supabase/tests/c4_2_orden_comercial_operativa.test.sql — planeacion, programar_partida_recurso_auditada, reprogramar_partida_recurso_auditada, recursos_planeacion, ordenes_produccion, partidas_orden_produccion (+5)
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql — planeacion, recursos_planeacion, ordenes_produccion
- supabase/tests/c6_1_materiales_costos.test.sql — materiales, catalogo_materiales
- supabase/tests/c6_2_consumo_sin_stock.test.sql — ordenes_produccion, partidas_orden_produccion, materiales, catalogo_materiales
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — ordenes_produccion, materiales
- supabase/tests/c6_obs8_materiales_padre.test.sql — materiales, catalogo_materiales
- supabase/tests/c6_obs8_saldos_material.test.sql — materiales, catalogo_materiales
- supabase/tests/sii_b1_actividad.test.sql — ordenes_produccion
- supabase/tests/sii_b1_catalogos.test.sql — planeacion, recursos_planeacion, materiales, catalogo_materiales
- supabase/tests/sii_b3_continuidad_folios.test.sql — ordenes_produccion
- supabase/tests/sii_b3_rfq_base.test.sql — materiales, catalogo_materiales
- supabase/tests/sii_b3_rfq_consumidores.test.sql — ordenes_produccion
- supabase/tests/sii_b4_propuestas.test.sql — materiales, catalogo_materiales
- supabase/tests/sii_b4_propuestas_envio.test.sql — materiales, catalogo_materiales
- supabase/tests/sii_b5_orden.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, materiales (+2)
- supabase/tests/sii_b6_produccion.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, capacidad (+2)
- supabase/tests/sii_b7_entregas.test.sql — ordenes_produccion, partidas_orden_produccion
- supabase/tests/sii_b8_cobros_promesas.test.sql — ordenes_produccion
- supabase/tests/sii_b8_facturacion.test.sql — ordenes_produccion
- supabase/tests/sii_b8_folio_recibo.test.sql — ordenes_produccion
- supabase/tests/sii_b9_kpis.test.sql — planeacion, recursos_planeacion, ordenes_produccion, partidas_orden_produccion, programacion_areas, capacidad (+2)
- supabase/tests/tarifario_unico_estacion.test.sql — planeacion, recursos_planeacion