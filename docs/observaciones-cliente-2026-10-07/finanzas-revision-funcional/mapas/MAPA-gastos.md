# Mapa estático del módulo «gastos» (generado sin modelo el 2026-10-14T18:16:10.987Z)
Fuente: `src/modulos/gastos` · 29 archivos · 3036 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/cambiar-estado-gasto.ts | 48 | sí | cambiarEstadoGastoAccion |  |  |  | autenticacion |
| acciones/descartar-subida-comprobante.ts | 30 | sí | descartarSubidaComprobanteGastoAccion |  | gastos, comprobantes_gasto_historial |  | autenticacion |
| acciones/guardar-gasto-a19.ts | 106 | sí | guardarGastoA19Accion | registrar_gasto_a19, editar_gasto_a19 | gastos |  | autenticacion, configuracion |
| acciones/indice.ts | 12 |  |  |  |  |  |  |
| acciones/obtener-cuentas-gasto.ts | 48 | sí | CuentaGastoOpcion, obtenerCuentasGastoAccion |  | cuentas_bancarias |  | autenticacion |
| acciones/obtener-desglose-rentabilidad.ts | 42 | sí | obtenerDesgloseRentabilidadOrdenAccion |  |  |  | autenticacion |
| acciones/obtener-gastos.ts | 34 | sí | obtenerGastosAccion |  |  |  | autenticacion |
| acciones/obtener-ordenes-gasto.ts | 101 | sí | OrdenGastoOpcion, obtenerOrdenesGastoAccion |  | ordenes_produccion, clientes |  | autenticacion |
| acciones/obtener-proveedores-gasto.ts | 21 | sí | ProveedorGastoOpcion, obtenerProveedoresGastoAccion |  | proveedores |  | autenticacion |
| acciones/obtener-rentabilidad-orden.ts | 37 | sí | obtenerRentabilidadOrdenAccion |  |  |  | autenticacion |
| acciones/obtener-url-comprobante.ts | 38 | sí | obtenerUrlComprobanteGastoAccion |  | gastos |  | autenticacion |
| acciones/preparar-subida-comprobante.ts | 47 | sí | prepararSubidaComprobanteGastoAccion |  | gastos |  | autenticacion |
| acciones/procesar-comprobante-ocr.ts | 68 | sí | procesarComprobanteOcrAccion |  |  |  | autenticacion |
| acciones/registrar-gasto.ts | 57 | sí | registrarGastoAccion |  |  |  | autenticacion, configuracion |
| componentes/claves-consulta.ts | 3 |  | CLAVE_GASTOS, CLAVE_RENTABILIDAD_GASTOS |  |  |  |  |
| componentes/indice.ts | 6 |  |  |  |  |  |  |
| componentes/modal-registrar-gasto.tsx | 316 |  | ModalRegistrarGastoProps, ModalRegistrarGasto |  |  | gasto-orden-busqueda, gasto-orden | configuracion |
| componentes/operacion-gastos.tsx | 342 |  | OperacionGastos |  |  |  | configuracion |
| componentes/sincronizador-gastos-realtime.tsx | 77 |  | SincronizadorGastosRealtime |  |  | sincronizador-gastos |  |
| componentes/tabla-gastos.tsx | 108 |  | TablaGastosProps, TablaGastos |  |  |  |  |
| componentes/tarjeta-rentabilidad-orden.tsx | 270 |  | TarjetaRentabilidadOrden |  |  | desglose-rentabilidad, desglose-incluidos, tarjeta-rentabilidad-ti, rentabilidad-ti-costo, rentabilidad-venta-neta, rentabilidad-utilidad, rentabilidad-sin-desglose |  |
| servicios/gastos-servicio.ts | 272 |  | CodigoErrorGastos, ErrorGastos, registrarGastoServicio, cambiarEstadoGastoServicio, consultarGastosServicio, obtenerRentabilidadOrdenServicio, mapearDesgloseRentabilidad, obtenerDesgloseRentabilidadServicio | registrar_gasto_a19, cambiar_estado_gasto, obtener_rentabilidad_orden, obtener_desglose_rentabilidad_orden | gastos, ordenes_produccion |  |  |
| servicios/indice.ts | 41 |  |  |  |  |  |  |
| servicios/ocr-servicio.ts | 147 |  | CodigoErrorOcr, ErrorOcr, OpcionesOcr, calcularBytesBase64, extraerObjetoJson, extraerDatosComprobante |  |  |  |  |
| servicios/rentabilidad-servicio.ts | 238 |  | MONEDA_RENTABILIDAD, EntradaIngresoOrden, EntradaMaterialConsumido, EntradaSesionRentabilidad, EntradaRentabilidadOrden, convertirAMxn, calcularIngresoMxn, calcularIngresoNetoMxn |  |  |  |  |
| tipos/gastos.ts | 259 |  | MONEDAS_GASTO, CATEGORIAS_GASTO, FORMATO_CATEGORIA_GASTO, ESTADOS_GASTO, METODOS_PAGO_GASTO, MonedaGasto, CategoriaGasto, EstadoGasto |  |  |  |  |
| tipos/indice.ts | 28 |  |  |  |  |  |  |
| validaciones/gastos.ts | 218 |  | esquemaGuardarGastoA19, esquemaRegistrarGasto, esquemaCambiarEstadoGasto, esquemaConsultarGastos, esquemaConsultarRentabilidadOrden, esquemaBuscarOrdenesGasto, esquemaComprobanteOCR, esquemaDatosComprobanteOCR |  |  |  |  |
| validaciones/indice.ts | 22 |  |  |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/gastos/loading.tsx
- src/app/(privado)/gastos/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/gastos/page.tsx <- indice
### configuracion
- src/modulos/configuracion/hooks/usar-catalogos-comerciales.ts <- gastos
- src/modulos/configuracion/tipos/configuracion.ts <- gastos
- src/modulos/configuracion/validaciones/configuracion.ts <- gastos
### otros
- src/estado/uso-tienda-gastos.ts <- indice

