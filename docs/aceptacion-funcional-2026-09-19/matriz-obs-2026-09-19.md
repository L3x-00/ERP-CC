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
| OBS-02 | Sin búsqueda de empresas/contactos en el alta | Selector de cliente con búsqueda RLS + alta rápida + **contactos adicionales por cliente** (con principal único) en la ficha | `selector-cliente`, `panel-contactos`, `crear-contacto-cliente` | E2E clientes-contactos + aceptacion-comercial; PGlite 7/7 | **implementado** - 21-sep |
| OBS-03 | Solo "ya contactado" | Etapa + fechas RFQ-08 + **siguiente acción concreta** (`proximo_paso`) con responsable (vendedor asignado) y aviso de atraso | `gestor-datos-solicitud`, `actualizar-datos-oportunidad` | E2E aceptacion-comercial; unitarias contactos-seguimiento; PGlite 7/7 | **implementado** - 21-sep |
| OBS-04 | Descripción técnica sin condición interna/estación por solicitud | Línea con área de catálogo, procesos, externo, descuento, snapshot técnico reabrible y **equipo/estación** validado contra `recursos_planeacion` (heredado a la partida) | `formulario-cotizacion`, `guardar_cotizacion_atomica`, `aprobar_oportunidad_y_crear_orden` | E2E comercial (estación→`maquina_asignada`) | **implementado** - 21-sep (multilínea cubre "varias solicitudes") |
| OBS-05 | Distribución no automática; sin subáreas | Partidas heredan área/procesos de la línea al aprobar (una sola orden, sin duplicar venta) | `aprobar_oportunidad_y_crear_orden` + UI | E2E comercial + PGlite | **equivalencia** — distribución por área al aprobar; subáreas pendientes (OBS-14) |
| OBS-06 | Planos solo en Comercial | Adjuntos múltiples con URL firmada; visor/descarga y subida desde el piso (permiso Producción + service_role, ruta validada por carpeta de la cotización) | `panel-adjuntos`, `panel-documentos-orden`, `obtener-url-documento-orden` | E2E aceptacion-comercial + unitarias | **implementado** - 21-sep (visor y subida en taller) |
| OBS-07 | Cotización sin vínculo visible | Sección Cotización en la oportunidad (editor modal) con calculadora y guardado en contexto | `editor-cotizacion`, `formulario-cotizacion` | E2E comercial (guardar/reabrir) | **completo** (sección propia de listado "Cotizaciones" no existe; equivalencia en ficha/pipeline) |
| OBS-08 | Etiqueta mínima en Planeación | Partida programable por etiqueta legible folio·pieza—descripción | `planeacion/*` | E2E planeación | **implementado** — 21-sep: desglose de partida (material, procesos, avance, tiempo) en tarjeta y panel, con "Por definir" explícito |
| OBS-09 | Sin colas por área/operador | Modelo `operadores_areas` (N:M) con rechazo `operador_area_no_asignada` en asignación e inicio de sesión; cola por área en piso y filtro en tablero; área/estación/responsable visibles | `asignar_operador_a_partida_op`, `iniciar_sesion_trabajo_operador`, `control-piso-panel`, `tablero-produccion-servicio` | E2E taller-taxonomía | **implementado** - 21-sep |
| OBS-10 | Parciales por pieza | Avances por partida/sesión + entrega parcial con nota persistida (fabricar ≠ entregar) | `registros_avance_partida`, `notas_entrega` | E2E piso (parcial/total) | **completo** |
| OBS-11 | Ficha sin enlaces ni notas de operador | Historial 360° por cliente con **enlaces al original** (cotización → `/pipeline?oportunidad=`, orden → `/ordenes?ordenId=`) y **notas de taller automáticas** (cierre de sesión y registros de tiempo, interno, D-14) | `historial-cliente`, `obtener-notas-operativas-cliente` | E2E historial + unitarias | **implementado** - 21-sep |
| OBS-12 | Sin inventario en la base | Consumo atómico por partida con kardex/CPP; variante con consumo previo descuenta solo la diferencia | `registrar_consumo_material_op` | E2E órdenes (consumo) | **equivalencia probada** (D-10) |
| OBS-13 | Sin documento de conformidad | Registro de nota (cantidades, parcial, recibido por) con documento imprimible y firmas de conformidad | `notas_entrega`, `NotaEntregaDocumentoBoton` | E2E piso | **implementado** - 21-sep (OBS-13/OBS-21) |
| OBS-14 | Áreas planas | Catálogo jerárquico área/subárea/proceso (D-13) con `area_planeacion` para mapear a las 4 áreas macro; CRUD en Configuración y propagación a Comercial (select agrupado), Planeación (nombres) y Producción (cola por área) | `areas_trabajo_config`, `pestana-areas-trabajo`, `obtener-areas-trabajo` | E2E taller-taxonomía + unitarias | **implementado** - 21-sep (mapa por defecto Metal mecánica / Fabricación digital / Acabados / Externo; el cliente puede renombrar) |
| OBS-15 | Alta manual desconectada | Origen comercial (`aprobar_oportunidad_y_crear_orden`); alta manual queda como excepción administrativa | `ordenes/*` | E2E comercial + piso | **equivalencia probada** (excepción histórica por decisión D-01) |
| OBS-16 | Acciones dispersas | Transiciones reales con auditoría; Programada/En proceso distinguidas en filtros | `ordenes-servicio`, `tabla-ordenes` | E2E órdenes/piso | **completo** |
| OBS-17 | Sin comentarios en orden | Hilo por orden con autor/fecha, menciones y notificación en tiempo real, **visible también en Producción** (piso) | `comentarios/*`, `OperacionProduccion` | E2E comentarios + produccion-piso | **implementado** - 21-sep |
| OBS-18 | Programar con formulario | Programación contextual por partida/recurso sin IDs internos; resumen y resultado en calendario | `planeacion/*` | E2E planeación | **implementado** — 21-sep: resumen previo con capacidad, vistas día/semana/mes y arrastre con confirmación |
| OBS-19 | Sin bloqueo real | Capacidad por recurso+turno con bloqueo transaccional al sobreasignar | RPC capacidad | E2E planeación + unitarias motor | **implementado** — 21-sep: bloqueo verificado en E2E y propuesta de siguiente día hábil con hueco confirmable (D-02 equipos×jornada) |
| OBS-20 | Filtro por recurso | Área como filtro principal en el tablero (y en el piso del operador) manteniendo estado como información; flujo Bandeja→En proceso→Pausada→Lista→Entregada con sesiones y entrega condicionada | `produccion/*` | E2E taller-taxonomía + piso + órdenes | **implementado** - 21-sep (filtro por área añadido; el flujo ya estaba probado) |
| OBS-21 | Terminadas en cola activa | Entregada/completada se conserva con historial; no se archiva aún | `produccion/*` | E2E piso | **pendiente** — bandeja de archivo/entregas separada |
| OBS-22 | AR solo al completar | Divergencia intencional D-04: sin AR al aprobar; se crea al completar con partidas producidas | `abrir_cuenta_por_cobrar` | PGlite 5/5; E2E comercial | **equivalencia** (D-04) — visibilidad inmediata en borrador es decisión de negocio |
| OBS-23 | TC libre | MXN ⇒ TC 1 bloqueado; USD ⇒ TC positivo con equivalente mostrado | `modal-registrar-pago` | E2E cobranza (USD) | **completo** |
| OBS-24 | Sin cuenta de salida en gastos | Cuenta en cobros y **selector de cuenta en gastos** (enmascarado) listo; flujo neto por cuenta pendiente | `modal-registrar-gasto`, `obtener-cuentas-gasto` | E2E gastos + migración PGlite 7/7 | **parcial probado** — flujo por cuenta diseñado (siguiente paso) |
| OBS-25 | Sin saldo a favor visible | Monedero MXN: ficha con crédito, columna en Cobranza y aplicación identificada sin re-registrar ingreso | `movimientos_saldo_favor`, cobranza | E2E cobranza (sobrepago/crédito) | **completo** |
| OBS-26 | Sin comprobante | Recibo persistido imprimible por pago (folio, abonado, saldo, método) | `recibo-persistido` | E2E cobranza | **completo** |
| OBS-27 | Sin consolidado | No existe estado de cuenta multi-orden por cliente | — | — | **pendiente** (diseñado, app-only) |
| OBS-28 | Gasto sin cuenta/selector de orden | Cuenta de salida implementada; orden se captura por ID (sin selector legible) | `modal-registrar-gasto`, `registrar_gasto` | E2E gastos + PGlite | **parcial probado** — selector legible de orden pendiente |
| OBS-29 | Sin rentabilidad por orden | Motor por orden (venta neta − material real − mano de obra histórica − gastos) + panel, con desglose por estación/rubro y anti-duplicado (material/nómina no suman dos veces) | `obtener_rentabilidad_orden`, `obtener_desglose_rentabilidad_orden`, `tarjeta-rentabilidad-orden` | E2E gastos/rentabilidad + unitarias | **implementado** - 21-sep |
| OBS-30 | Tarifas sin parámetros completos | Tarifas por estación en Configuración con efecto en cálculos nuevos e históricos congelados | `editor-tarifas-estaciones`, motor | unitarias cotizador; E2E config | **completo** |

