# Matriz OBS-01…OBS-30 — correcciones y equivalencias (2026-09-19)

Estado real tras la campaña de cobertura. Leyenda de resultado: **completo** (probado),
**parcial probado** (parte verificada en E2E/runtime), **equivalencia** (otra solución cumple el
propósito), **pendiente** (con decisión y alcance en `pendientes-decision-2026-09-19.md`).

Evidencia base: suite E2E local **14/14** (`tests/e2e/*.spec.ts`), PGlite
`verificar-rfq0506-wiring` 12/12 · `verificar-ti-aprobacion-ar` 5/5 · `verificar-dashboard-ti` 7/7 ·
`verificar-fechas-cuenta-gasto` 7/7, unitarias **618/618**, typecheck/lint 0, build 17 rutas.

| OBS | Situación inicial | Solución / equivalencia | Archivos / pantallas | Prueba | Resultado |
|---|---|---|---|---|---|
| OBS-01 | KPIs sin navegación | Drill-down de aging: segmento → `/cobranza?aging=<slug>` con filtro visible | `dashboard/*`, `cobranza/*`, `aging-servicio` | unitarias de aging + matriz | **completo** |
| OBS-02 | Sin búsqueda de empresas/contactos en el alta | Selector de cliente con búsqueda RLS + alta rápida; una sola ficha en Clientes (no duplica al cambiar contacto) | `selector-cliente`, `alta-rapida-cliente`, `crear-prospecto` | E2E aceptacion-comercial (vincular cliente); unitarias selector | **parcial probado** — falta alta inline de un **contacto adicional** |
| OBS-03 | Solo "ya contactado" | Etapa + `fecha_ultimo_contacto` + RFQ-08: fecha de seguimiento editable (+3 hábiles) y vencimiento (+10) | `gestor-datos-solicitud`, `actualizar-datos-oportunidad` | 14/14 E2E; unitarias 618 | **parcial probado** — falta acción concreta/ responsable |
| OBS-04 | Descripción técnica sin condición interna/estación por solicitud | Línea con área de catálogo, procesos, externo, descuento y snapshot técnico reabrible | `formulario-cotizacion`, `guardar_cotizacion_atomica` | PGlite 12/12; E2E comercial | **parcial probado** — "varias solicitudes/partidas" = multilínea (equivalencia) |
| OBS-05 | Distribución no automática; sin subáreas | Partidas heredan área/procesos de la línea al aprobar (una sola orden, sin duplicar venta) | `aprobar_oportunidad_y_crear_orden` + UI | E2E comercial + PGlite | **equivalencia** — distribución por área al aprobar; subáreas pendientes (OBS-14) |
| OBS-06 | Planos solo en Comercial | Adjuntos múltiples con URL firmada; visor/descarga y subida desde el piso (permiso Producción + service_role, ruta validada por carpeta de la cotización) | `panel-adjuntos`, `panel-documentos-orden`, `obtener-url-documento-orden` | E2E aceptacion-comercial + unitarias | **implementado** - 21-sep (visor y subida en taller) |
| OBS-07 | Cotización sin vínculo visible | Sección Cotización en la oportunidad (editor modal) con calculadora y guardado en contexto | `editor-cotizacion`, `formulario-cotizacion` | E2E comercial (guardar/reabrir) | **completo** (sección propia de listado "Cotizaciones" no existe; equivalencia en ficha/pipeline) |
| OBS-08 | Etiqueta mínima en Planeación | Partida programable por etiqueta legible folio·pieza—descripción | `planeacion/*` | E2E planeación | **parcial probado** — falta material/desglose por proceso (PRD-16) |
| OBS-09 | Sin colas por área/operador | Backend fuerza asignación (`operador_asignado_id`); RPC rechazan ajenos | RPC producción + `produccion-piso` | E2E piso + PGlite | **parcial probado** — falta `areaId`/colas por área |
| OBS-10 | Parciales por pieza | Avances por partida/sesión + entrega parcial con nota persistida (fabricar ≠ entregar) | `registros_avance_partida`, `notas_entrega` | E2E piso (parcial/total) | **completo** |
| OBS-11 | Ficha sin enlaces ni notas de operador | Historial 360° por cliente (cotizaciones, órdenes, pagos); notas de entrega en historial | `historial-cliente`, `obtener-historial-cliente` | unitarias historial | **parcial probado** — sin enlaces a originales ni notas de sesión automáticas |
| OBS-12 | Sin inventario en la base | Consumo atómico por partida con kardex/CPP; variante con consumo previo descuenta solo la diferencia | `registrar_consumo_material_op` | E2E órdenes (consumo) | **equivalencia probada** (D-10) |
| OBS-13 | Sin documento de conformidad | Registro de nota (cantidades, parcial, recibido por) con documento imprimible y firmas de conformidad | `notas_entrega`, `NotaEntregaDocumentoBoton` | E2E piso | **implementado** - 21-sep (OBS-13/OBS-21) |
| OBS-14 | Áreas planas | Áreas configurables (código, color, externa) + botones de área en cotización | `areas_trabajo_config`, `pestana-areas` | E2E config/aceptación | **parcial probado** — subáreas/procesos pendientes; mapa explícito acordado en ADR |
| OBS-15 | Alta manual desconectada | Origen comercial (`aprobar_oportunidad_y_crear_orden`); alta manual queda como excepción administrativa | `ordenes/*` | E2E comercial + piso | **equivalencia probada** (excepción histórica por decisión D-01) |
| OBS-16 | Acciones dispersas | Transiciones reales con auditoría; Programada/En proceso distinguidas en filtros | `ordenes-servicio`, `tabla-ordenes` | E2E órdenes/piso | **completo** |
| OBS-17 | Sin comentarios en orden | Hilo por orden con autor/fecha, menciones y notificación en tiempo real | `comentarios/*` | E2E comentarios | **parcial probado** — hilo no visible en Producción |
| OBS-18 | Programar con formulario | Programación contextual por partida/recurso sin IDs internos; resumen y resultado en calendario | `planeacion/*` | E2E planeación | **parcial probado** — arrastre/semana-mes pendientes (PLA-01/02) |
| OBS-19 | Sin bloqueo real | Capacidad por recurso+turno con bloqueo transaccional al sobreasignar | RPC capacidad | E2E planeación + unitarias motor | **parcial probado** — alcance 8 h por operador/estación pendiente (D-02) |
| OBS-20 | Filtro por recurso | Flujo Bandeja→En proceso→Pausada→Lista→Entregada con sesiones y entrega condicionada | `produccion/*` | E2E piso + órdenes | **parcial probado** — filtro principal por área pendiente (PRD-02) |
| OBS-21 | Terminadas en cola activa | Entregada/completada se conserva con historial; no se archiva aún | `produccion/*` | E2E piso | **pendiente** — bandeja de archivo/entregas separada |
| OBS-22 | AR solo al completar | Divergencia intencional D-04: sin AR al aprobar; se crea al completar con partidas producidas | `abrir_cuenta_por_cobrar` | PGlite 5/5; E2E comercial | **equivalencia** (D-04) — visibilidad inmediata en borrador es decisión de negocio |
| OBS-23 | TC libre | MXN ⇒ TC 1 bloqueado; USD ⇒ TC positivo con equivalente mostrado | `modal-registrar-pago` | E2E cobranza (USD) | **completo** |
| OBS-24 | Sin cuenta de salida en gastos | Cuenta en cobros y **selector de cuenta en gastos** (enmascarado) listo; flujo neto por cuenta pendiente | `modal-registrar-gasto`, `obtener-cuentas-gasto` | E2E gastos + migración PGlite 7/7 | **parcial probado** — flujo por cuenta diseñado (siguiente paso) |
| OBS-25 | Sin saldo a favor visible | Monedero MXN: ficha con crédito, columna en Cobranza y aplicación identificada sin re-registrar ingreso | `movimientos_saldo_favor`, cobranza | E2E cobranza (sobrepago/crédito) | **completo** |
| OBS-26 | Sin comprobante | Recibo persistido imprimible por pago (folio, abonado, saldo, método) | `recibo-persistido` | E2E cobranza | **completo** |
| OBS-27 | Sin consolidado | No existe estado de cuenta multi-orden por cliente | — | — | **pendiente** (diseñado, app-only) |
| OBS-28 | Gasto sin cuenta/selector de orden | Cuenta de salida implementada; orden se captura por ID (sin selector legible) | `modal-registrar-gasto`, `registrar_gasto` | E2E gastos + PGlite | **parcial probado** — selector legible de orden pendiente |
| OBS-29 | Sin rentabilidad por orden | Motor por orden (venta neta − material real − mano de obra histórica − gastos) + panel | `obtener_rentabilidad_orden` | E2E gastos/rentabilidad | **parcial probado** — desglose por rubro/estación en UI pendiente |
| OBS-30 | Tarifas sin parámetros completos | Tarifas por estación en Configuración con efecto en cálculos nuevos e históricos congelados | `editor-tarifas-estaciones`, motor | unitarias cotizador; E2E config | **completo** |

