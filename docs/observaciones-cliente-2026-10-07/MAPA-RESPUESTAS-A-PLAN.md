# Mapa interno: respuesta del cliente → qué cambia en el plan (NO enviar al cliente)

Fuente de preguntas: `PREGUNTAS-CLIENTE-2026-10-14.md`. Cuando el PO pegue las respuestas, aplicar **solo** lo indicado aquí, registrar cada respuesta en `DECISIONES-ACEPTADAS.md` («Refinamientos posteriores», fecha y autor PO) y actualizar la ficha de la tanda afectada. «Default del plan» = lo que los planes asumieron; **no se usa sin autorización expresa del PO** si el cliente no responde (regla: sin suposiciones).

Tandas: C8.1–C8.4 = Órdenes · C9.1–C9.4 = Planeación · C10.1–C10.4 = Finanzas (numeración de cada `PLAN-*-RESUMEN.md`).

| ID | Bloquea | Default del plan | Si responde distinto → cambio |
|---|---|---|---|
| O-01 | C8.4 (R12/R13) | A: RPC igual; UI deshabilita con texto de faltante | **B/C:** migración que redefine `cerrar_orden_administrativa` (y revisar trigger de archivo/AR y KPIs) + pgTAP; C añade permiso, motivo y auditoría; sale de «ajustar» → tanda propia |
| O-02 | C8.4 | RPC exige PRODUCCION_COMPLETADA | **Sí:** relajar la condición de estado en la RPC (migración) |
| O-03 | C8.1 (R15) | Retirar UI + Server Action; RPC `repetir_orden_op` y pgTAP se conservan | **B/C:** mover «Nueva orden basada en…» a la ficha; B exige RPC nueva o parámetro que omita precios/AR (migración); mostrar «Basada en: folio» |
| O-04 | C8.3 (R17), C8.4 (R16) | Sin sembrar `ver_finanzas`; admin asigna por matriz | Migración de datos en `permisos_rol` (idempotente) para los puestos indicados; evaluar permiso nuevo `orden_ver_totales`; **afecta RLS de Cobranza/gastos/compras/tesorería si se toca `ver_finanzas`** |
| O-05 | C8.3 (R17) | Hoja solo en ficha (roles con `orden_vista`); piso por Producción | **A/C:** extender el camino de Producción/PIN para imprimir la hoja (sesión PIN, pertenencia a la Orden); definir observaciones y enlaces firmados |
| O-06 | C8.2 (R06) | Compromiso comercial | **B/C:** `obtener-entregas.ts` y KPIs de OTD usan fecha operativa (hoy ordena por espejo del compromiso); revisar `sii_b9_kpis` |
| O-07 | C8.1 | Retirar sin reemplazo | **No:** abrir tanda de «Crear retrabajo» (fuera de C8) |
| O-08 | C8.4 (R11) | RPC admite parciales con orden EN_PRODUCCION | **No:** RPC `registrar_entrega` exige PRODUCCION_COMPLETADA (migración) y oculta «Preparar entrega» antes |
| O-09 | C8.4 | Exacto (RPC topa por producido y solicitado) | **Tolerancia:** parámetro/regla en `registrar_entrega` y `calcularSaldoEntrega` (migración) |
| O-10 | C8.4 (R13) | Avance = producción + `etiquetaEntrega` | Cambiar texto/ubicación de la etiqueta; si Avance combinado: ajustar `resumen-ordenes.ts` |
| O-11 | C8.2 (R05) | «Referencia migrada» solo con `idHistorico` | Si OP-###### no es migrado: mostrar «Folio» también para ellos; ajustar regla de rótulo |
| O-12 | C8.3 (R09) | Derivar en lectura; mapa de tipos defensivo (`-` por defecto) | Cambiar lista de tipos/heurística de extensión; origen «Orden» |
| O-13 | C8.2 (R10) | Fase 1 (etiquetas) sin SQL | **Sí:** migración de triggers `derivar_orden_*` (planificada, producción iniciada/completada), cancelación y entrega; escalonar marcas (Glob) |
| O-14 | C8.2/C8.3 | Totales solo en Documento | **Resumen:** exponer `totales` en la ficha solo con `ver_finanzas` |
| P-01 | C9.1/C9.2 (diseño) | A: unidad partida × recurso; sin columna proceso | **B:** rediseño: programar por operación (nueva entidad o columna `proceso`/operación en `programacion_areas`, RPC, Producción `iniciar_sesion_trabajo_operador`, avance por proceso, capacidad); **fuera de «ajustar»: tanda propia antes de C9.2** |
| P-02 | C9.2 (P09) | A: avisar + bloqueo RPC | **B:** migración en dos RPC (`programar/reprogramar_partida_recurso`) + wrappers, GRANT por firma; toca `finalizar_sesion`; contradice OBS-19 |
| P-03 | C9.3 (P13/P14/P15) | A: acotada, sin migración (requiere aceptación expresa antes de cerrar C9.3) | **B:** migración `obtener_carga_capacidad_diaria` (DROP+CREATE, columna `horas_exceso`) + tipos UTF-8; pausa que libera: descontar horas (misma función) |
| P-04 | C9.2 (P10) | Solo advertir por grupo en UI | **Impedir:** migración `recurso_incompatible` en ambas RPC; `cantidad_equipos > 1` simultáneas ⇒ revisar índice único parcial por recurso |
| P-05 | C9.3 (P08) | Quien programa = actor del evento (sin columna) | **B:** migración aditiva `programado_por`/`responsable_id` + UI |
| P-06 | C9.1 (P03) | 70/90/100 mapeado a 3 niveles | Cambiar umbrales en `capacidad-servicio.ts` y mapeo |
| P-07 | C9.1 (P01) | Lun–Vie, suma de turnos, libre = max(0, …) | Ajustar `construirMatrizCargaSemanal` |
| P-08 | C9.1 (P05) | Enlace a `/ordenes/{id}` (tras C8.1) | Resumen en Planeación = componente nuevo (más alcance) |
| P-09 | C9.1/C8.1 | Quedan Liberar y Bandeja | Retirar/dejar otras acciones; **coordinar con C8.1** (tarjeta compartida) |
| P-10 | C9.1 (P03) | Ocultar | Dejar visibles |
| P-11 | C9.4 (P18) | Se mantienen | Retirar `proponer-hueco-reprogramacion` y sugerencias de la bolsa (reubicar antes de retirar; E2E `planeacion-bolsa-acciones`) |
| F-01 | C10.2 (F03/F05) | C: una sola fuente por Orden | **A:** simplifica (siempre consumo); **B:** real = compra recibida (cambia comportamiento actual de la tarjeta) |
| F-02 | C10.1/C10.2 | comprometido = CONFIRMADA+RECIBIDA+PAGADA; real = RECIBIDA+PAGADA | Cambiar filtros de estado en las RPC nuevas |
| F-03 | C10.3 (F12) | A: documentar limitación + pgTAP | **A (varias facturas):** corte propio: `facturas.cuenta_id`, relajar `ux_cuentas_factura`/`cuenta_ya_facturada`, folio denormalizado, `registrar_factura_ar`; **antes de C10.3**; riesgo alto en Cobranza |
| F-04 | C10.2 (F04) | Snapshot de la Orden | **B:** base = `monto_subtotal` de la AR (RPC de conciliación) |
| F-05 | C10.1/C10.2 | Mapeo propuesto en la tabla | Ajustar mapeo categoría→rubro en RPC y TS; subcontratación estimada ⇒ nueva categoría en costeo de Propuesta (alcance mayor) |
| F-06 | C10.4 (F10) | Horas × tarifa si existe | **B:** mostrar solo horas reales; Fabricación real «pendiente» |
| F-07 | C10.2 (F01) | Solo en Gastos (selector de Orden) | **B:** pestaña en la ficha tras C8.3, con gate `ver_finanzas` y proyección por lista blanca |
| F-08 | C10.1 (F11) | Dashboard y TI a subtotal; históricos recalculados | Limitar al periodo nuevo (corte por fecha) o no tocar dashboard |
| F-09 | C10.1 (F06/F09) | RPC `asignar_rubro_costo_compra`, sin default silencioso | **Default a material:** backfill automático (riesgo de mala clasificación) |
| F-10 | C10.1 (F08) | Capturar datos; propuesta DC-13 diferible | Solo capturar ⇒ omitir conexión DC-13 |
| F-11 | C10.4 | Diferido | Tanda aparte: columna `origen` en gastos + permiso + motivo obligatorio |
| F-12 | C10.3 (F13) | Sin cambio | **No permitir:** guarda en `cancelar_factura` (migración) |
| F-13 | C10.3 (F14) | Se queda y se rotula | Retirar sección y servicio de flujo por cuenta de Cobranza (reubicar antes de retirar) |
| F-14 | C10.3 (F16) | Excluir cobros reversados del saldo | Mostrar contramovimiento en `obtener-tesoreria.ts` |

