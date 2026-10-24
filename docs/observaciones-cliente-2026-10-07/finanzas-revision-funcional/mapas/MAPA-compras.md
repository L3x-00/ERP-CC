# Mapa estático del módulo «compras» (generado sin modelo el 2026-10-14T18:16:09.616Z)
Fuente: `src/modulos/compras` · 11 archivos · 1129 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/actualizar-compra.ts | 59 | sí | actualizarCompraAccion | actualizar_compra_borrador |  |  | autenticacion |
| acciones/cambiar-estado-compra.ts | 54 | sí | cambiarEstadoCompraAccion | cambiar_estado_compra |  |  | autenticacion |
| acciones/crear-compra.ts | 75 | sí | ResultadoCrearCompra, crearCompraAccion | crear_compra |  |  | autenticacion |
| acciones/obtener-cola-compras.ts | 33 | sí | obtenerColaComprasAccion |  |  |  | autenticacion |
| acciones/pagar-compra.ts | 79 | sí | ResultadoPagarCompra, pagarCompraAccion | pagar_compra |  |  | autenticacion |
| componentes/cola-compras.tsx | 195 |  | ColaCompras |  |  | cola-compras, filtro-estado-compra, filtro-texto-compra, actualizar-compras, nueva-compra, compras-vacio, tabla-compras, fila-compra-${compra.id}, estado-compra-${compra.id}, editar-compra-${compra.id} |  |
| componentes/panel-compra.tsx | 389 |  | ModoPanelCompra, PanelCompra |  |  | panel-compra, compra-mensaje, cerrar-panel-compra, compra-proveedor, compra-orden, compra-subtotal, compra-iva, compra-moneda, compra-tipo-cambio, compra-vencimiento |  |
| servicios/errores-compra.ts | 19 |  | traducirErrorCompra |  |  |  |  |
| servicios/obtener-compras.ts | 98 |  | ColaCompras, obtenerColaCompras, PagoCompra, obtenerPagosCompra |  | compras, proveedores, ordenes_produccion, pagos_compra |  |  |
| tipos/indice.ts | 66 |  | ESTADOS_COMPRA, EstadoCompra, Compra, CompraCola, ProveedorOpcion, OrdenOpcion, ETIQUETA_ESTADO_COMPRA, filaACompra |  |  |  |  |
| validaciones/esquemas-compras.ts | 62 |  | esquemaDatosCompra, esquemaCrearCompra, esquemaActualizarCompra, esquemaEstadoCompra, esquemaPagarCompra, DatosCompraInput, CrearCompraInput, ActualizarCompraInput |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/compras/loading.tsx
- src/app/(privado)/compras/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/compras/page.tsx <- cola-compras, obtener-compras

## RPC usadas por el módulo -> última migración que las define
- actualizar_compra_borrador: 20261007190002_sii_b8_compras_motores.sql (1 definiciones)
- cambiar_estado_compra: 20261007190002_sii_b8_compras_motores.sql (1 definiciones)
- crear_compra: 20261007190002_sii_b8_compras_motores.sql (1 definiciones)
- pagar_compra: 20261007190002_sii_b8_compras_motores.sql (1 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)
- compras: 20261007190001_sii_b8_compras_base.sql (1 migraciones)
- proveedores: 20260707000002_crear_inventario.sql (1 migraciones)
- ordenes_produccion: 20261012130000_b5_obs5_orden_interna_sin_cliente.sql (9 migraciones)
- pagos_compra: 20261007190001_sii_b8_compras_base.sql (1 migraciones)

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