## RPC usadas por el módulo -> última migración que las define
- registrar_gasto_a19: 20260923235400_a19_gastos_edicion_comprobantes.sql (1 definiciones)
- editar_gasto_a19: 20260923235400_a19_gastos_edicion_comprobantes.sql (1 definiciones)
- cambiar_estado_gasto: 20260909224643_fase_9_rpc_gastos.sql (1 definiciones)
- obtener_rentabilidad_orden: 20260922000003_a03_ingreso_neto_sin_iva.sql (4 definiciones)
- obtener_desglose_rentabilidad_orden: 20260923170507_a15_distribuir_estimado_por_tarifa.sql (2 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)
- gastos: 20261007190001_sii_b8_compras_base.sql (5 migraciones)
- comprobantes_gasto_historial: 20260923235400_a19_gastos_edicion_comprobantes.sql (1 migraciones)
- cuentas_bancarias: 20261007200001_sii_b8_tesoreria_base.sql (2 migraciones)
- ordenes_produccion: 20261012130000_b5_obs5_orden_interna_sin_cliente.sql (9 migraciones)
- clientes: 20261006300002_sii_b2_cliente_comercial_estado.sql (5 migraciones)
- proveedores: 20260707000002_crear_inventario.sql (1 migraciones)

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
- proponer_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- proteger_costo_material_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- reactivar_contacto_cliente: 20261006300003_sii_b2_contactos_logicos.sql (1 definiciones)
- reactivar_orden_op: 20261007120004_sii_b5_consumidores_estado.sql (2 definiciones)