## Capacidades conservadas (no se eliminó nada)
Cotizador técnico con snapshot, lectura DXF, EPS/AI manual, tiers y descuento por línea,
crédito (gate RFQ-16), seguimientos, adjuntos con URL firmada, sesiones por PIN, entregas
parciales, monedero/saldo a favor, bitácora durable, dashboard por rol y catálogos.
Los reemplazos por OBS se hicieron por equivalencia (OBS-05/12/15/22), no duplicando módulos.

## Decisiones pendientes (no inventadas)
Resueltas por el cliente en la segunda ronda (ver `decisiones-cliente-backlog.md`): D-02 (jornada
8 h + capacidad instalada, **implementada** 21-sep), D-04 (exigibilidad a la entrega con
anticipos, **implementada** 21-sep), OBS-21 (archivo al entregar, **implementado**), OBS-27 (solo
órdenes abiertas + días de cartera, **implementado**), OBS-28 (folio y cliente, **implementado**),
OBS-02/03 (ejemplos entregados e **implementados** 21-sep: contactos adicionales + próxima acción concreta).
## Dependencias que impiden comprobar

Resueltas al 21-sep: el OCR (GAS-08) tiene E2E con stub local y override solo-loopback; la
concurrencia estricta se probó con dos conexiones reales (aprobación/pago/consumo) y el CI de E2E
quedó definido (`.github/workflows/ci.yml` + provisionador portable). Los documentos imprimibles
(DOC-01/03, OBS-13/21/26/27) y el visor de planos en taller (OBS-06/ORD-09) ya estaban
implementados y verificados. **No quedan dependencias abiertas de la matriz OBS.**