## Capacidades conservadas (no se eliminó nada)
Cotizador técnico con snapshot, lectura DXF, EPS/AI manual, tiers y descuento por línea,
crédito (gate RFQ-16), seguimientos, adjuntos con URL firmada, sesiones por PIN, entregas
parciales, monedero/saldo a favor, bitácora durable, dashboard por rol y catálogos.
Los reemplazos por OBS se hicieron por equivalencia (OBS-05/12/15/22), no duplicando módulos.

## Decisiones pendientes (no inventadas)
Resueltas por el cliente en la segunda ronda (ver `decisiones-cliente-backlog.md`): D-02 (jornada
8 h + capacidad instalada, pendiente de implementar), D-04 (exigibilidad a la entrega con
anticipos, **implementada** 21-sep), OBS-21 (archivo al entregar, **implementado**), OBS-27 (solo
órdenes abiertas + días de cartera, **implementado**), OBS-28 (folio y cliente, **implementado**),
OBS-02/03 (ejemplos enviados; pendiente de respuesta).

## Dependencias que impiden comprobar
El OCR (GAS-08) requiere proveedor de IA (bloqueado en local); la concurrencia estricta no se
probó (solo sincronización multi-vista). Los documentos imprimibles (DOC-01/03, OBS-13/21/26/27)
y el visor de planos en taller (OBS-06/ORD-09) quedaron **implementados y verificados** (21-sep:
PGlite y E2E local 17/17).
