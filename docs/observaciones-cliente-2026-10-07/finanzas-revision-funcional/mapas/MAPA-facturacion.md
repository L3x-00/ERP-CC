# Mapa estático del módulo «facturacion» (generado sin modelo el 2026-10-14T18:16:10.329Z)
Fuente: `src/modulos/facturacion` · 13 archivos · 1535 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/actualizar-factura-borrador.ts | 72 | sí | ResultadoActualizarFactura, actualizarFacturaBorradorAccion | actualizar_factura_borrador |  |  | autenticacion |
| acciones/cancelar-factura.ts | 77 | sí | ResultadoCancelarFactura, cancelarFacturaAccion | cancelar_factura |  |  | autenticacion |
| acciones/crear-factura-borrador.ts | 86 | sí | ResultadoCrearFactura, crearFacturaBorradorAccion | crear_factura_borrador |  |  | autenticacion |
| acciones/emitir-factura.ts | 84 | sí | ResultadoEmitirFactura, emitirFacturaAccion | emitir_factura |  |  | autenticacion |
| acciones/obtener-cola-facturas.ts | 33 | sí | obtenerColaFacturasAccion |  |  |  | autenticacion |
| acciones/preparar-factura-entrega.ts | 44 | sí | prepararFacturaEntregaAccion |  |  |  | autenticacion |
| componentes/cola-facturas.tsx | 206 |  | ColaFacturas |  |  | cola-facturas, filtro-estado-factura, filtro-texto-factura, actualizar-facturas, nueva-factura, facturas-vacio, tabla-facturas, fila-factura-${factura.id}, estado-factura-${factura.id}, folio-fiscal-${factura.id} |  |
| componentes/panel-factura.tsx | 475 |  | ModoPanelFactura, PanelFactura |  |  | panel-factura, factura-mensaje, cerrar-panel-factura, select-entrega-factura, ${testidPrefijo}-subtotal, ${testidPrefijo}-iva, ${testidPrefijo}-total, ${testidPrefijo}-rfc, factura-error, confirmar-${testidPrefijo}-factura |  |
| servicios/errores-factura.ts | 28 |  | traducirErrorFactura |  |  |  |  |
| servicios/obtener-facturas.ts | 260 |  | FacturaCola, EntregaFacturable, ColaFacturas, obtenerColaFacturas, PreparacionFactura, prepararFacturaEntrega |  | facturas, ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar |  |  |
| tipos/indice.ts | 53 |  | ESTADOS_FACTURA, EstadoFactura, Factura, FilaFactura, filaAFactura |  |  |  |  |
| utilidades/indice.ts | 44 |  | ETIQUETA_ESTADO_FACTURA, FiltroEstadoFactura, filtrarFacturas, totalFacturado |  |  |  |  |
| validaciones/esquemas-facturacion.ts | 73 |  | esquemaDatosFactura, esquemaFacturaEntrega, esquemaCrearFactura, esquemaActualizarFactura, esquemaEmitirFactura, esquemaCancelarFactura, DatosFacturaInput, CrearFacturaInput |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/facturacion/loading.tsx
- src/app/(privado)/facturacion/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/facturacion/page.tsx <- cola-facturas, obtener-facturas

## RPC usadas por el módulo -> última migración que las define
- actualizar_factura_borrador: 20261007170001_sii_b8_facturacion.sql (1 definiciones)
- cancelar_factura: 20261007170001_sii_b8_facturacion.sql (1 definiciones)
- crear_factura_borrador: 20261007170001_sii_b8_facturacion.sql (1 definiciones)
- emitir_factura: 20261007230002_sii_credito_dias_cliente.sql (3 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)
- facturas: 20261007170001_sii_b8_facturacion.sql (1 migraciones)
- ordenes_produccion: 20261012130000_b5_obs5_orden_interna_sin_cliente.sql (9 migraciones)
- notas_entrega: 20261007230007_sii_b7_fecha_entrega_editable.sql (5 migraciones)
- clientes: 20261006300002_sii_b2_cliente_comercial_estado.sql (5 migraciones)
- cuentas_por_cobrar: 20261007170001_sii_b8_facturacion.sql (8 migraciones)