## Pruebas relacionadas (245) — términos: gastos, registrar_gasto_a19, editar_gasto_a19, cambiar_estado_gasto, obtener_rentabilidad_orden, obtener_desglose_rentabilidad_orden, comprobantes_gasto_historial, cuentas_bancarias, ordenes_produccion, clientes, proveedores, rentabilidad, costo, iva, orden_compra, tesoreria, cuentas_por_cobrar, facturas
- tests/e2e/aceptacion-comercial.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar
- tests/e2e/actividad.spec.ts — ordenes_produccion, clientes
- tests/e2e/archivos-cliente.spec.ts — clientes
- tests/e2e/cancelacion-financiera.spec.ts — ordenes_produccion, clientes, cuentas_por_cobrar
- tests/e2e/catalogos-base.spec.ts — costo, iva
- tests/e2e/catalogos-comerciales.spec.ts — gastos
- tests/e2e/clientes-contactos.spec.ts — clientes, iva
- tests/e2e/clientes-ficha.spec.ts — clientes, iva
- tests/e2e/clientes-historial.spec.ts — ordenes_produccion, clientes
- tests/e2e/cobranza-cobro-multiple.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/cobranza-ficha.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/cobranza-flujo.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/cobranza-folio-rp.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/comercial-realtime.spec.ts — clientes, iva
- tests/e2e/compras-flujo.spec.ts — ordenes_produccion, clientes, proveedores, iva
- tests/e2e/continuidad-folios-rfq.spec.ts — iva
- tests/e2e/corridas-calidad.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/entregas-flujo.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/facturacion-flujo.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar, facturas
- tests/e2e/gastos-a19.spec.ts — gastos, comprobantes_gasto_historial, proveedores, iva
- tests/e2e/gastos-ocr.spec.ts — gastos
- tests/e2e/gastos-rentabilidad-ti.spec.ts — gastos, obtener_rentabilidad_orden, ordenes_produccion, clientes, rentabilidad, costo (+1)
- tests/e2e/gastos-rentabilidad.spec.ts — gastos, cambiar_estado_gasto, obtener_rentabilidad_orden, ordenes_produccion, clientes, proveedores (+4)
- tests/e2e/kpis-dashboard.spec.ts — rentabilidad, iva
- tests/e2e/materiales-costos-c6-3.spec.ts — costo
- tests/e2e/operadores-gestion.spec.ts — iva
- tests/e2e/ordenes-edicion-borrador.spec.ts — ordenes_produccion, clientes
- tests/e2e/ordenes-estados-sii.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/ordenes-flujo-completo.spec.ts — ordenes_produccion, clientes, costo, iva
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/planeacion-bolsa-acciones.spec.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/produccion-avance-procesos.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/produccion-piso.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/propuestas-flujo.spec.ts — gastos, ordenes_produccion, clientes, costo, iva, cuentas_por_cobrar
- tests/e2e/rfq-flujo.spec.ts — clientes, iva
- tests/e2e/taller-taxonomia.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/tesoreria-flujo.spec.ts — cuentas_bancarias, iva, tesoreria
- tests/integracion/aislamiento-entorno.test.ts — clientes, iva
- tests/integracion/aprobacion-credito-identidad.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/ar-anulacion-consolidacion.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/ar-excepcion-concurrencia.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/ar-movimientos.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/archivos-sesion-rls.test.ts — ordenes_produccion, clientes, iva
- tests/integracion/areas-operador-concurrencia.test.ts — clientes
- tests/integracion/avance-proceso-concurrencia.test.ts — ordenes_produccion, clientes, iva
- tests/integracion/bitacora-rls.test.ts — iva
- tests/integracion/c2-3-documentos-orden.test.ts — ordenes_produccion, clientes
- tests/integracion/c3-1-items-revision-concurrencia.test.ts — clientes, iva
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — ordenes_produccion, clientes, costo, iva
- tests/integracion/cancelacion-cobro-concurrencia.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/clientes-folios-concurrencia.test.ts — clientes
- tests/integracion/clientes-promocion.test.ts — clientes
- tests/integracion/comentarios-acciones.test.ts — clientes
- tests/integracion/concurrencia-estricta.test.ts — ordenes_produccion, clientes, costo, iva, cuentas_por_cobrar
- tests/integracion/configuracion-acciones.test.ts — costo, iva
- tests/integracion/dashboard-acciones.test.ts — clientes, iva
- tests/integracion/gastos-acciones.test.ts — gastos, cambiar_estado_gasto, rentabilidad, iva
- tests/integracion/inventario-movimientos.test.ts — costo
- tests/integracion/materiales-costos-acciones.test.ts — costo, iva
- tests/integracion/orden-heredada.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/ordenes-acciones.test.ts — costo, iva
- tests/integracion/pipeline-promocion.test.ts — clientes, iva
- tests/integracion/produccion-sesiones.test.ts — iva
- tests/integracion/rbac-concurrencia.test.ts — iva
- tests/integracion/reactivar-orden.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/integracion/repetir-trabajo.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
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
- tests/unitarias/clientes-historial.test.ts — gastos, ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/unitarias/clientes-panel-tier.test.ts — clientes
- tests/unitarias/clientes-tier.test.ts — clientes
- tests/unitarias/cobranza-aging.test.ts — iva
- tests/unitarias/cobranza-esquemas.test.ts — iva
- tests/unitarias/cobranza-estado-cuenta-ordenes.test.ts — iva
- tests/unitarias/cobranza-ficha.test.ts — iva
- tests/unitarias/cobranza-historial-servicio.test.ts — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- tests/unitarias/comentarios-menciones-correo.test.ts — clientes, iva
- tests/unitarias/comparativa-ordenes.test.ts — iva
- tests/unitarias/configuracion-catalogos.test.ts — gastos, clientes, iva
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
- tests/unitarias/dashboard-mappers.test.ts — gastos, costo, iva
- tests/unitarias/dashboard-tarjetas.test.ts — gastos, costo, iva
- tests/unitarias/entregas-esquemas.test.ts — iva
- tests/unitarias/entregas-folio.test.ts — iva
- tests/unitarias/facturacion-esquemas.test.ts — iva, facturas
- tests/unitarias/ficha-orden-c4-2.test.ts — iva
- tests/unitarias/gastos-desglose.test.ts — gastos, rentabilidad, costo
- tests/unitarias/gastos-esquemas.test.ts — gastos, iva
- tests/unitarias/gastos-ocr.test.ts — gastos
- tests/unitarias/gastos-rentabilidad.test.ts — gastos, rentabilidad, costo, iva
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
- tests/unitarias/propuestas-costeo-fabricacion.test.ts — gastos, costo, iva
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
- supabase/tests/a02_cancelacion_ar.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a03_a04_ingreso_neto.test.sql — gastos, obtener_rentabilidad_orden, ordenes_produccion, clientes, rentabilidad, costo (+2)
- supabase/tests/a05_a06_areas_operador.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a07_a09_publicacion_identidad.test.sql — gastos, cuentas_bancarias, ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a13_a14_credito_cliente.test.sql — clientes, iva, cuentas_por_cobrar
- supabase/tests/a15_estimado_por_tarifa.test.sql — obtener_desglose_rentabilidad_orden, ordenes_produccion, clientes, rentabilidad, costo
- supabase/tests/a16_plazo_credito.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a17_operadores_pin.test.sql — iva
- supabase/tests/a19_gastos_edicion.test.sql — gastos, registrar_gasto_a19, editar_gasto_a19, comprobantes_gasto_historial, iva
- supabase/tests/a20_ar08_ar09_movimientos.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_ar16_cfg12.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_archivos_sesion_permisos.test.sql — iva
- supabase/tests/a20_ar_excepcion_entregada.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_cli08_repetir_trabajo.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_continuidad_folios.test.sql — iva
- supabase/tests/a20_factura_ar_existente.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_metas_proceso_partida.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a20_ord06_orden_heredada.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/a20_prd09_avance_proceso.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/a20_prd15_reactivar_orden.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
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
- supabase/tests/c6_2_consumo_sin_stock.test.sql — obtener_rentabilidad_orden, ordenes_produccion, clientes, rentabilidad, costo
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — ordenes_produccion, clientes, costo
- supabase/tests/observaciones_catalogo_canales.test.sql — iva
- supabase/tests/sii_b1_actividad.test.sql — cuentas_bancarias, ordenes_produccion, clientes, tesoreria
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
- supabase/tests/sii_b5_orden.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/sii_b6_produccion.test.sql — ordenes_produccion, clientes, iva
- supabase/tests/sii_b7_entregas.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/sii_b8_cobros_promesas.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar, facturas
- supabase/tests/sii_b8_compras.test.sql — gastos, proveedores
- supabase/tests/sii_b8_facturacion.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar, facturas
- supabase/tests/sii_b8_folio_recibo.test.sql — ordenes_produccion, clientes, iva, cuentas_por_cobrar
- supabase/tests/sii_b8_tesoreria.test.sql — gastos, cuentas_bancarias, proveedores, iva, tesoreria
- supabase/tests/sii_b9_kpis.test.sql — ordenes_produccion, clientes, rentabilidad, costo, cuentas_por_cobrar
- supabase/tests/tarifario_unico_estacion.test.sql — iva