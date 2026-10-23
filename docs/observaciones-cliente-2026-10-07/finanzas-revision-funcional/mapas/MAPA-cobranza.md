# Mapa estático del módulo «cobranza» (generado sin modelo el 2026-10-14T18:16:08.815Z)
Fuente: `src/modulos/cobranza` · 48 archivos · 5591 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/abrir-cuenta-por-cobrar.ts | 52 | sí | abrirCuentaPorCobrarAccion |  |  |  | autenticacion |
| acciones/anular-cuenta.ts | 41 | sí | anularCuentaAccion |  |  |  | autenticacion |
| acciones/aplicar-saldo-favor.ts | 50 | sí | aplicarSaldoFavorAccion |  |  |  | autenticacion |
| acciones/cancelar-promesa.ts | 52 | sí | cancelarPromesaPagoAccion | cancelar_promesa_pago |  |  | autenticacion |
| acciones/consolidar-ar.ts | 63 | sí | previsualizarConsolidacionAccion, consolidarArFaltantesAccion |  |  |  | autenticacion |
| acciones/consultar-historial.ts | 40 | sí | obtenerHistorialCuentaAccion, obtenerDetalleOrdenCobranzaAccion, obtenerReciboPagoAccion, obtenerCuentasBancariasAccion |  |  |  | autenticacion |
| acciones/crear-promesa.ts | 76 | sí | ResultadoPromesa, crearPromesaPagoAccion | crear_promesa_pago |  |  | autenticacion |
| acciones/indice.ts | 11 |  |  |  |  |  |  |
| acciones/obtener-cobro-multiple.ts | 39 | sí | DatosCobroMultiple, obtenerCobroMultipleAccion |  |  |  | autenticacion |
| acciones/obtener-flujo-cuentas.ts | 33 | sí | obtenerFlujoCuentasAccion |  |  |  | autenticacion |
| acciones/obtener-ordenes-sin-ar.ts | 112 | sí | OrdenSinAr, obtenerOrdenesSinArAccion |  | ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, configuracion_sistema, cotizacion_lineas |  | autenticacion, pipeline |
| acciones/obtener-promesa-cuenta.ts | 40 | sí | obtenerPromesaCuentaAccion |  |  |  | autenticacion |
| acciones/obtener-resumen-cartera.ts | 37 | sí | obtenerResumenCarteraAccion |  |  |  | autenticacion |
| acciones/registrar-abono-heredado.ts | 41 | sí | registrarAbonoHeredadoAccion |  |  |  | autenticacion |
| acciones/registrar-cobro-multiple.ts | 101 | sí | ResultadoCobroMultiple, registrarCobroMultipleAccion | registrar_cobro_multiple |  |  | autenticacion |
| acciones/registrar-factura.ts | 50 | sí | registrarFacturaArAccion | registrar_factura_ar |  |  | autenticacion |
| acciones/registrar-pago.ts | 49 | sí | registrarPagoAccion |  |  |  | autenticacion |
| acciones/reversar-pago.ts | 40 | sí | reversarPagoAccion |  |  |  | autenticacion |
| componentes/claves-consulta.ts | 2 |  | CLAVE_CARTERA_COBRANZA |  |  |  |  |
| componentes/estado-cuenta-cliente-boton.tsx | 401 |  | EstadoCuentaClienteBoton |  | clientes, cuentas_por_cobrar, ordenes_produccion, cotizacion_lineas | estado-cuenta-${clienteId} |  |
| componentes/historial-cuenta.tsx | 250 |  | ReciboPagoConsulta, DetalleOrdenCobranza, HistorialCuenta |  |  | ficha-cuenta, abono-heredado-ficha, registrar-abono-heredado, cuenta-anulada, anular-cuenta, reversar-pago-${pago.folioRecibo}, motivo-reverso, confirmar-reversar-pago, monto-abono-heredado, confirmar-abono-heredado |  |
| componentes/indice.ts | 7 |  |  |  |  |  |  |
| componentes/modal-abrir-ar-excepcion.tsx | 205 |  | ModalAbrirArExcepcion |  |  |  |  |
| componentes/modal-cobro-multiple.tsx | 262 |  | ModalCobroMultiple |  |  | modal-cobro-multiple, cobro-multiple-mensaje, cobro-multiple-error, cobro-cliente, cobro-cuenta-${cuenta.id}, cobro-cuenta-monto-${cuenta.id}, cobro-total-aplicado, cobro-monto-pagado, cobro-moneda, cobro-tipo-cambio |  |
| componentes/modal-consolidacion-ar.tsx | 142 |  | ModalConsolidacionAr |  |  | consolidacion-conteo, consolidar-${fila.folio}, consolidacion-resultado, confirmar-consolidacion |  |
| componentes/modal-promesa-pago.tsx | 168 |  | ModalPromesaPago |  |  | modal-promesa-pago, promesa-error, promesa-mensaje, promesa-fecha, promesa-monto, confirmar-crear-promesa, promesa-motivo, confirmar-cancelar-promesa, cerrar-promesa |  |
| componentes/modal-registrar-factura.tsx | 95 |  | DatosFacturaAr, ModalRegistrarFactura |  |  |  |  |
| componentes/modal-registrar-pago.tsx | 230 |  | DatosPagoFormulario, DatosSaldoFormulario, ModalRegistrarPagoProps, ModalRegistrarPago |  |  |  |  |
| componentes/operacion-cobranza.tsx | 285 |  | OperacionCobranza |  |  | operacion-cobranza, abrir-consolidacion, abrir-cobro-multiple |  |
| componentes/recibo-pago-vista.tsx | 36 |  | ReciboPago, ReciboPagoVista |  |  | recibo-pago |  |
| componentes/recibo-persistido.tsx | 56 |  | imprimirRecibo, ReciboPersistido |  |  | recibo-persistido |  |
| componentes/sincronizador-cobranza-realtime.tsx | 67 |  | SincronizadorCobranzaRealtime |  |  | sincronizador-cobranza |  |
| componentes/tabla-cuentas-por-cobrar.tsx | 167 |  | TablaCuentasPorCobrarProps, TablaCuentasPorCobrar |  |  | promesa-${cuenta.referenciaInterna} |  |
| componentes/tarjeta-resumen-aging.tsx | 47 |  | TarjetaResumenAging |  |  |  |  |
| servicios/aging-servicio.ts | 280 |  | MONEDA_AGING, BUCKETS_AGING, BucketAging, EntradaConversionPago, convertirPagoAMonedaCuenta, convertirAMxn, calcularDiasVencidos, SLUGS_AGING |  |  |  |  |
| servicios/cobranza-servicio.ts | 442 |  | CodigoErrorCobranza, ErrorCobranza, CuentaAbierta, PagoRegistrado, SaldoFavorAplicado, CuentaCartera, ResumenCartera, abrirCuentaPorCobrarServicio | abrir_ar_excepcion_entregada, registrar_pago_ar_atomico, aplicar_saldo_favor_ar, reversar_pago_ar, registrar_abono_heredado_ar, anular_cuenta_por_cobrar, previsualizar_consolidacion_ar_faltantes, consolidar_ar_faltantes | cuentas_por_cobrar, clientes, ordenes_produccion, pagos_ar, movimientos_saldo_favor |  |  |
| servicios/estado-cuenta-servicio.ts | 198 |  | OrdenCrudaEstadoCuenta, CuentaCrudaEstadoCuenta, LineaCotizacionCruda, SituacionCobroOrden, FilaOrdenEstadoCuenta, totalCotizadoSinIva, resumirOrdenesEstadoCuenta, ETIQUETA_SITUACION_ORDEN |  |  |  |  |
| servicios/ficha-cuenta-servicio.ts | 50 |  | ETIQUETA_CONDICION_CUENTA, ReconciliacionCuenta, reconciliarCuenta, etiquetaCondicionCuenta |  |  |  |  |
| servicios/flujo-cuentas-servicio.ts | 138 |  | MovimientoCuenta, FlujoCuenta, calcularFlujoPorCuenta, obtenerFlujoCuentasServicio |  | cuentas_bancarias, pagos_ar, gastos |  |  |
| servicios/historial-cobranza-servicio.ts | 330 |  | PAGOS_POR_PAGINA, MOVIMIENTOS_POR_PAGINA, PARTIDAS_POR_PAGINA, CUENTAS_BANCARIAS_MAXIMAS, obtenerHistorialCuentaServicio, obtenerDetalleOrdenCobranzaServicio, obtenerReciboPagoServicio, obtenerCuentasBancariasActivasServicio | consultar_bancos_cobranza | cuentas_por_cobrar, clientes, pagos_ar, movimientos_saldo_favor, reversos_pago_ar, ordenes_produccion, partidas_orden_produccion, aplicaciones_pago |  |  |
| servicios/indice.ts | 17 |  |  |  |  |  |  |
| servicios/promesas-servicio.ts | 143 |  | PromesaPago, obtenerPromesaActiva, ClienteCobrable, obtenerClientesCobrables, CuentaCobrableMultiple, obtenerCuentasCobrablesCliente |  | promesas_pago, cuentas_por_cobrar, clientes, ordenes_produccion |  |  |
| tipos/cobranza.ts | 200 |  | MONEDAS_COBRANZA, ESTADOS_CUENTA_POR_COBRAR, METODOS_PAGO_AR, TIPOS_MOVIMIENTO_SALDO_FAVOR, MonedaCobranza, EstadoCuentaPorCobrar, MetodoPagoAR, TipoMovimientoSaldoFavor |  |  |  |  |
| tipos/historial.ts | 187 |  | CuentaHistorial, HistorialCuenta, PartidaOrdenCobranza, DetalleOrdenCobranza, ReciboPagoPersistido, CuentaBancariaCobranza, enmascararNumeroCuenta, filaACuentaBancariaCobranza |  |  |  |  |
| tipos/indice.ts | 25 |  |  |  |  |  |  |
| validaciones/cobranza.ts | 147 |  | esquemaCrearCuentaPorCobrar, esquemaRegistrarPago, esquemaAplicarSaldoFavor, esquemaConsultarCartera, esquemaConsultarHistorialCuenta, esquemaConsultarDetalleOrden, esquemaConsultarRecibo, esquemaConsultarCuentasBancarias |  |  |  |  |
| validaciones/indice.ts | 22 |  |  |  |  |  |  |
| validaciones/promesas.ts | 65 |  | esquemaPromesaCuenta, esquemaCrearPromesa, esquemaCancelarPromesa, esquemaCuentasCliente, esquemaCobroMultiple, CrearPromesaInput, CancelarPromesaInput, CobroMultipleInput |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/cobranza/loading.tsx
- src/app/(privado)/cobranza/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/cobranza/page.tsx <- indice, cobranza-servicio, flujo-cuentas-servicio
### dashboard
- src/modulos/dashboard/componentes/seccion-financiera.tsx <- aging-servicio