## Registro de respuestas (el PO completa al recibirlas)

> 2026-10-15: respuestas del cliente registradas (39). Resumen de impacto y tandas revisadas: `PLAN-REVISADO-RESPUESTAS-2026-10-15.md`. Pendiente: registrarlas en `DECISIONES-ACEPTADAS.md` («Refinamientos posteriores») cuando el PO lo autorice (D5).

| ID | Respuesta del cliente | Fecha | Quién la dio | Aplicada en |
|---|---|---|---|---|
| O-01 | A: no se cierra hasta resolver las faltantes; scrap ≠ entrega | 2026-10-15 | Cliente (pegado por el PO) | C8.4 (= default) |
| O-02 | No: Producción debe terminar primero | 2026-10-15 | Cliente (pegado por el PO) | C8.4 (= default) |
| O-03 | B: nueva orden basada en la anterior; sin precios ni CxC; no en legacy durante el MVP | 2026-10-15 | Cliente (pegado por el PO) | C8.6 nueva (C8.1 retiró Repetir) |
| O-04 | Customer Service/Administrative/Management/Admin ven precios, totales y documento; Operator no; todos ven la hoja; costo y margen solo Management/Admin | 2026-10-15 | Cliente (pegado por el PO) | C8.2b, C8.3, C8.4 (decisión D1: mapeo a roles y permiso nuevo) |
| O-05 | C: Operador y Planeación/Gerencia ven/imprimen la hoja; observaciones de ítem + orden; archivos se abren/descargan | 2026-10-15 | Cliente (pegado por el PO) | C8.3 |
| O-06 | A: puntualidad contra el compromiso comercial; mostrar ambas fechas | 2026-10-15 | Cliente (pegado por el PO) | C8.2b |
| O-07 | Sí: retirar Reactivar | 2026-10-15 | Cliente (pegado por el PO) | C8.1 (hecho) |
| O-08 | No: primero Producción completada, luego entregas | 2026-10-15 | Cliente (pegado por el PO) | C8.4 (migración) |
| O-09 | Sí: entregas exactas | 2026-10-15 | Cliente (pegado por el PO) | C8.4 (= default) |
| O-10 | Sí: Avance = Producción + estado de entrega aparte (Pendiente / Parcial 30/50 / Completa) | 2026-10-15 | Cliente (pegado por el PO) | C8.4 (= default) |
| O-11 | Sí: OP-###### = «Folio anterior»; nuevas = O-MMYY_XX | 2026-10-15 | Cliente (pegado por el PO) | C8.2b (ajusta C8.2) |
| O-12 | Sí, mostrando origen, ítem/tipo, nombre original y nombre ERP; ocultar retirados/no vigentes | 2026-10-15 | Cliente (pegado por el PO) | C8.3 |
| O-13 | Sí, antes de Producción: Planificada, Liberada/Lista, Producción iniciada/completada, Cancelada, Entregada | 2026-10-15 | Cliente (pegado por el PO) | C8.5 nueva (SQL) |
| O-14 | Totales también en Resumen para roles autorizados; Operator nunca desde backend | 2026-10-15 | Cliente (pegado por el PO) | C8.2 (Totales siguen en Resumen) + C8.2b |
| P-01 | B, indispensable MVP: programar por operación | 2026-10-15 | Cliente (pegado por el PO) | C9.0 nueva (decisión D2) |
| P-02 | A: mostrar exceso en horas y no permitir guardar | 2026-10-15 | Cliente (pegado por el PO) | C9.2 (= default) |
| P-03 | B: capacidad con horas reales (libera sobrante, refleja exceso); pausa sigue ocupando hasta liberación formal manual | 2026-10-15 | Cliente (pegado por el PO) | C9.3 (migración) |
| P-04 | Sí (por grupo) / Impedir fuera de grupo / Sí (simultáneas de máquinas distintas) | 2026-10-15 | Cliente (pegado por el PO) | C9.2 (migración) |
| P-05 | A: responsable = quien captura (automático) | 2026-10-15 | Cliente (pegado por el PO) | C9.3 (= default) |
| P-06 | Semáforo 70/100 con umbrales configurables | 2026-10-15 | Cliente (pegado por el PO) | C9.1 |
| P-07 | No hardcodear lun-vie/sábado: turnos configurados por recurso/día | 2026-10-15 | Cliente (pegado por el PO) | C9.1 |
| P-08 | Clic en bloque: resumen rápido en Planeación + botón Abrir orden | 2026-10-15 | Cliente (pegado por el PO) | C9.1 |
| P-09 | Sí: Planeación conserva Liberar/Bandeja | 2026-10-15 | Cliente (pegado por el PO) | C9.1 (= default) |
| P-10 | Ocultar Avance; NO ocultar Tiempo estimado | 2026-10-15 | Cliente (pegado por el PO) | C9.1 |
| P-11 | Sí: buscar hueco/sugerencia se mantiene; el usuario confirma | 2026-10-15 | Cliente (pegado por el PO) | C9.4 (= default) |
| F-01 | A: Material real = consumo real de Producción; la compra no se suma | 2026-10-15 | Cliente (pegado por el PO) | C10.2 |
| F-02 | Comprometido al confirmar; real = recepción + costo confirmado; pagada sin recibir no cuenta; servicio al recibirse/aceptarse | 2026-10-15 | Cliente (pegado por el PO) | C10.1/C10.2 |
| F-03 | A: una factura por entrega (MVP) | 2026-10-15 | Cliente (pegado por el PO) | C10.2b nueva |
| F-04 | Estimado = propuesta aceptada sin IVA; real = venta facturada sin IVA | 2026-10-15 | Cliente (pegado por el PO) | C10.2 |
| F-05 | Tabla de clasificación aceptada; subcontratación debe poder estimarse | 2026-10-15 | Cliente (pegado por el PO) | C10.1/C10.2 |
| F-06 | B: horas estimadas/reales/variación; costo de fabricación real pendiente | 2026-10-15 | Cliente (pegado por el PO) | C10.4 (= default) |
| F-07 | B: Gastos y rentabilidad + pestaña Costos en la Orden (permisos financieros) | 2026-10-15 | Cliente (pegado por el PO) | C10.2 |
| F-08 | Sí: sin IVA en Dashboard y TI; recalcular históricos documentando | 2026-10-15 | Cliente (pegado por el PO) | C10.1 (= default) |
| F-09 | Sí: compras históricas sin categoría se clasifican a mano | 2026-10-15 | Cliente (pegado por el PO) | C10.1 (= default) |
| F-10 | Sí: capturar material/cantidad/unidad/costo; proponer actualizar último costo y confirmar | 2026-10-15 | Cliente (pegado por el PO) | C10.1 (= default) |
| F-11 | Posponer ajuste manual del costo real | 2026-10-15 | Cliente (pegado por el PO) | C10.4 (= default) |
| F-12 | No cancelar factura con cobros aplicados | 2026-10-15 | Cliente (pegado por el PO) | C10.3 (migración) |
| F-13 | Retirar «Flujo por cuenta» de Cobranza | 2026-10-15 | Cliente (pegado por el PO) | C10.3 |
| F-14 | Mostrar cobro original y su reverso; no borrar | 2026-10-15 | Cliente (pegado por el PO) | C10.3 |