## Otras funciones SQL del dominio (nombre coincide con los términos) -> última migración
- activar_modo_preparacion: 20260813211519_fase_6_corregir_conflicto_cas.sql (2 definiciones)
- archivar_orden_al_entregar: 20261007230002_sii_credito_dias_cliente.sql (4 definiciones)
- capturar_costo_hora_sesion: 20260909224637_fase_9_gastos_base.sql (1 definiciones)
- cerrar_orden_administrativa: 20261007120002_sii_b5_orden_estados.sql (1 definiciones)
- confirmar_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- costo_ti_rango: 20261007120004_sii_b5_consumidores_estado.sql (2 definiciones)
- derivar_orden_completada: 20261007120005_sii_b5_derivaciones_definer.sql (2 definiciones)
- derivar_orden_en_produccion: 20261007120002_sii_b5_orden_estados.sql (1 definiciones)
- derivar_orden_planificada: 20261007120002_sii_b5_orden_estados.sql (1 definiciones)
- desactivar_contacto_cliente: 20261006300003_sii_b2_contactos_logicos.sql (1 definiciones)
- editar_costos_revision: 20261007110002_sii_b4_propuestas_acciones.sql (1 definiciones)
- impedir_cambio_historial_costos_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- metricas_ejecutivas_rango: 20261007120004_sii_b5_consumidores_estado.sql (3 definiciones)
- obtener_capacidad_efectiva_recurso_turno: 20260919000007_d02_capacidad_instalada.sql (2 definiciones)
- obtener_costo_ti_periodo: 20260921000003_obs29_desglose_ti_periodo.sql (1 definiciones)
- obtener_desglose_rentabilidad_orden: 20260923170507_a15_distribuir_estimado_por_tarifa.sql (2 definiciones)
- obtener_rentabilidad_orden: 20260922000003_a03_ingreso_neto_sin_iva.sql (4 definiciones)
- proponer_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- proteger_costo_material_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- reactivar_contacto_cliente: 20261006300003_sii_b2_contactos_logicos.sql (1 definiciones)
- reactivar_orden_op: 20261007120004_sii_b5_consumidores_estado.sql (2 definiciones)