## RPC usadas por el módulo -> última migración que las define
- cancelar_promesa_pago: 20261007180002_sii_b8_cobros_promesas_motores.sql (1 definiciones)
- crear_promesa_pago: 20261007180002_sii_b8_cobros_promesas_motores.sql (1 definiciones)
- registrar_cobro_multiple: 20261007180002_sii_b8_cobros_promesas_motores.sql (1 definiciones)
- registrar_factura_ar: 20260925000100_a20_factura_sobre_ar_existente.sql (1 definiciones)
- abrir_ar_excepcion_entregada: 20260925043000_a20_ar_excepcion_orden_entregada.sql (1 definiciones)
- registrar_pago_ar_atomico: 20261007180004_sii_b8_aplicaciones_conflicto.sql (6 definiciones)
- aplicar_saldo_favor_ar: 20261007180004_sii_b8_aplicaciones_conflicto.sql (5 definiciones)
- reversar_pago_ar: 20261007230005_sii_b8_reverso_promesa.sql (3 definiciones)
- registrar_abono_heredado_ar: 20260925100000_a20_ar08_ar09_movimientos.sql (1 definiciones)
- anular_cuenta_por_cobrar: 20260925110000_a20_ar16_cfg12.sql (1 definiciones)
- previsualizar_consolidacion_ar_faltantes: 20260925110000_a20_ar16_cfg12.sql (1 definiciones)
- consolidar_ar_faltantes: 20260925110000_a20_ar16_cfg12.sql (1 definiciones)
- consultar_bancos_cobranza: 20260914185720_cobranza_bancos_lectura_y_pago_seguro.sql (1 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)
- ordenes_produccion: 20261012130000_b5_obs5_orden_interna_sin_cliente.sql (9 migraciones)
- cuentas_por_cobrar: 20261007170001_sii_b8_facturacion.sql (8 migraciones)
- clientes: 20261006300002_sii_b2_cliente_comercial_estado.sql (5 migraciones)
- pipeline: 20261008131134_catalogo_canales_rfq.sql (7 migraciones)
- configuracion_sistema: 20260919000002_catalogos_tiers_categorias.sql (2 migraciones)
- cotizacion_lineas: 20260921000001_obs04_estacion_linea_cotizacion.sql (4 migraciones)
- pagos_ar: 20261007230001_sii_folios_derivados_prefijo.sql (7 migraciones)
- movimientos_saldo_favor: 20260814143339_fase_8_cobranza_base.sql (1 migraciones)
- cuentas_bancarias: 20261007200001_sii_b8_tesoreria_base.sql (2 migraciones)
- gastos: 20261007190001_sii_b8_compras_base.sql (5 migraciones)
- reversos_pago_ar: 20261007180001_sii_b8_cobros_promesas_base.sql (2 migraciones)
- partidas_orden_produccion: 20261010130000_c6_2_consumo_sin_stock.sql (5 migraciones)
- aplicaciones_pago: 20261007180001_sii_b8_cobros_promesas_base.sql (1 migraciones)
- promesas_pago: 20261007180001_sii_b8_cobros_promesas_base.sql (1 migraciones)

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
- obtener_ar_ordenes_canceladas_con_cobranza: 20260922000002_a02_cancelacion_ar_atomica.sql (1 definiciones)
- obtener_capacidad_efectiva_recurso_turno: 20260919000007_d02_capacidad_instalada.sql (2 definiciones)
- obtener_costo_ti_periodo: 20260921000003_obs29_desglose_ti_periodo.sql (1 definiciones)
- obtener_desglose_rentabilidad_orden: 20260923170507_a15_distribuir_estimado_por_tarifa.sql (2 definiciones)
- obtener_metricas_pipeline_equipo: 20261007120004_sii_b5_consumidores_estado.sql (3 definiciones)
- obtener_rentabilidad_orden: 20260922000003_a03_ingreso_neto_sin_iva.sql (4 definiciones)
- pipeline_proteger_columnas: 20260812010000_fase_5_operacion_ordenes.sql (2 definiciones)
- proponer_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- proteger_costo_material_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- reactivar_contacto_cliente: 20261006300003_sii_b2_contactos_logicos.sql (1 definiciones)
- reactivar_orden_op: 20261007120004_sii_b5_consumidores_estado.sql (2 definiciones)

