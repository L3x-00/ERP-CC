# APIs y contratos

ORCA no expone una API REST pública de negocio. La interfaz habla con el servidor mediante **React Server Components**, **Server Actions** y **RPCs de PostgreSQL**; todo pasa por sesión, permisos, validación Zod y auditoría.

## Superficie HTTP

| Ruta | Tipo | Uso |
| --- | --- | --- |
| `/api/produccion-piso/sincronizacion` | SSE (Node runtime) | Señal de cambios para terminales de piso; revalida sesión y no transporta filas, costos ni credenciales |
| `/api/webhooks/brevo` | Webhook POST | Eventos de correo transaccional; valida `BREVO_WEBHOOK_TOKEN` y falla cerrado |
| `/api/search` | GET | Búsqueda de la documentación en producto (Fumadocs) |

El resto de las mutaciones y lecturas privilegiadas son **Server Actions** (`use server`), invocadas desde componentes de cliente o RSC.

## Patrón de una Server Action

1. Zod valida la entrada (`src/modulos/*/validaciones`).
2. Se resuelve la sesión y se comprueba el permiso con `can()`.
3. Se llama al servicio o RPC con el cliente adecuado (SSR para RLS, admin para `service_role`).
4. Se registra auditoría con datos sensibles minimizados.
5. Los errores de negocio viajan como códigos; los detalles quedan en el log del servidor.

Ubicación: `src/modulos/<dominio>/acciones/*.ts`, exportadas desde el índice del módulo.

## Server Actions por dominio

| Dominio | Acciones representativas |
| --- | --- |
| Autenticación | `iniciarSesionAccion`, `validarPinAccion`, `iniciarVistaOperadorAccion`, `cerrarSesionAccion` |
| Permisos | `crearUsuarioAccion`, `cambiarRolUsuarioAccion`, `actualizarPermisosRolAccion`, `obtenerMatrizPermisosAccion` |
| Pipeline / RFQ | `crearProspectoAccion`, `marcarGanadaAccion`, `guardarItemRfqAccion`, `validarRfqListoAccion` |
| Propuestas | `crearPropuestaAccion`, `editarRuteoItemAccion`, `costearRuteoRevisionAccion`, `validarRevisionAccion`, `generarPdfRevisionAccion` |
| Clientes | `crearClienteAccion`, `actualizarClienteAccion`, `prepararDocumentoClienteAccion`, `vincularDesdePipelineAccion` |
| Inventario | `crearMaterialAccion`, `registrarEntradaAccion`, `registrarSalidaAccion`, `proponerCostoMaterialAccion` |
| Compras | `crearCompraAccion`, `cambiarEstadoCompraAccion`, `pagarCompraAccion` |
| Órdenes | `crearOrdenAccion`, `cambiarEstadoOrdenAccion`, `registrarAvancePartidaAccion`, `configurarMetasProcesoAccion`, `cerrarOrdenAdministrativaAccion` |
| Planeación | `programarPartidaRecursoAccion`, `reprogramarPartidaRecursoAccion`, `obtenerCalendarioPlaneacionAccion`, `activarModoPreparacionAccion` |
| Producción | `reclamarProcesoAccion`, `iniciarSesionOperadorAccion`, `cerrarSesionOperadorAccion`, `pausarSesionJornadaAccion`, `actualizarAvanceSesionAccion` (C20), `generarNotaEntregaAccion` |
| Entregas | `prepararEntregaAccion`, `registrarEntregaAccion`, `anularNotaEntregaAccion`, `firmarEvidenciaEntregaAccion` |
| Cobranza | `abrirCuentaPorCobrarAccion`, `registrarPagoAccion`, `aplicarSaldoFavorAccion`, `reversarPagoAccion` |
| Tesorería | `obtenerTesoreriaAccion`, `registrarTransferenciaAccion`, `conciliarMovimientoAccion` |
| Gastos | `registrarGastoAccion`, `procesarComprobanteOcrAccion`, `obtenerRentabilidadOrdenAccion` |
| Facturación | `crearFacturaBorradorAccion`, `emitirFacturaAccion`, `cancelarFacturaAccion` |
| Dashboard | `obtenerMetricasInicioAccion`, `cambiarPeriodoDashboardAccion` |
| Configuración | `actualizarTipoCambioAccion`, `guardarAreaTrabajoAccion`, `guardarOperadorAccion`, `actualizarAreasOperadorAccion` |
| Comentarios | `agregarComentarioAccion`, `obtenerNotificacionesAccion`, `marcarNotificacionesLeidasAccion` |

