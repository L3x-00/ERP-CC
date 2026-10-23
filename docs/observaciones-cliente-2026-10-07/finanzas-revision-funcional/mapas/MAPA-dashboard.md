# Mapa estático del módulo «dashboard» (generado sin modelo el 2026-10-14T18:16:58.093Z)
Fuente: `src/modulos/dashboard` · 20 archivos · 1653 líneas. Los lectores deben leer ESTE mapa primero y usar `Read` con `offset/limit` solo en lo que importe.

## Archivos del módulo
| archivo | líneas | srv | exports | rpc | tablas | testids | usa de |
|---|---|---|---|---|---|---|---|
| acciones/cambiar-periodo-dashboard.ts | 16 | sí | cambiarPeriodoDashboardAccion, cambiarPeriodoDashboard |  |  |  |  |
| acciones/indice.ts | 6 |  |  |  |  |  |  |
| acciones/obtener-metricas-inicio.ts | 70 | sí | obtenerMetricasInicioAccion, cambiarPeriodoDashboardAccion |  |  |  | autenticacion |
| componentes/claves-consulta.ts | 3 |  | CLAVE_DASHBOARD |  |  |  |  |
| componentes/filtro-periodo-global.tsx | 106 |  | FiltroPeriodoGlobalProps, FiltroPeriodoGlobal |  |  |  |  |
| componentes/indice.ts | 9 |  |  |  |  |  |  |
| componentes/operacion-dashboard.tsx | 144 |  | OperacionDashboard |  |  | pagina-dashboard, rejilla-secciones-dashboard |  |
| componentes/seccion-financiera.tsx | 92 |  | SeccionFinancieraProps, SeccionFinanciera |  |  |  | cobranza |
| componentes/seccion-gasto-categoria.tsx | 62 |  | SeccionGastoCategoriaProps, SeccionGastoCategoria |  |  |  |  |
| componentes/seccion-produccion-alertas.tsx | 38 |  | SeccionProduccionAlertas |  |  |  |  |
| componentes/seccion-ventas-pipeline.tsx | 38 |  | SeccionVentasPipelineProps, SeccionVentasPipeline |  |  |  |  |
| componentes/sincronizador-dashboard-realtime.tsx | 80 |  | SincronizadorDashboardRealtime |  |  | sincronizador-dashboard |  |
| componentes/widget-metrica-kpi.tsx | 37 |  | WidgetMetricaKPI |  |  | kpi-${tarjeta.id} |  |
| servicios/calculo-tendencias.ts | 48 |  | ResultadoVariacionPorcentaje, calcularVariacionPorcentaje |  |  |  |  |
| servicios/dashboard-servicio.ts | 281 |  | tarjetasEjecutivas, obtenerDashboardPorRol | obtener_metricas_dashboard_ejecutivo, obtener_costo_ti_periodo, obtener_metricas_vendedor, obtener_metricas_pipeline_equipo, obtener_metricas_contador |  |  | autenticacion |
| servicios/indice.ts | 3 |  |  |  |  |  |  |
| tipos/dashboard.ts | 572 |  | PERIODOS_DASHBOARD, PeriodoTipoDashboard, ETAPAS_PIPELINE_DASHBOARD, EtapaPipelineDashboard, TendenciaMetrica, PeriodoComparativoDashboard, FiltroPeriodoDashboard, ResumenVentasDashboard |  |  |  | autenticacion |
| tipos/indice.ts | 2 |  |  |  |  |  |  |
| validaciones/dashboard.ts | 44 |  | esquemaFiltroPeriodo, esquemaCambiarPeriodoDashboard, FiltroPeriodoDashboardInput, CambiarPeriodoDashboardInput |  |  |  |  |
| validaciones/indice.ts | 2 |  |  |  |  |  |  |

## Rutas (src/app) relacionadas
- src/app/(privado)/dashboard/loading.tsx
- src/app/(privado)/dashboard/page.tsx

## Importadores externos (blast radius de cambiar el módulo)
### app (rutas)
- src/app/(privado)/dashboard/page.tsx <- indice
### otros
- src/estado/uso-tienda-dashboard.ts <- indice

## RPC usadas por el módulo -> última migración que las define
- obtener_metricas_dashboard_ejecutivo: 20260922000004_a04_dashboard_costos_y_venta_neta.sql (6 definiciones)
- obtener_costo_ti_periodo: 20260921000003_obs29_desglose_ti_periodo.sql (1 definiciones)
- obtener_metricas_vendedor: 20261007100004_sii_b3_rfq_consumidores.sql (2 definiciones)
- obtener_metricas_pipeline_equipo: 20261007120004_sii_b5_consumidores_estado.sql (3 definiciones)
- obtener_metricas_contador: 20260911000005_auditoria_dashboard_aging.sql (2 definiciones)