## Pruebas relacionadas (268) — términos: cobranza, cancelar_promesa_pago, crear_promesa_pago, registrar_cobro_multiple, registrar_factura_ar, abrir_ar_excepcion_entregada, registrar_pago_ar_atomico, aplicar_saldo_favor_ar, reversar_pago_ar, registrar_abono_heredado_ar, anular_cuenta_por_cobrar, previsualizar_consolidacion_ar_faltantes, consolidar_ar_faltantes, consultar_bancos_cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, configuracion_sistema, cotizacion_lineas, pagos_ar, movimientos_saldo_favor, cuentas_bancarias, gastos, reversos_pago_ar, partidas_orden_produccion, aplicaciones_pago, promesas_pago, rentabilidad, costo, iva, orden_compra, tesoreria, facturas
- tests/e2e/aceptacion-comercial.spec.ts — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas (+2)
- tests/e2e/actividad.spec.ts — ordenes_produccion, clientes, pipeline
- tests/e2e/archivos-cliente.spec.ts — clientes
- tests/e2e/bitacora-configuracion.spec.ts — pipeline
- tests/e2e/cancelacion-financiera.spec.ts — cobranza, registrar_pago_ar_atomico, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar
- tests/e2e/catalogos-base.spec.ts — costo, iva
- tests/e2e/catalogos-comerciales.spec.ts — configuracion_sistema, gastos
- tests/e2e/clientes-contactos.spec.ts — clientes, iva
- tests/e2e/clientes-ficha.spec.ts — clientes, iva
- tests/e2e/clientes-historial.spec.ts — ordenes_produccion, clientes, pipeline, cotizacion_lineas, partidas_orden_produccion
- tests/e2e/cobranza-cobro-multiple.spec.ts — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar, movimientos_saldo_favor (+4)
- tests/e2e/cobranza-ficha.spec.ts — cobranza, registrar_pago_ar_atomico, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar (+1)
- tests/e2e/cobranza-flujo.spec.ts — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas (+4)
- tests/e2e/cobranza-folio-rp.spec.ts — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar, movimientos_saldo_favor (+2)
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — cobranza, registrar_pago_ar_atomico, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline (+5)
- tests/e2e/comercial-realtime.spec.ts — clientes, pipeline, iva
- tests/e2e/compras-flujo.spec.ts — ordenes_produccion, clientes, iva
- tests/e2e/configuracion-flujo.spec.ts — configuracion_sistema
- tests/e2e/continuidad-folios-rfq.spec.ts — pipeline, iva
- tests/e2e/corridas-calidad.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/e2e/dashboard-roles.spec.ts — pipeline
- tests/e2e/entregas-flujo.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, partidas_orden_produccion, iva
- tests/e2e/facturacion-flujo.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, iva, facturas
- tests/e2e/gastos-a19.spec.ts — gastos, iva
- tests/e2e/gastos-ocr.spec.ts — gastos
- tests/e2e/gastos-rentabilidad-ti.spec.ts — ordenes_produccion, clientes, gastos, rentabilidad, costo, iva
- tests/e2e/gastos-rentabilidad.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar, gastos, partidas_orden_produccion (+3)
- tests/e2e/kpis-dashboard.spec.ts — cobranza, rentabilidad, iva
- tests/e2e/materiales-costos-c6-3.spec.ts — costo
- tests/e2e/operadores-gestion.spec.ts — iva
- tests/e2e/ordenes-edicion-borrador.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion
- tests/e2e/ordenes-estados-sii.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, partidas_orden_produccion, iva
- tests/e2e/ordenes-flujo-completo.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, costo, iva
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- tests/e2e/planeacion-bolsa-acciones.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/e2e/produccion-avance-procesos.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/e2e/produccion-piso.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/e2e/propuestas-flujo.spec.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, gastos, costo (+1)
- tests/e2e/rfq-flujo.spec.ts — clientes, pipeline, iva
- tests/e2e/taller-taxonomia.spec.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/e2e/tesoreria-flujo.spec.ts — pagos_ar, cuentas_bancarias, iva, tesoreria
- tests/integracion/aislamiento-entorno.test.ts — clientes, iva
- tests/integracion/aprobacion-credito-identidad.test.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas, iva
- tests/integracion/ar-anulacion-consolidacion.test.ts — registrar_pago_ar_atomico, reversar_pago_ar, anular_cuenta_por_cobrar, previsualizar_consolidacion_ar_faltantes, consolidar_ar_faltantes, ordenes_produccion (+8)
- tests/integracion/ar-excepcion-concurrencia.test.ts — abrir_ar_excepcion_entregada, ordenes_produccion, cuentas_por_cobrar, clientes, iva
- tests/integracion/ar-movimientos.test.ts — registrar_pago_ar_atomico, reversar_pago_ar, registrar_abono_heredado_ar, ordenes_produccion, cuentas_por_cobrar, clientes (+4)
- tests/integracion/archivos-sesion-rls.test.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/integracion/areas-operador-concurrencia.test.ts — clientes
- tests/integracion/avance-proceso-concurrencia.test.ts — ordenes_produccion, clientes, partidas_orden_produccion, iva
- tests/integracion/bitacora-rls.test.ts — iva
- tests/integracion/c2-3-documentos-orden.test.ts — ordenes_produccion, clientes
- tests/integracion/c3-1-items-revision-concurrencia.test.ts — clientes, pipeline, iva
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — ordenes_produccion, clientes, costo, iva
- tests/integracion/cancelacion-cobro-concurrencia.test.ts — registrar_pago_ar_atomico, aplicar_saldo_favor_ar, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar (+2)
- tests/integracion/clientes-folios-concurrencia.test.ts — clientes
- tests/integracion/clientes-promocion.test.ts — clientes, pipeline
- tests/integracion/cobranza-acciones.test.ts — cobranza
- tests/integracion/cobranza-historial-acciones.test.ts — cobranza
- tests/integracion/comentarios-acciones.test.ts — clientes
- tests/integracion/concurrencia-estricta.test.ts — registrar_pago_ar_atomico, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas (+4)
- tests/integracion/configuracion-acciones.test.ts — costo, iva
- tests/integracion/cotizacion-acciones.test.ts — pipeline
- tests/integracion/dashboard-acciones.test.ts — clientes, iva
- tests/integracion/gastos-acciones.test.ts — configuracion_sistema, gastos, rentabilidad, iva
- tests/integracion/inventario-movimientos.test.ts — costo
- tests/integracion/materiales-costos-acciones.test.ts — costo, iva
- tests/integracion/orden-heredada.test.ts — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- tests/integracion/ordenes-acciones.test.ts — costo, iva
- tests/integracion/pipeline-folios-concurrencia.test.ts — pipeline
- tests/integracion/pipeline-promocion.test.ts — clientes, pipeline, iva
- tests/integracion/produccion-sesiones.test.ts — iva
- tests/integracion/rbac-concurrencia.test.ts — iva
- tests/integracion/reactivar-orden.test.ts — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- tests/integracion/repetir-trabajo.test.ts — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- tests/integracion/usuario-inactivo-rls.test.ts — pipeline, cotizacion_lineas, iva
- tests/unitarias/actividad-agrupacion.test.ts — clientes, pipeline, tesoreria
- tests/unitarias/actividad-correlacion.test.ts — clientes
- tests/unitarias/actividad-filtros.test.ts — clientes, pipeline
- tests/unitarias/actividad-paginacion-ui.test.ts — clientes
- tests/unitarias/autenticacion.test.ts — clientes
- tests/unitarias/bitacora-autorizacion.test.ts — iva
- tests/unitarias/bitacora-enlaces.test.ts — clientes, pipeline
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
- tests/unitarias/clientes-historial.test.ts — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas, pagos_ar (+3)
- tests/unitarias/clientes-panel-tier.test.ts — clientes
- tests/unitarias/clientes-tier.test.ts — clientes
- tests/unitarias/cobranza-aging.test.ts — cobranza, iva
- tests/unitarias/cobranza-esquemas.test.ts — cobranza, iva
- tests/unitarias/cobranza-estado-cuenta-ordenes.test.ts — cobranza, iva
- tests/unitarias/cobranza-ficha.test.ts — cobranza, iva
- tests/unitarias/cobranza-flujo-cuentas.test.ts — cobranza
- tests/unitarias/cobranza-historial-servicio.test.ts — cobranza, consultar_bancos_cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar (+2)
- tests/unitarias/cobranza-historial-ui.test.ts — cobranza
- tests/unitarias/cobranza-pago-formulario.test.ts — cobranza
- tests/unitarias/cobranza-promesas.test.ts — cobranza
- tests/unitarias/cobranza-tienda.test.ts — cobranza
- tests/unitarias/comentarios-menciones-correo.test.ts — clientes, pipeline, iva
- tests/unitarias/comparativa-ordenes.test.ts — iva
- tests/unitarias/configuracion-catalogos.test.ts — clientes, gastos, iva
- tests/unitarias/configuracion-esquemas.test.ts — costo, iva
- tests/unitarias/configuracion-servicio.test.ts — costo, iva
- tests/unitarias/contactos-seguimiento.test.ts — clientes, pipeline
- tests/unitarias/contexto-sesion-operador.test.ts — iva
- tests/unitarias/costeo-ruteo-c33.test.ts — costo, iva
- tests/unitarias/cotizador-calculo.test.ts — costo
- tests/unitarias/cotizador-formulario.test.ts — pipeline, iva
- tests/unitarias/cotizador-snapshot.test.ts — pipeline, costo
- tests/unitarias/cotizador-tarifas.test.ts — costo
- tests/unitarias/dashboard-esquemas.test.ts — iva
- tests/unitarias/dashboard-mappers.test.ts — pipeline, gastos, costo, iva
- tests/unitarias/dashboard-tarjetas.test.ts — pipeline, gastos, costo, iva
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
- tests/unitarias/kpis-areas.test.ts — cobranza, rentabilidad
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
- tests/unitarias/ordenes-lotes-servicio.test.ts — cobranza, ordenes_produccion, cuentas_por_cobrar, pipeline, partidas_orden_produccion, iva
- tests/unitarias/ordenes-servicio.test.ts — ordenes_produccion, pipeline, costo, iva
- tests/unitarias/permisos-confirmacion-refetch.test.ts — clientes, iva
- tests/unitarias/permisos-matriz.test.ts — clientes
- tests/unitarias/pipeline-adjuntos.test.ts — pipeline
- tests/unitarias/pipeline-alertas.test.ts — pipeline, iva
- tests/unitarias/pipeline-cliente-acciones.test.ts — clientes, pipeline, iva
- tests/unitarias/pipeline-cliente-rfq.test.ts — clientes, pipeline
- tests/unitarias/pipeline-cotizacion-editor.test.ts — pipeline, iva
- tests/unitarias/pipeline-cotizacion-esquemas.test.ts — pipeline, costo, iva
- tests/unitarias/pipeline-cotizacion-servicio.test.ts — pipeline, cotizacion_lineas
- tests/unitarias/pipeline-datos-solicitud-esquema.test.ts — pipeline, iva
- tests/unitarias/pipeline-estacion-linea.test.ts — pipeline
- tests/unitarias/pipeline-evaluar-credito.test.ts — pipeline
- tests/unitarias/pipeline-filtros-resumen.test.ts — clientes, pipeline, iva
- tests/unitarias/pipeline-marcar-ganada-orden.test.ts — pipeline
- tests/unitarias/pipeline-procesos-previos.test.ts — pipeline
- tests/unitarias/pipeline-selector-cliente.test.ts — clientes, pipeline
- tests/unitarias/pipeline-totales.test.ts — pipeline, iva
- tests/unitarias/pipeline-transiciones.test.ts — pipeline
- tests/unitarias/planeacion-acciones.test.ts — iva
- tests/unitarias/planeacion-capacidad.test.ts — iva
- tests/unitarias/planeacion-componentes.test.ts — iva
- tests/unitarias/planeacion-esquemas.test.ts — costo, iva
- tests/unitarias/planeacion-realtime.test.ts — ordenes_produccion, partidas_orden_produccion
- tests/unitarias/planeacion-servicio.test.ts — iva
- tests/unitarias/produccion-area-operadores.test.ts — costo, iva
- tests/unitarias/produccion-corridas.test.ts — iva
- tests/unitarias/produccion-esquemas.test.ts — costo, iva
- tests/unitarias/produccion-tablero.test.ts — iva
- tests/unitarias/produccion-tienda.test.ts — iva
- tests/unitarias/produccion-vista-admin.test.ts — iva
- tests/unitarias/propuestas-archivos-historial.test.ts — iva
- tests/unitarias/propuestas-canal-rfq.test.ts — pipeline
- tests/unitarias/propuestas-costeo-fabricacion.test.ts — gastos, costo, iva
- tests/unitarias/propuestas-esquemas.test.ts — costo, iva
- tests/unitarias/propuestas-items-revision-ui.test.ts — costo, iva
- tests/unitarias/propuestas-items-revision.test.ts — iva
- tests/unitarias/propuestas-pdf.test.ts — costo, iva
- tests/unitarias/propuestas-totales.test.ts — costo, iva
- tests/unitarias/propuestas-validacion-contenido.test.ts — costo
- tests/unitarias/propuestas-validar-contenido-accion.test.ts — costo
- tests/unitarias/propuestas-validar-faltantes-ui.test.ts — costo, iva
- tests/unitarias/rfq-alta-modal.test.ts — clientes, pipeline, iva
- tests/unitarias/rfq-campos-faltantes.test.ts — pipeline
- tests/unitarias/rfq-cola-lista.test.ts — pipeline, iva
- tests/unitarias/rfq-contacto-acciones.test.ts — clientes
- tests/unitarias/rfq-estados.test.ts — pipeline
- tests/unitarias/rfq-items.test.ts — pipeline, iva
- tests/unitarias/sesion-operador.test.ts — iva
- tests/unitarias/tabla-ordenes-c4-3.test.ts — iva
- tests/unitarias/tarifa-estacion.test.ts — iva
- tests/unitarias/tarifas-c32.test.ts — iva
- tests/unitarias/tesoreria-esquemas.test.ts — tesoreria
- tests/unitarias/uso-tienda-ordenes.test.ts — iva
- supabase/tests/a02_cancelacion_ar.test.sql — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar, iva
- supabase/tests/a03_a04_ingreso_neto.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, configuracion_sistema, cotizacion_lineas (+4)
- supabase/tests/a05_a06_areas_operador.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/a07_a09_publicacion_identidad.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, configuracion_sistema, cotizacion_lineas (+5)
- supabase/tests/a13_a14_credito_cliente.test.sql — cuentas_por_cobrar, clientes, pipeline, cotizacion_lineas, iva
- supabase/tests/a15_estimado_por_tarifa.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, rentabilidad, costo
- supabase/tests/a16_plazo_credito.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- supabase/tests/a17_operadores_pin.test.sql — iva
- supabase/tests/a19_gastos_edicion.test.sql — gastos, iva
- supabase/tests/a20_ar08_ar09_movimientos.test.sql — registrar_pago_ar_atomico, reversar_pago_ar, registrar_abono_heredado_ar, ordenes_produccion, cuentas_por_cobrar, clientes (+4)
- supabase/tests/a20_ar16_cfg12.test.sql — registrar_pago_ar_atomico, reversar_pago_ar, anular_cuenta_por_cobrar, previsualizar_consolidacion_ar_faltantes, consolidar_ar_faltantes, ordenes_produccion (+7)
- supabase/tests/a20_archivos_sesion_permisos.test.sql — iva
- supabase/tests/a20_ar_excepcion_entregada.test.sql — abrir_ar_excepcion_entregada, ordenes_produccion, cuentas_por_cobrar, clientes, iva
- supabase/tests/a20_cli08_repetir_trabajo.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_continuidad_folios.test.sql — pipeline, iva
- supabase/tests/a20_factura_ar_existente.test.sql — registrar_factura_ar, ordenes_produccion, cuentas_por_cobrar, clientes, iva
- supabase/tests/a20_metas_proceso_partida.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_ord06_orden_heredada.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_prd09_avance_proceso.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_prd15_reactivar_orden.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_reanudar_sesion_contextual.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/a20_referencia_interna_ar.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes
- supabase/tests/b4_folio_desborde_check.test.sql — clientes, pipeline
- supabase/tests/b4_obs2_flujo_versiones.test.sql — clientes, pipeline
- supabase/tests/b5_obs5_orden_interna_sin_cliente.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/c2_1_rfq_versiones.test.sql — clientes, pipeline, iva
- supabase/tests/c2_2_proxima_accion_transicion.test.sql — pipeline
- supabase/tests/c3_1_items_por_revision.test.sql — clientes, pipeline, costo, iva
- supabase/tests/c3_1_linaje_documental_orden.test.sql — ordenes_produccion, clientes, pipeline, partidas_orden_produccion, iva
- supabase/tests/c3_2_tarifas_grupo_recurso.test.sql — iva
- supabase/tests/c3_3_costeo_ruteo.test.sql — clientes, pipeline, costo, iva
- supabase/tests/c4_1_aceptacion_orden_pendiente.test.sql — ordenes_produccion, clientes, pipeline
- supabase/tests/c4_2_orden_comercial_operativa.test.sql — ordenes_produccion, clientes, pipeline, partidas_orden_produccion, iva
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql — ordenes_produccion, costo, iva
- supabase/tests/c6_1_materiales_costos.test.sql — costo
- supabase/tests/c6_2_consumo_sin_stock.test.sql — ordenes_produccion, clientes, configuracion_sistema, partidas_orden_produccion, rentabilidad, costo
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — ordenes_produccion, clientes, costo
- supabase/tests/observaciones_catalogo_canales.test.sql — pipeline, iva
- supabase/tests/sii_b1_actividad.test.sql — ordenes_produccion, clientes, pipeline, cuentas_bancarias, tesoreria
- supabase/tests/sii_b1_auditoria_rbac.test.sql — iva
- supabase/tests/sii_b1_catalogos.test.sql — costo, iva
- supabase/tests/sii_b1_logs_append_only.test.sql — iva
- supabase/tests/sii_b1_permisos.test.sql — iva
- supabase/tests/sii_b1_storage_solo_servidor.test.sql — iva
- supabase/tests/sii_b2_clientes.test.sql — clientes, iva
- supabase/tests/sii_b3_continuidad_folios.test.sql — ordenes_produccion, pipeline, iva
- supabase/tests/sii_b3_rfq_base.test.sql — clientes, pipeline, cotizacion_lineas, iva
- supabase/tests/sii_b3_rfq_consumidores.test.sql — ordenes_produccion, clientes, pipeline, iva
- supabase/tests/sii_b4_propuestas.test.sql — clientes, pipeline, cotizacion_lineas, costo, iva
- supabase/tests/sii_b4_propuestas_envio.test.sql — clientes, pipeline, iva
- supabase/tests/sii_b5_orden.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, partidas_orden_produccion, iva
- supabase/tests/sii_b6_produccion.test.sql — ordenes_produccion, clientes, partidas_orden_produccion, iva
- supabase/tests/sii_b7_entregas.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, partidas_orden_produccion, iva
- supabase/tests/sii_b8_cobros_promesas.test.sql — crear_promesa_pago, registrar_cobro_multiple, registrar_pago_ar_atomico, reversar_pago_ar, ordenes_produccion, cuentas_por_cobrar (+6)
- supabase/tests/sii_b8_compras.test.sql — gastos
- supabase/tests/sii_b8_facturacion.test.sql — ordenes_produccion, cuentas_por_cobrar, clientes, iva, facturas
- supabase/tests/sii_b8_folio_recibo.test.sql — registrar_pago_ar_atomico, aplicar_saldo_favor_ar, ordenes_produccion, cuentas_por_cobrar, clientes, pagos_ar (+1)
- supabase/tests/sii_b8_tesoreria.test.sql — pagos_ar, cuentas_bancarias, gastos, iva, tesoreria
- supabase/tests/sii_b9_kpis.test.sql — cobranza, ordenes_produccion, cuentas_por_cobrar, clientes, pipeline, pagos_ar (+4)
- supabase/tests/tarifario_unico_estacion.test.sql — configuracion_sistema, iva