## RPCs de PostgreSQL

Las migraciones (`supabase/migrations/`) contienen alrededor de 188 funciones `public.*`. Las familias principales:

| Familia | RPCs clave |
| --- | --- |
| Folios atómicos | `generar_folio_op`, `generar_folio_orden`, `generar_folio_nota_entrega`, `generar_folio_recibo`, `generar_folio_gasto`, `generar_folio_cliente`, `generar_folio_cnc`, `generar_folio_inventario` |
| Órdenes y comercial | `aprobar_oportunidad_y_crear_orden`, `crear_orden_desde_revision`, `cambiar_estado_orden`, `ajustar_orden_post_aceptacion`, `cerrar_orden_administrativa` |
| Planeación / capacidad | `programar_partida_recurso`, `reprogramar_partida_recurso`, `obtener_carga_capacidad_diaria`, `liberar_preparacion_planeacion_auditada` |
| Horario laboral (C18) | `privado.jornada_laboral_dia`, `privado.horas_turno_horario_laboral`, `privado.obtener_jornada_recurso_turno` |
| Piso y operador | `reclamar_proceso_operador`, `mover_reclamo_operador`, `iniciar_sesion_trabajo_operador`, `cerrar_sesion_integrada`, `registrar_avance_partida_op`, `registrar_consumo_material_operador_op` |
| Cierre y avance (C20) | `registrar_hora_fin_sesion` (hora real opcional del cierre), `actualizar_avance_sesion_pausada` (corrige piezas y hora real de la pausa automática); `cerrar_sesion_trabajo_operador` usa `fecha_fin_declarada` si existe |
| Entregas (C19) | `generar_nota_entrega`, `registrar_entrega`, `anular_nota_entrega`, `archivar_orden_al_entregar` |
| Cobranza | `abrir_cuenta_por_cobrar`, `registrar_pago_ar_atomico`, `aplicar_saldo_favor_ar`, `registrar_cobro_multiple`, `anular_cuenta_por_cobrar` |
| Compras y gastos | `crear_compra`, `pagar_compra`, `registrar_gasto_a19`, `cambiar_estado_gasto`, `obtener_rentabilidad_orden` |
| Dashboard | `obtener_metricas_dashboard_ejecutivo`, `obtener_metricas_vendedor`, `obtener_metricas_pipeline_equipo`, `obtener_metricas_contador` |
| Configuración | `actualizar_configuracion_seccion`, `reemplazar_areas_operador`, `ajustar_continuidad_folio_periodico`, `guardar_operador_admin` |
| Comentarios | `procesar_menciones_comentario` y triggers de notificaciones |
| Inventario | `registrar_movimiento_inventario`, `ajustar_saldo_material`, `revaluar_costo_material_consumido` |

Todas las RPC sensibles son `SECURITY DEFINER`, fijan `search_path = ''`, revocan ejecución pública y se conceden solo a `service_role` o roles autorizados. La lista exacta y sus firmas están en las migraciones y en `src/compartido/tipos/supabase.ts`.

## Integraciones externas

| Integración | Dirección | Contrato |
| --- | --- | --- |
| Supabase Auth | App → Supabase | Sesión SSR por cookies; PIN de piso con cookie HMAC propia |
| Supabase Storage | App → Supabase | Buckets privados; URLs firmadas y confirmación de archivos |
| Supabase Realtime | Supabase → App | Invalidación de consultas bajo RLS; sin payload como fuente de datos |
| OpenRouter | App → OpenRouter | OCR de comprobantes con modelo de visión; respuesta validada con Zod |
| Brevo | App → Brevo | Correo transaccional (`/v3/smtp/email`) |
| Brevo webhook | Brevo → App | Eventos de entrega/rebote con token y comparación en tiempo constante |
| `@react-pdf/renderer` | App (servidor) | PDF de propuestas y documentos |

## Reglas de contrato

- Un error de negocio se identifica por código; nunca se expone el detalle interno ni la respuesta del proveedor.
- Los folios, saldos, capacidad y estados se resuelven en PostgreSQL dentro de una transacción; el cliente no calcula límites definitivos.
- Los importes financieros se capturan explícitamente; Producción y Planeación no inventan precios.
- Los documentos de producción no muestran precios.
- Las funciones de apoyo a RLS viven en el esquema `privado` y no son invocables desde el navegador.