## Tablas usadas -> migraciones que las crean/alteran (última)

## Otras funciones SQL del dominio (nombre coincide con los términos) -> última migración
- capturar_costo_hora_sesion: 20260909224637_fase_9_gastos_base.sql (1 definiciones)
- confirmar_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- costo_ti_rango: 20261007120004_sii_b5_consumidores_estado.sql (2 definiciones)
- editar_costos_revision: 20261007110002_sii_b4_propuestas_acciones.sql (1 definiciones)
- impedir_cambio_historial_costos_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- obtener_desglose_rentabilidad_orden: 20260923170507_a15_distribuir_estimado_por_tarifa.sql (2 definiciones)
- obtener_rentabilidad_orden: 20260922000003_a03_ingreso_neto_sin_iva.sql (4 definiciones)
- proponer_costo_material: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)
- proteger_costo_material_c6: 20261010120000_c6_1_materiales_costos.sql (1 definiciones)

## Pruebas relacionadas (110) — términos: dashboard, obtener_metricas_dashboard_ejecutivo, obtener_costo_ti_periodo, obtener_metricas_vendedor, obtener_metricas_pipeline_equipo, obtener_metricas_contador, rentabilidad, costo, margen
- tests/e2e/aceptacion-comercial.spec.ts — dashboard
- tests/e2e/actividad.spec.ts — dashboard
- tests/e2e/archivos-cliente.spec.ts — dashboard
- tests/e2e/bitacora-configuracion.spec.ts — dashboard
- tests/e2e/cancelacion-financiera.spec.ts — dashboard
- tests/e2e/catalogos-base.spec.ts — dashboard, costo
- tests/e2e/catalogos-comerciales.spec.ts — dashboard
- tests/e2e/clientes-contactos.spec.ts — dashboard
- tests/e2e/clientes-ficha.spec.ts — dashboard
- tests/e2e/clientes-historial.spec.ts — dashboard
- tests/e2e/cobranza-cobro-multiple.spec.ts — dashboard
- tests/e2e/cobranza-ficha.spec.ts — dashboard
- tests/e2e/cobranza-flujo.spec.ts — dashboard
- tests/e2e/cobranza-folio-rp.spec.ts — dashboard
- tests/e2e/cobranza-movimientos-consolidacion.spec.ts — dashboard
- tests/e2e/comentarios-notificaciones.spec.ts — dashboard
- tests/e2e/comercial-realtime.spec.ts — dashboard
- tests/e2e/compras-flujo.spec.ts — dashboard
- tests/e2e/configuracion-flujo.spec.ts — dashboard
- tests/e2e/continuidad-folios-configuracion.spec.ts — dashboard
- tests/e2e/continuidad-folios-rfq.spec.ts — dashboard
- tests/e2e/corridas-calidad.spec.ts — dashboard
- tests/e2e/dashboard-roles.spec.ts — dashboard, margen
- tests/e2e/entregas-flujo.spec.ts — dashboard
- tests/e2e/facturacion-flujo.spec.ts — dashboard
- tests/e2e/gastos-a19.spec.ts — dashboard
- tests/e2e/gastos-ocr.spec.ts — dashboard
- tests/e2e/gastos-rentabilidad-ti.spec.ts — dashboard, rentabilidad, costo, margen
- tests/e2e/gastos-rentabilidad.spec.ts — dashboard, rentabilidad, costo, margen
- tests/e2e/kpis-dashboard.spec.ts — dashboard, rentabilidad
- tests/e2e/materiales-costos-c6-3.spec.ts — dashboard, costo
- tests/e2e/operadores-gestion.spec.ts — dashboard
- tests/e2e/ordenes-edicion-borrador.spec.ts — dashboard
- tests/e2e/ordenes-estados-sii.spec.ts — dashboard
- tests/e2e/ordenes-flujo-completo.spec.ts — dashboard, costo
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts — dashboard
- tests/e2e/permisos-usuarios-admin.spec.ts — dashboard
- tests/e2e/planeacion-bolsa-acciones.spec.ts — dashboard
- tests/e2e/planeacion-capacidad.spec.ts — dashboard
- tests/e2e/planeacion-flujo-colaborativo.spec.ts — dashboard
- tests/e2e/produccion-avance-procesos.spec.ts — dashboard
- tests/e2e/produccion-piso.spec.ts — dashboard
- tests/e2e/propuestas-flujo.spec.ts — dashboard, costo
- tests/e2e/rfq-flujo.spec.ts — dashboard
- tests/e2e/taller-taxonomia.spec.ts — dashboard
- tests/e2e/tesoreria-flujo.spec.ts — dashboard
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts — costo
- tests/integracion/concurrencia-estricta.test.ts — costo
- tests/integracion/configuracion-acciones.test.ts — costo, margen
- tests/integracion/dashboard-acciones.test.ts — dashboard, margen
- tests/integracion/gastos-acciones.test.ts — rentabilidad
- tests/integracion/inventario-movimientos.test.ts — costo
- tests/integracion/materiales-costos-acciones.test.ts — costo
- tests/integracion/ordenes-acciones.test.ts — costo
- tests/unitarias/configuracion-esquemas.test.ts — costo, margen
- tests/unitarias/configuracion-servicio.test.ts — costo, margen
- tests/unitarias/costeo-ruteo-c33.test.ts — costo, margen
- tests/unitarias/cotizador-calculo.test.ts — costo
- tests/unitarias/cotizador-snapshot.test.ts — costo
- tests/unitarias/cotizador-tarifas.test.ts — costo
- tests/unitarias/dashboard-esquemas.test.ts — dashboard
- tests/unitarias/dashboard-mappers.test.ts — dashboard, costo, margen
- tests/unitarias/dashboard-tarjetas.test.ts — dashboard, costo, margen
- tests/unitarias/dashboard-tendencias.test.ts — dashboard
- tests/unitarias/gastos-desglose.test.ts — rentabilidad, costo
- tests/unitarias/gastos-rentabilidad.test.ts — rentabilidad, costo, margen
- tests/unitarias/inventario-c6-3-acciones.test.ts — costo
- tests/unitarias/inventario-c6-3-pagina.test.ts — dashboard, costo
- tests/unitarias/inventario-c6-3-panel.test.ts — costo
- tests/unitarias/inventario-esquemas.test.ts — costo
- tests/unitarias/inventario-hooks.test.ts — costo
- tests/unitarias/inventario-servicios.test.ts — costo
- tests/unitarias/inventario-ui.test.ts — costo
- tests/unitarias/kpis-areas.test.ts — rentabilidad
- tests/unitarias/materiales-catalogo-obs8.test.ts — costo
- tests/unitarias/materiales-costos-esquemas.test.ts — costo
- tests/unitarias/materiales-costos-servicio.test.ts — costo
- tests/unitarias/materiales-costos-ui.test.ts — costo
- tests/unitarias/monto-parsear.test.ts — costo
- tests/unitarias/navegacion-c6-3.test.ts — costo
- tests/unitarias/ordenes-calculos.test.ts — costo
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts — costo
- tests/unitarias/ordenes-esquemas.test.ts — costo
- tests/unitarias/ordenes-servicio.test.ts — costo
- tests/unitarias/pipeline-cotizacion-esquemas.test.ts — costo
- tests/unitarias/planeacion-esquemas.test.ts — costo
- tests/unitarias/produccion-area-operadores.test.ts — costo
- tests/unitarias/produccion-esquemas.test.ts — costo
- tests/unitarias/propuestas-costeo-fabricacion.test.ts — costo, margen
- tests/unitarias/propuestas-esquemas.test.ts — costo
- tests/unitarias/propuestas-items-revision-ui.test.ts — costo
- tests/unitarias/propuestas-pdf.test.ts — costo, margen
- tests/unitarias/propuestas-totales.test.ts — costo, margen
- tests/unitarias/propuestas-validacion-contenido.test.ts — costo
- tests/unitarias/propuestas-validar-contenido-accion.test.ts — costo
- tests/unitarias/propuestas-validar-faltantes-ui.test.ts — costo
- supabase/tests/a03_a04_ingreso_neto.test.sql — dashboard, obtener_metricas_dashboard_ejecutivo, rentabilidad, costo, margen
- supabase/tests/a07_a09_publicacion_identidad.test.sql — dashboard
- supabase/tests/a15_estimado_por_tarifa.test.sql — rentabilidad, costo
- supabase/tests/a20_prd09_avance_proceso.test.sql — margen
- supabase/tests/c3_1_items_por_revision.test.sql — costo
- supabase/tests/c3_3_costeo_ruteo.test.sql — costo
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql — costo
- supabase/tests/c6_1_materiales_costos.test.sql — costo
- supabase/tests/c6_2_consumo_sin_stock.test.sql — rentabilidad, costo
- supabase/tests/c6_3_rbac_legado_inventario.test.sql — costo
- supabase/tests/sii_b1_catalogos.test.sql — costo
- supabase/tests/sii_b3_rfq_consumidores.test.sql — dashboard, obtener_metricas_dashboard_ejecutivo, obtener_metricas_vendedor, obtener_metricas_pipeline_equipo
- supabase/tests/sii_b4_propuestas.test.sql — costo, margen
- supabase/tests/sii_b9_kpis.test.sql — rentabilidad, costo, margen