## Pruebas relacionadas (241) — términos: facturacion, actualizar_factura_borrador, cancelar_factura, crear_factura_borrador, emitir_factura, facturas, ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, rentabilidad, costo, iva, orden_compra, tesoreria
- tests/e2e/aceptacion-comercial.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar
- tests/e2e/actividad.spec.ts — ordenes_produccion, clientes
- tests/e2e/archivos-cliente.spec.ts — clientes
- tests/e2e/cancelacion-financiera.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar
- tests/e2e/catalogos-base.spec.ts — costo, iva
- tests/e2e/clientes-contactos.spec.ts — clientes, iva
- tests/e2e/clientes-ficha.spec.ts — clientes, iva
- tests/e2e/clientes-historial.spec.ts — ordenes_produccion, clientes
- tests/e2e/cobranza-cobro-multiple.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/cobranza-ficha.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/cobranza-flujo.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/cobranza-folio-rp.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/comercial-realtime.spec.ts — clientes, iva
- tests/e2e/compras-flujo.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/continuidad-folios-rfq.spec.ts — iva
- tests/e2e/corridas-calidad.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/entregas-flujo.spec.ts — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- tests/e2e/facturacion-flujo.spec.ts — facturacion, facturas, ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar (+1)
- tests/e2e/gastos-a19.spec.ts — iva
- tests/e2e/gastos-rentabilidad-ti.spec.ts — ordenes_produccion, clientes, rentabilidad, costo, iva
- tests/e2e/gastos-rentabilidad.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, rentabilidad, costo, iva
- tests/e2e/kpis-dashboard.spec.ts — rentabilidad, iva
- tests/e2e/materiales-costos-c6-3.spec.ts — costo
- tests/e2e/operadores-gestion.spec.ts — iva
- tests/e2e/ordenes-edicion-borrador.spec.ts — ordenes_produccion, clientes
- tests/e2e/ordenes-estados-sii.spec.ts — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- tests/e2e/ordenes-flujo-completo.spec.ts — ordenes_produccion, clientes, costo, iva
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- tests/e2e/planeacion-bolsa-acciones.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/produccion-avance-procesos.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/produccion-piso.spec.ts — ordenes_produccion, notas_entrega, clientes, iva
- tests/e2e/propuestas-flujo.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar, costo, iva
- tests/e2e/rfq-flujo.spec.ts — clientes, iva
- tests/e2e/taller-taxonomia.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/tesoreria-flujo.spec.ts — iva, tesoreria
- tests/integracion/aislamiento-entorno.test.ts — clientes, iva
- tests/integracion/aprobacion-credito-identidad.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/ar-anulacion-consolidacion.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/ar-excepcion-concurrencia.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/ar-movimientos.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/archivos-sesion-rls.test.ts — ordenes_produccion, clientes, iva
- tests/integracion/areas-operador-concurrencia.test.ts — clientes
- tests/integracion/avance-proceso-concurrencia.test.ts — ordenes_produccion, clientes, iva
- tests/integracion/bitacora-rls.test.ts — iva
- tests/integracion/c2-3-documentos-orden.test.ts — ordenes_produccion, clientes
- tests/integracion/c3-1-items-revision-concurrencia.test.ts — clientes, iva
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — ordenes_produccion, clientes, costo, iva
- tests/integracion/cancelacion-cobro-concurrencia.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/clientes-folios-concurrencia.test.ts — clientes
- tests/integracion/clientes-promocion.test.ts — clientes
- tests/integracion/comentarios-acciones.test.ts — clientes
- tests/integracion/concurrencia-estricta.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, costo, iva
- tests/integracion/configuracion-acciones.test.ts — costo, iva
- tests/integracion/dashboard-acciones.test.ts — clientes, iva
- tests/integracion/gastos-acciones.test.ts — rentabilidad, iva
- tests/integracion/inventario-movimientos.test.ts — costo
- tests/integracion/materiales-costos-acciones.test.ts — costo, iva
- tests/integracion/orden-heredada.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/ordenes-acciones.test.ts — costo, iva
- tests/integracion/pipeline-promocion.test.ts — clientes, iva
- tests/integracion/produccion-sesiones.test.ts — iva
- tests/integracion/rbac-concurrencia.test.ts — iva
- tests/integracion/reactivar-orden.test.ts — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- tests/integracion/repetir-trabajo.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/integracion/usuario-inactivo-rls.test.ts — iva
- tests/unitarias/actividad-agrupacion.test.ts — clientes, tesoreria
- tests/unitarias/actividad-correlacion.test.ts — clientes
- tests/unitarias/actividad-filtros.test.ts — clientes
- tests/unitarias/actividad-paginacion-ui.test.ts — clientes
- tests/unitarias/autenticacion.test.ts — clientes
- tests/unitarias/bitacora-autorizacion.test.ts — iva
- tests/unitarias/bitacora-enlaces.test.ts — clientes
- tests/unitarias/catalogos-canales-accion.test.ts — iva
- tests/unitarias/catalogos-canales-servicio.test.ts — iva
- tests/unitarias/catalogos-canales-ui.test.ts — iva
- tests/unitarias/catalogos-utilidades.test.ts — iva
- tests/unitarias/clientes-alerta-credito.test.ts — clientes
- tests/unitarias/clientes-comercial.test.ts — clientes, iva
- tests/unitarias/clientes-contactos-logicos.test.ts — clientes, iva
- tests/unitarias/clientes-contactos-ui.test.ts — clientes, iva
- tests/unitarias/clientes-crear-accion.test.ts — clientes
- tests/unitarias/clientes-credito.test.ts — clientes, iva
- tests/unitarias/clientes-editar-contacto.test.ts — clientes
- tests/unitarias/clientes-filtros.test.ts — clientes
- tests/unitarias/clientes-historial.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/unitarias/clientes-panel-tier.test.ts — clientes
- tests/unitarias/clientes-tier.test.ts — clientes
- tests/unitarias/cobranza-aging.test.ts — iva
- tests/unitarias/cobranza-esquemas.test.ts — iva
- tests/unitarias/cobranza-estado-cuenta-ordenes.test.ts — iva
- tests/unitarias/cobranza-ficha.test.ts — iva
- tests/unitarias/cobranza-historial-servicio.test.ts — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- tests/unitarias/comentarios-menciones-correo.test.ts — clientes, iva
- tests/unitarias/comparativa-ordenes.test.ts — iva
- tests/unitarias/configuracion-catalogos.test.ts — clientes, iva
- tests/unitarias/configuracion-esquemas.test.ts — costo, iva
- tests/unitarias/configuracion-servicio.test.ts — costo, iva
- tests/unitarias/contactos-seguimiento.test.ts — clientes
- tests/unitarias/contexto-sesion-operador.test.ts — iva
- tests/unitarias/costeo-ruteo-c33.test.ts — costo, iva
- tests/unitarias/cotizador-calculo.test.ts — costo
- tests/unitarias/cotizador-formulario.test.ts — iva
- tests/unitarias/cotizador-snapshot.test.ts — costo
- tests/unitarias/cotizador-tarifas.test.ts — costo
- tests/unitarias/dashboard-esquemas.test.ts — iva
- tests/unitarias/dashboard-mappers.test.ts — costo, iva
- tests/unitarias/dashboard-tarjetas.test.ts — costo, iva
- tests/unitarias/entregas-esquemas.test.ts — iva
- tests/unitarias/entregas-folio.test.ts — iva
- tests/unitarias/facturacion-esquemas.test.ts — facturacion, facturas, iva
- tests/unitarias/ficha-orden-c4-2.test.ts — iva
- tests/unitarias/gastos-desglose.test.ts — rentabilidad, costo
- tests/unitarias/gastos-esquemas.test.ts — iva
- tests/unitarias/gastos-rentabilidad.test.ts — rentabilidad, costo, iva
- tests/unitarias/inventario-c6-3-acciones.test.ts — costo
- tests/unitarias/inventario-c6-3-pagina.test.ts — costo
- tests/unitarias/inventario-c6-3-panel.test.ts — costo
- tests/unitarias/inventario-esquemas.test.ts — costo, iva
- tests/unitarias/inventario-hooks.test.ts — costo
- tests/unitarias/inventario-servicios.test.ts — costo, iva
- tests/unitarias/inventario-ui.test.ts — costo
- tests/unitarias/kpis-areas.test.ts — rentabilidad
- tests/unitarias/materiales-catalogo-obs8.test.ts — costo, iva
- tests/unitarias/materiales-costos-esquemas.test.ts — costo, iva
- tests/unitarias/materiales-costos-servicio.test.ts — costo, iva
- tests/unitarias/materiales-costos-ui.test.ts — costo, iva
- tests/unitarias/monto-parsear.test.ts — costo
- tests/unitarias/navegacion-c6-3.test.ts — costo
- tests/unitarias/operadores-gestion-acciones.test.ts — iva
- tests/unitarias/orden-sii-servicio-c4-2.test.ts — iva
- tests/unitarias/ordenes-acciones.test.ts — iva
- tests/unitarias/ordenes-calculos.test.ts — costo
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts — costo, iva
- tests/unitarias/ordenes-documento.test.ts — iva
- tests/unitarias/ordenes-esquemas.test.ts — costo, iva
- tests/unitarias/ordenes-estado-sii.test.ts — iva
- tests/unitarias/ordenes-lotes-servicio.test.ts — ordenes_produccion, notas_entrega, cuentas_por_cobrar, iva
- tests/unitarias/ordenes-servicio.test.ts — ordenes_produccion, costo, iva
- tests/unitarias/permisos-confirmacion-refetch.test.ts — clientes, iva
- tests/unitarias/permisos-matriz.test.ts — clientes
- tests/unitarias/pipeline-alertas.test.ts — iva
- tests/unitarias/pipeline-cliente-acciones.test.ts — clientes, iva
- tests/unitarias/pipeline-cliente-rfq.test.ts — clientes
- tests/unitarias/pipeline-cotizacion-editor.test.ts — iva
- tests/unitarias/pipeline-cotizacion-esquemas.test.ts — costo, iva
- tests/unitarias/pipeline-datos-solicitud-esquema.test.ts — iva
- tests/unitarias/pipeline-filtros-resumen.test.ts — clientes, iva
- tests/unitarias/pipeline-selector-cliente.test.ts — clientes
- tests/unitarias/pipeline-totales.test.ts — iva
- tests/unitarias/planeacion-acciones.test.ts — iva
- tests/unitarias/planeacion-capacidad.test.ts — iva
- tests/unitarias/planeacion-componentes.test.ts — iva
- tests/unitarias/planeacion-esquemas.test.ts — costo, iva
- tests/unitarias/planeacion-realtime.test.ts — ordenes_produccion
- tests/unitarias/planeacion-servicio.test.ts — iva
- tests/unitarias/produccion-area-operadores.test.ts — costo, iva
- tests/unitarias/produccion-corridas.test.ts — iva
- tests/unitarias/produccion-esquemas.test.ts — costo, iva
- tests/unitarias/produccion-tablero.test.ts — iva
- tests/unitarias/produccion-tienda.test.ts — iva
- tests/unitarias/produccion-vista-admin.test.ts — iva
- tests/unitarias/propuestas-archivos-historial.test.ts — iva
- tests/unitarias/propuestas-costeo-fabricacion.test.ts — costo, iva
- tests/unitarias/propuestas-esquemas.test.ts — costo, iva
- tests/unitarias/propuestas-items-revision-ui.test.ts — costo, iva
- tests/unitarias/propuestas-items-revision.test.ts — iva
- tests/unitarias/propuestas-pdf.test.ts — costo, iva
- tests/unitarias/propuestas-totales.test.ts — costo, iva
- tests/unitarias/propuestas-validacion-contenido.test.ts — costo
- tests/unitarias/propuestas-validar-contenido-accion.test.ts — costo
- tests/unitarias/propuestas-validar-faltantes-ui.test.ts — costo, iva
- tests/unitarias/rfq-alta-modal.test.ts — clientes, iva
- tests/unitarias/rfq-cola-lista.test.ts — iva
- tests/unitarias/rfq-contacto-acciones.test.ts — clientes
- tests/unitarias/rfq-items.test.ts — iva
- tests/unitarias/sesion-operador.test.ts — iva
- tests/unitarias/tabla-ordenes-c4-3.test.ts — iva
- tests/unitarias/tarifa-estacion.test.ts — iva
- tests/unitarias/tarifas-c32.test.ts — iva
- tests/unitarias/tesoreria-esquemas.test.ts — tesoreria
- tests/unitarias/uso-tienda-ordenes.test.ts — iva
- supabase/tests/a02_cancelacion_ar.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a03_a04_ingreso_neto.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, rentabilidad, costo, iva
- supabase/tests/a05_a06_areas_operador.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a07_a09_publicacion_identidad.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a13_a14_credito_cliente.test.sql — clientes, cuentas_por_cobrar, iva
- supabase/tests/a15_estimado_por_tarifa.test.sql — ordenes_produccion, clientes, rentabilidad, costo
- supabase/tests/a16_plazo_credito.test.sql — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- supabase/tests/a17_operadores_pin.test.sql — iva
- supabase/tests/a19_gastos_edicion.test.sql — iva
- supabase/tests/a20_ar08_ar09_movimientos.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_ar16_cfg12.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_archivos_sesion_permisos.test.sql — iva
- supabase/tests/a20_ar_excepcion_entregada.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_cli08_repetir_trabajo.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_continuidad_folios.test.sql — iva
- supabase/tests/a20_factura_ar_existente.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_metas_proceso_partida.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a20_ord06_orden_heredada.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_prd09_avance_proceso.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a20_prd15_reactivar_orden.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/a20_reanudar_sesion_contextual.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a20_referencia_interna_ar.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar
- supabase/tests/b4_folio_desborde_check.test.sql — clientes
- supabase/tests/b4_obs2_flujo_versiones.test.sql — clientes
- supabase/tests/b5_obs5_orden_interna_sin_cliente.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/c2_1_rfq_versiones.test.sql — clientes, iva
- supabase/tests/c3_1_items_por_revision.test.sql — clientes, costo, iva
- supabase/tests/c3_1_linaje_documental_orden.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/c3_2_tarifas_grupo_recurso.test.sql — iva
- supabase/tests/c3_3_costeo_ruteo.test.sql — clientes, costo, iva
- supabase/tests/c4_1_aceptacion_orden_pendiente.test.sql — ordenes_produccion, clientes
- supabase/tests/c4_2_orden_comercial_operativa.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql — ordenes_produccion, costo, iva
- supabase/tests/c6_1_materiales_costos.test.sql — costo
- supabase/tests/c6_2_consumo_sin_stock.test.sql — ordenes_produccion, clientes, rentabilidad, costo
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — ordenes_produccion, clientes, costo
- supabase/tests/observaciones_catalogo_canales.test.sql — iva
- supabase/tests/sii_b1_actividad.test.sql — ordenes_produccion, clientes, tesoreria
- supabase/tests/sii_b1_auditoria_rbac.test.sql — iva
- supabase/tests/sii_b1_catalogos.test.sql — costo, iva
- supabase/tests/sii_b1_logs_append_only.test.sql — iva
- supabase/tests/sii_b1_permisos.test.sql — iva
- supabase/tests/sii_b1_storage_solo_servidor.test.sql — iva
- supabase/tests/sii_b2_clientes.test.sql — clientes, iva
- supabase/tests/sii_b3_continuidad_folios.test.sql — ordenes_produccion, iva
- supabase/tests/sii_b3_rfq_base.test.sql — clientes, iva
- supabase/tests/sii_b3_rfq_consumidores.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/sii_b4_propuestas.test.sql — clientes, costo, iva
- supabase/tests/sii_b4_propuestas_envio.test.sql — clientes, iva
- supabase/tests/sii_b5_orden.test.sql — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- supabase/tests/sii_b6_produccion.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/sii_b7_entregas.test.sql — ordenes_produccion, notas_entrega, clientes, cuentas_por_cobrar, iva
- supabase/tests/sii_b8_cobros_promesas.test.sql — facturas, ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/sii_b8_facturacion.test.sql — actualizar_factura_borrador, cancelar_factura, crear_factura_borrador, emitir_factura, facturas, ordenes_produccion (+4)
- supabase/tests/sii_b8_folio_recibo.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, iva
- supabase/tests/sii_b8_tesoreria.test.sql — iva, tesoreria
- supabase/tests/sii_b9_kpis.test.sql — ordenes_produccion, clientes, cuentas_por_cobrar, rentabilidad, costo
- supabase/tests/tarifario_unico_estacion.test.sql — iva