## Pruebas relacionadas (221) — términos: compras, actualizar_compra_borrador, cambiar_estado_compra, crear_compra, pagar_compra, proveedores, ordenes_produccion, pagos_compra, rentabilidad, costo, iva, orden_compra, tesoreria, cuentas_por_cobrar, facturas
- tests/e2e/aceptacion-comercial.spec.ts — ordenes_produccion, cuentas_por_cobrar
- tests/e2e/actividad.spec.ts — ordenes_produccion
- tests/e2e/cancelacion-financiera.spec.ts — ordenes_produccion, cuentas_por_cobrar
- tests/e2e/catalogos-base.spec.ts — costo, iva
- tests/e2e/clientes-contactos.spec.ts — compras, iva
- tests/e2e/clientes-ficha.spec.ts — compras, iva
- tests/e2e/clientes-historial.spec.ts — ordenes_produccion
- tests/e2e/cobranza-cobro-multiple.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/cobranza-ficha.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/cobranza-flujo.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/cobranza-folio-rp.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/comercial-realtime.spec.ts — iva
- tests/e2e/compras-flujo.spec.ts — compras, proveedores, ordenes_produccion, pagos_compra, iva
- tests/e2e/continuidad-folios-rfq.spec.ts — iva
- tests/e2e/corridas-calidad.spec.ts — ordenes_produccion, iva
- tests/e2e/entregas-flujo.spec.ts — compras, ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/facturacion-flujo.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar, facturas
- tests/e2e/gastos-a19.spec.ts — proveedores, iva
- tests/e2e/gastos-rentabilidad-ti.spec.ts — ordenes_produccion, rentabilidad, costo, iva
- tests/e2e/gastos-rentabilidad.spec.ts — proveedores, ordenes_produccion, rentabilidad, costo, iva, cuentas_por_cobrar
- tests/e2e/kpis-dashboard.spec.ts — rentabilidad, iva
- tests/e2e/materiales-costos-c6-3.spec.ts — costo
- tests/e2e/operadores-gestion.spec.ts — iva
- tests/e2e/ordenes-edicion-borrador.spec.ts — ordenes_produccion
- tests/e2e/ordenes-estados-sii.spec.ts — compras, ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/ordenes-flujo-completo.spec.ts — ordenes_produccion, costo, iva
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/planeacion-bolsa-acciones.spec.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — ordenes_produccion, iva
- tests/e2e/produccion-avance-procesos.spec.ts — ordenes_produccion, iva
- tests/e2e/produccion-piso.spec.ts — ordenes_produccion, iva
- tests/e2e/propuestas-flujo.spec.ts — compras, ordenes_produccion, costo, iva, cuentas_por_cobrar
- tests/e2e/rfq-flujo.spec.ts — iva
- tests/e2e/taller-taxonomia.spec.ts — ordenes_produccion, iva
- tests/e2e/tesoreria-flujo.spec.ts — iva, tesoreria
- tests/integracion/aislamiento-entorno.test.ts — iva
- tests/integracion/aprobacion-credito-identidad.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/ar-anulacion-consolidacion.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/ar-excepcion-concurrencia.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/ar-movimientos.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/archivos-sesion-rls.test.ts — ordenes_produccion, iva
- tests/integracion/avance-proceso-concurrencia.test.ts — ordenes_produccion, iva
- tests/integracion/bitacora-rls.test.ts — iva
- tests/integracion/c2-3-documentos-orden.test.ts — ordenes_produccion
- tests/integracion/c3-1-items-revision-concurrencia.test.ts — iva
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — ordenes_produccion, costo, iva
- tests/integracion/cancelacion-cobro-concurrencia.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/concurrencia-estricta.test.ts — ordenes_produccion, costo, iva, cuentas_por_cobrar
- tests/integracion/configuracion-acciones.test.ts — costo, iva
- tests/integracion/dashboard-acciones.test.ts — iva
- tests/integracion/gastos-acciones.test.ts — rentabilidad, iva
- tests/integracion/inventario-movimientos.test.ts — costo
- tests/integracion/materiales-costos-acciones.test.ts — costo, iva
- tests/integracion/orden-heredada.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/ordenes-acciones.test.ts — costo, iva
- tests/integracion/pipeline-promocion.test.ts — iva
- tests/integracion/produccion-sesiones.test.ts — iva
- tests/integracion/rbac-concurrencia.test.ts — iva
- tests/integracion/reactivar-orden.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/repetir-trabajo.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/integracion/usuario-inactivo-rls.test.ts — iva
- tests/unitarias/actividad-agrupacion.test.ts — tesoreria
- tests/unitarias/bitacora-autorizacion.test.ts — iva
- tests/unitarias/catalogos-canales-accion.test.ts — iva
- tests/unitarias/catalogos-canales-servicio.test.ts — iva
- tests/unitarias/catalogos-canales-ui.test.ts — iva
- tests/unitarias/catalogos-utilidades.test.ts — iva
- tests/unitarias/clientes-comercial.test.ts — iva
- tests/unitarias/clientes-contactos-logicos.test.ts — compras, iva
- tests/unitarias/clientes-contactos-ui.test.ts — iva
- tests/unitarias/clientes-credito.test.ts — iva
- tests/unitarias/clientes-historial.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/unitarias/cobranza-aging.test.ts — iva
- tests/unitarias/cobranza-esquemas.test.ts — iva
- tests/unitarias/cobranza-estado-cuenta-ordenes.test.ts — iva
- tests/unitarias/cobranza-ficha.test.ts — iva
- tests/unitarias/cobranza-historial-servicio.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/unitarias/comentarios-menciones-correo.test.ts — iva
- tests/unitarias/comparativa-ordenes.test.ts — iva
- tests/unitarias/compras-esquemas.test.ts — compras
- tests/unitarias/configuracion-catalogos.test.ts — iva
- tests/unitarias/configuracion-esquemas.test.ts — costo, iva
- tests/unitarias/configuracion-servicio.test.ts — costo, iva
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
- tests/unitarias/facturacion-esquemas.test.ts — iva, facturas
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
- tests/unitarias/ordenes-lotes-servicio.test.ts — ordenes_produccion, iva, cuentas_por_cobrar
- tests/unitarias/ordenes-servicio.test.ts — ordenes_produccion, costo, iva
- tests/unitarias/permisos-confirmacion-refetch.test.ts — iva
- tests/unitarias/pipeline-alertas.test.ts — iva
- tests/unitarias/pipeline-cliente-acciones.test.ts — iva
- tests/unitarias/pipeline-cotizacion-editor.test.ts — iva
- tests/unitarias/pipeline-cotizacion-esquemas.test.ts — costo, iva
- tests/unitarias/pipeline-datos-solicitud-esquema.test.ts — iva
- tests/unitarias/pipeline-filtros-resumen.test.ts — iva
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
- tests/unitarias/propuestas-esquemas.test.ts — compras, costo, iva
- tests/unitarias/propuestas-items-revision-ui.test.ts — costo, iva
- tests/unitarias/propuestas-items-revision.test.ts — iva
- tests/unitarias/propuestas-pdf.test.ts — compras, costo, iva
- tests/unitarias/propuestas-totales.test.ts — costo, iva
- tests/unitarias/propuestas-validacion-contenido.test.ts — costo
- tests/unitarias/propuestas-validar-contenido-accion.test.ts — costo
- tests/unitarias/propuestas-validar-faltantes-ui.test.ts — costo, iva
- tests/unitarias/rfq-alta-modal.test.ts — iva
- tests/unitarias/rfq-cola-lista.test.ts — iva
- tests/unitarias/rfq-items.test.ts — iva
- tests/unitarias/sesion-operador.test.ts — iva
- tests/unitarias/tabla-ordenes-c4-3.test.ts — iva
- tests/unitarias/tarifa-estacion.test.ts — iva
- tests/unitarias/tarifas-c32.test.ts — iva
- tests/unitarias/tesoreria-esquemas.test.ts — tesoreria
- tests/unitarias/uso-tienda-ordenes.test.ts — iva
- supabase/tests/a02_cancelacion_ar.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a03_a04_ingreso_neto.test.sql — ordenes_produccion, rentabilidad, costo, iva, cuentas_por_cobrar
- supabase/tests/a05_a06_areas_operador.test.sql — ordenes_produccion, iva
- supabase/tests/a07_a09_publicacion_identidad.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a13_a14_credito_cliente.test.sql — iva, cuentas_por_cobrar
- supabase/tests/a15_estimado_por_tarifa.test.sql — ordenes_produccion, rentabilidad, costo
- supabase/tests/a16_plazo_credito.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a17_operadores_pin.test.sql — iva
- supabase/tests/a19_gastos_edicion.test.sql — iva
- supabase/tests/a20_ar08_ar09_movimientos.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_ar16_cfg12.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_archivos_sesion_permisos.test.sql — iva
- supabase/tests/a20_ar_excepcion_entregada.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_cli08_repetir_trabajo.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_continuidad_folios.test.sql — iva
- supabase/tests/a20_factura_ar_existente.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_metas_proceso_partida.test.sql — ordenes_produccion, iva
- supabase/tests/a20_ord06_orden_heredada.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_prd09_avance_proceso.test.sql — ordenes_produccion, iva
- supabase/tests/a20_prd15_reactivar_orden.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/a20_reanudar_sesion_contextual.test.sql — ordenes_produccion, iva
- supabase/tests/a20_referencia_interna_ar.test.sql — ordenes_produccion, cuentas_por_cobrar
- supabase/tests/b4_obs2_flujo_versiones.test.sql — compras
- supabase/tests/b5_obs5_orden_interna_sin_cliente.test.sql — ordenes_produccion, iva
- supabase/tests/c2_1_rfq_versiones.test.sql — iva
- supabase/tests/c3_1_items_por_revision.test.sql — costo, iva
- supabase/tests/c3_1_linaje_documental_orden.test.sql — ordenes_produccion, iva
- supabase/tests/c3_2_tarifas_grupo_recurso.test.sql — iva
- supabase/tests/c3_3_costeo_ruteo.test.sql — costo, iva
- supabase/tests/c4_1_aceptacion_orden_pendiente.test.sql — ordenes_produccion
- supabase/tests/c4_2_orden_comercial_operativa.test.sql — ordenes_produccion, iva
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql — ordenes_produccion, costo, iva
- supabase/tests/c6_1_materiales_costos.test.sql — costo
- supabase/tests/c6_2_consumo_sin_stock.test.sql — ordenes_produccion, rentabilidad, costo
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — ordenes_produccion, costo
- supabase/tests/observaciones_catalogo_canales.test.sql — iva
- supabase/tests/sii_b1_actividad.test.sql — ordenes_produccion, tesoreria
- supabase/tests/sii_b1_auditoria_rbac.test.sql — iva
- supabase/tests/sii_b1_catalogos.test.sql — costo, iva
- supabase/tests/sii_b1_logs_append_only.test.sql — iva
- supabase/tests/sii_b1_permisos.test.sql — iva
- supabase/tests/sii_b1_storage_solo_servidor.test.sql — iva
- supabase/tests/sii_b2_clientes.test.sql — compras, iva
- supabase/tests/sii_b3_continuidad_folios.test.sql — ordenes_produccion, iva
- supabase/tests/sii_b3_rfq_base.test.sql — iva
- supabase/tests/sii_b3_rfq_consumidores.test.sql — ordenes_produccion, iva
- supabase/tests/sii_b4_propuestas.test.sql — compras, costo, iva
- supabase/tests/sii_b4_propuestas_envio.test.sql — compras, iva
- supabase/tests/sii_b5_orden.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/sii_b6_produccion.test.sql — ordenes_produccion, iva
- supabase/tests/sii_b7_entregas.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/sii_b8_cobros_promesas.test.sql — ordenes_produccion, iva, cuentas_por_cobrar, facturas
- supabase/tests/sii_b8_compras.test.sql — compras, actualizar_compra_borrador, cambiar_estado_compra, crear_compra, pagar_compra, proveedores (+1)
- supabase/tests/sii_b8_facturacion.test.sql — ordenes_produccion, iva, cuentas_por_cobrar, facturas
- supabase/tests/sii_b8_folio_recibo.test.sql — ordenes_produccion, iva, cuentas_por_cobrar
- supabase/tests/sii_b8_tesoreria.test.sql — compras, proveedores, pagos_compra, iva, tesoreria
- supabase/tests/sii_b9_kpis.test.sql — ordenes_produccion, rentabilidad, costo, cuentas_por_cobrar
- supabase/tests/tarifario_unico_estacion.test.sql — iva