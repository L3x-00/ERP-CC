# Plan revisado tras las respuestas del cliente (2026-10-15)

> Documento para el PO. Fuente: «Respuestas funcionales – Órdenes, Planeación y Finanzas» (15-oct-2026), pegadas por el PO. Las fichas de `fichas-de-tanda/` se escribieron con los **defaults** del plan; donde la respuesta difiere, **manda la respuesta** (cada ficha afectada lleva una línea «Ver PLAN-REVISADO» en este documento, no se reescriben). Estado de ejecución: `CHECKPOINT-EJECUCION.md`.

## 1. Resumen
- **Fusionadas:** C8.1 (PR #63) y C8.2 (PR #64). Las 39 preguntas están respondidas: **ya no hay bloqueos por falta de respuesta**.
- **Coinciden con el default (sin cambio de plan):** O-01 A, O-02 No, O-07 Sí, O-09 Sí, O-10 Sí, P-02 A, P-05 (quien captura), P-09 Sí, P-11 Sí, F-06 B, F-08 Sí, F-09 Sí, F-10 Sí, F-11 posponer.
- **Difieren del default (cambian alcance, SQL o tandas): 25 respuestas** → tabla §2. Efecto neto: **12 tandas → 17** (5 nuevas; 10 llevan migración de esquema y 2 más datos/configuración, frente a 2 tandas con SQL en el plan original) y varias fichas con más alcance.
- **Hallazgo nuevo (defecto, no estaba en el plan):** la puntualidad (`comparativa-ordenes.ts:58`, `resumen-ordenes.ts:29`) y la columna «Compromiso» de la cola usan `fecha_compromiso`, que es un **espejo de la fecha operativa** (trigger `c4_2`). El cliente (O-06 A) exige medir contra el **compromiso comercial**. La proyección operativa (`COLUMNAS_ORDEN_OPERATIVA`) ni siquiera trae `fecha_compromiso_comercial`. El **Dashboard** (RPC de métricas: «atrasadas» y «por vencer», `20261007120004`) filtra igual por `fecha_compromiso`: su corrección es SQL y se incluye en la migración de C8.4.

## 2. Respuestas que difieren del default (qué cambia)
| ID | Respuesta del cliente | Default del plan | Efecto |
|---|---|---|---|
| O-03 | **B**: «Nueva orden basada en la anterior» (folio nuevo, referencia a la original, copia técnica, **sin precios ni CxC**; no en órdenes legacy en el MVP) | A: retirar (lo hizo C8.1) | **Tanda nueva C8.6** + RPC nueva (la actual copia precio y CxC) + «Basada en: folio» en la ficha |
| O-04 | Customer Service, Administrative, Management y Admin ven precios/totales y documento comercial; **Operator no**. Todos ven hoja de trabajo. Costo interno y margen solo Management/Admin | Sin sembrar `ver_finanzas` | Hoy `ver_finanzas` = admin + contador y abre Cobranza/Gastos/Compras/Tesorería. Propuesta: **permiso nuevo `orden_ver_totales`** (+ migración de datos en `permisos_rol`) → C8.3/C8.4. **Requiere mapear puestos → roles del sistema** (D1) |
| O-05 | **C**: Operador **y** Planeación/Gerencia consultan/imprimen la hoja; observaciones de ítem **y** orden; archivos se abren/descargan | Hoja solo en ficha | C8.3 crece: camino de **Producción con PIN** para ver/imprimir la hoja sin precios + enlaces firmados |
| O-06 | **A**: puntualidad vs **compromiso comercial**; mostrar ambas fechas | «Compromiso comercial» (supuesto cumplido) | **Defecto real** (ver §1) → tanda **C8.2b** (TS, sin SQL) |
| O-08 | **No** al parcial con orden EN_PRODUCCION: primero Producción completada, luego entregas | RPC admite parciales en EN_PRODUCCION | `registrar_entrega` hoy acepta EN_PRODUCCION y PRODUCCION_COMPLETADA (B7:380) → **migración** + ocultar «Preparar entrega» antes (C8.4). Cambia E2E/flujos |
| O-11 | «Folio anterior» para OP-######; «Folio: O-MMYY_XX» para las nuevas | «Folio» para todos + «Referencia migrada» | Ajuste del rótulo implementado en C8.2 → **C8.2b** |
| O-12 | Archivos vivos: origen, ítem/tipo, nombre original y nombre ERP; ocultar retirados/no vigentes | Mapa de tipos defensivo | Detalle de C8.3 (R09) |
| O-13 | **Sí, antes de Producción**: eventos Planificada, Liberada/Lista, Producción iniciada/completada, Cancelada, Entregada | Fase 1 (solo etiquetas) | R10 Fase 2 = **tanda nueva C8.5** con migración de triggers (R10 deja de ser «parcial») |
| O-14 | Subtotal/descuento/IVA/total **también en Resumen** para roles autorizados; Operator nunca desde backend | Solo en Documento | **Coincide con lo que quedó** (Totales siguen en Resumen con permiso). La puerta pasa de `ver_finanzas` al permiso de O-04 |
| P-01 | **B**, indispensable para el MVP: programar por **operación** (cada proceso con su recurso, fecha, turno y horas) | A: ítem × recurso | **Tanda nueva C9.0** con SQL (cambio estructural; toca Producción). El cliente exige consultar antes (D2) |
| P-03 | **B**: la capacidad se ajusta con horas reales (libera sobrante, refleja exceso); pausa sigue ocupando hasta liberación formal manual; conservar estimado histórico | A: acotada, sin SQL | **Migración** `obtener_carga_capacidad_diaria` (+`horas_exceso`) y liberación formal (C9.3) |
| P-04 | Compatibilidad **por grupo**, **impedir** fuera de grupo, máquinas distintas del grupo en simultáneo | Solo advertir | **Migración** `recurso_incompatible` en ambas RPC de programación (C9.2) |
| P-06 | Semáforo 70/100, **umbrales configurables** | Constantes en código | Configuración (tabla/ajuste) en C9.1 |
| P-07 | **No hardcodear lun-vie/sábado**: capacidad según turnos configurados por recurso/día | Lun-Vie | Matriz semanal derivada de `capacidades_recurso_turno` (C9.1) |
| P-08 | Clic en bloque: **resumen rápido dentro de Planeación + botón «Abrir orden»** | Enlace a la ficha | Componente nuevo en C9.1 |
| P-10 | Ocultar Avance, **NO** ocultar Tiempo estimado | Ocultar ambos | Ajuste menor en C9.1 |
| F-01 | **A**: Material real = **consumo real de Producción**; la compra no se suma | C: una fuente por Orden | Simplifica C10.2 (siempre consumo × costo unitario congelado) |
| F-02 | Comprometido al **confirmar** compra; real = recepción + costo confirmado; **pagada sin recibir NO es real**; servicio real al recibirse/aceptarse | CONFIRMADA+RECIBIDA+PAGADA / RECIBIDA+PAGADA | Filtros de estado en las RPC nuevas (C10.1/C10.2) |
| F-03 | **A**: una factura por entrega; la CxC se factura parcialmente (consolidar después) | A: documentar la limitación | **Tanda nueva C10.2b**, riesgo alto en Cobranza (`facturas.cuenta_id`, relajar `ux_cuentas_factura`, folio, `registrar_factura_ar`) |
| F-04 | Margen estimado = **propuesta aceptada** sin IVA; real = **venta facturada** sin IVA | Snapshot de la Orden | Base mixta en C10.2 (real depende de C10.2b) |
| F-05 | Subcontratación **debe poder estimarse** | Mapeo propuesto | Nueva categoría en el costeo de Propuesta (alcance mayor, C10.1) |
| F-07 | **B**: en Gastos y rentabilidad **y** pestaña «Costos» en la Orden (solo permisos financieros) | A: solo Gastos | Pestaña nueva tras C8.3, con proyección por lista blanca (C10.2) |
| F-12 | **No** cancelar factura con cobros aplicados | Sin cambio | Guarda en `cancelar_factura` (**migración**, C10.3) |
| F-13 | **Retirar** «Flujo por cuenta» de Cobranza (es de Tesorería) | Se queda rotulado | Retiro con reubicación previa (C10.3) |
| F-14 | Al reversar un cobro: **mostrar original y reverso**, nunca borrar | Excluir del saldo | Cambio en `obtener-tesoreria.ts` (C10.3) |

## 3. Tandas revisadas (17)
| # | Tanda | Alcance | Esf. | SQL | Estado |
|---|---|---|---|---|---|
| 1 | C8.1 | Cola mínima y ficha como destino | L | no | ✅ PR #63 |
| 2 | C8.2 | Folio, origen comercial, actividad sin datos técnicos | M | no | ✅ PR #64 |
| 3 | **C8.2b** *(nueva)* | Fechas (puntualidad, atrasadas y cola vs compromiso comercial; mostrar ambas) y «Folio anterior». El permiso de totales de O-04 va en C8.3/C8.4 (depende de D1) | S | no | **Siguiente** (sin decisiones pendientes) |
| 4a | **C8.3a** | Permiso `orden_ver_totales` (O-04, aprobado D1), procesos resumidos (R07), Ruta como tabla (R08), columnas explícitas de partidas (R18) | M | **sí (permiso)** | En curso |
| 4b ▶ | **C8.3b** | Archivos vivos con origen, ítem/tipo, nombre original y nombre ERP (O-12) + hoja de trabajo sin precios en la ficha (R17, observaciones de ítem y orden) | M | no | Tras C8.3a |
| 4c | **C8.3c** | Hoja de trabajo del operador en Producción con PIN (O-05 C) | M | no | Tras C8.3b |
| 5 | C8.4 | Entrega/cierre: O-01 A, O-02, **O-08 No (SQL)**, O-09, O-10, documento comercial por permiso, y **Dashboard «atrasadas/por vencer» contra el compromiso comercial (SQL)** | M | **sí** | Necesita D1 |
| 6 | **C8.5** *(nueva)* | Eventos de negocio de la Orden (O-13) | M | **sí** | Lista |
| 7 | **C9.0** *(nueva)* | **Programar por operación** (P-01 B) | XL | **sí** | Necesita D2 |
| 8 | C9.1 | Carga semanal, semáforo configurable (P-06), turnos (P-07), resumen rápido (P-08), P-10 | M | config | Tras C9.0 |
| 9 | C9.2 | Pendientes visibles, **impedir** incompatibles (P-04), sobrecapacidad (P-02 A) | M | **sí** | Tras C9.1 |
| 10 | C9.3 | Horas reales ajustan capacidad (P-03 B), liberación formal, historial | M | **sí** | Tras C9.2 |
| 11 | C9.4 | Estados simples, Producción sin recaptura, aceptación | S | no | Tras C9.3 |
| 12 | **C8.6** *(nueva)* | Nueva orden basada en la anterior (O-03 B) | M | **sí** | Lista (no legacy) |
| 13 | C10.1 | Costo sin IVA, Compras como fuente, subcontratación estimable (F-05), F-08/F-09/F-10 | L | **2** | Lista |
| 14 | C10.2 | Conciliación Estimado/Comprometido/Real (F-01 A, F-02, F-04) + pestaña Costos (F-07 B) | L | **1** | Tras C10.1 y C8.3 |
| 15 | **C10.2b** *(nueva)* | Facturación por entrega (F-03 A) | L | **sí, riesgo alto** | Tras C10.2 |
| 16 | C10.3 | F-12, F-13, F-14, saldos de Tesorería | M | **sí** | Tras C10.2b |
| 17 | C10.4 | Aceptación punta a punta | S | no | Al final |

**Orden recomendado:** C8.2b → C8.3a → C8.3b → C8.3c → C8.4 → C8.5 → C9.0 → C9.1 → C9.2 → C9.3 → C9.4 → C8.6 → C10.1 → C10.2 → C10.2b → C10.3 → C10.4. Finanzas (C10.x) es independiente de Planeación: puede intercalarse si C9.0 espera decisiones. Las migraciones las aplica el PO en remoto (marca de tiempo al crear cada archivo; `supabase migration list` antes y después).

**Presupuesto de uso:** C8.1+C8.2 costaron ~8 puntos de la ventana semanal (63 %→72 %). Quedan ~26 puntos hasta el 98 % y el reinicio es el 2026-10-20 04:00: alcanza para ~6 tandas M. El resto cae en la semana siguiente.

## 4. Decisiones que necesito del PO
1. **D1 — puestos → roles del sistema (O-04).** El sistema tiene 5 roles: `admin`, `vendedor`, `gerente`, `operador`, `contador`. Propuesta: Customer Service = `vendedor`, Administrative = `contador`, Management = `gerente`, Operator = `operador`, Admin = `admin`; y **permiso nuevo `orden_ver_totales`** (en vez de dar `ver_finanzas` a vendedor/gerente, que abriría Cobranza, Gastos, Compras y Tesorería). Costo interno y margen quedan en `gerente` + `admin`.
2. **D2 — P-01 B (programar por operación) como tanda propia C9.0.** Es un cambio estructural (no es «ajustar»): el cliente dice que es indispensable para el MVP y pide consultar si algo lo contradice. Propuesta de mínimo cambio: columna **aditiva** (nullable) que ligue cada fila de `programacion_areas` a su proceso del ruteo (`metas_proceso_partida`), RPC de programar/reprogramar con operación, y las sesiones de Producción (que ya referencian `programacion_id`) quedan por operación. Las filas existentes siguen válidas. Antes de codificar haría el diseño en una ficha y te lo muestro.
3. **D3 — confirmar las tandas nuevas** C8.5 (eventos), C8.6 (nueva orden basada en la anterior) y C10.2b (factura por entrega), todas con SQL.
4. **D4 — O-08 No** cambia el comportamiento: no se podrá entregar mientras la orden esté EN_PRODUCCION. Confirmar que es lo deseado (rompe el flujo parcial actual y varios E2E que se migrarán).
5. **D5 — `DECISIONES-ACEPTADAS.md`:** ¿registro estas respuestas (y los defaults de C8.1/C8.2) en «Refinamientos posteriores» mediante un PR de solo docs?

## 5. Reglas críticas del cliente (se verifican en cada tanda)
No invertir Compromiso comercial → Planeación → Fecha operativa · programar por operación · Tiempo estimado visible en Planeación · scrap no es entrega · cierre administrativo = Producción completada + 100 % entregado · Material real no suma Compra + Consumo · margen siempre sin IVA · Estimado/Comprometido/Real distintos · Operator sin precios/costos/margen desde backend · sin borrar historial financiero (reversos y cancelaciones trazables).
