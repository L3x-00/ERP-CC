# Síntesis provisional — Revisión funcional de Órdenes (nota del cliente, 2026-10-13)

> **Estado:** investigación **9/9 áreas verificadas** (un lector + un revisor escéptico independiente por área). Falta la fase transversal (impacto entre módulos, BD, pruebas, pre-mortem), el plan formal y la crítica; corren tras el reinicio del límite de uso (11:39) y pueden **ajustar** esta propuesta de tandas.
> **Nada de código tocado.** Detalle por requisito con archivo y línea: `hallazgos/HALLAZGOS-wf_302166f5-203.md`. Algunas citas se conservaron del lector sin releer (marcadas en `limitaciones` de ese informe).
> Escrito para: el PO (decide tandas y las decisiones D1–D10).

## 1. Estado real de los 20 requisitos

| ID | Qué pide el cliente | Hoy (verificado) | Cambio mínimo | Migración | Esf. |
|---|---|---|---|---|---|
| R01 | Cola: Folio, Estado, Prioridad, Compromiso, Partidas, Avance | **Cumple** (columnas y señales de atención existen). El Avance es solo de producción | Ninguno; candado con prueba | no | XS |
| R02 | Una sola acción en la cola | **Contradice**: 9 controles por fila; la ficha no tiene Comentarios ni Adjuntos | Reubicar primero (Comentarios y Adjuntos a la ficha; `/ordenes?ordenId=` redirige a la ficha: 5 enlaces profundos lo usan), luego dejar Abrir + 1 acción contextual | no | M |
| R03 | Ocultar IDs técnicos | **Parcial**: «Origen (snapshot)» vuelca claves crudas con UUID (solo con `ver_finanzas`); Actividad pinta `evento.tipo` crudo y `recurso_id` | Campos nombrados; etiquetas en Actividad; no mostrar `recurso_id` | no | S |
| R04 | Origen con folios humanos y enlaces | **Parcial**: sin enlaces y atado a `ver_finanzas` | Proyección segura del snapshot con folios RFQ / Propuesta / Revisión para todos los roles; enlace solo si `can()` | no | S |
| R05 | «Folio: O-MMYY_XX», no «Folio legacy» | **Contradice**: tarjeta fija «Folio legacy» (l.303) y textos en l.309, 335 y 526 | `folioSii ?? folio` rotulado «Folio»; «Referencia migrada» solo con `idHistorico`/`referenciaExterna` | no | XS |
| R06 | Compromiso ≠ fecha operativa | **Cumple** (BD: columna inmutable, RPC con motivo y evento) | Candado con prueba. No hay botón de reprogramar en la ficha (solo Planeación) | no | XS |
| R07 | Procesos sin duplicar | **Parcial**: «Láser CO₂ · Láser CO₂» | Helper puro `resumirProcesos` → «Láser CO₂ (2 operaciones)». Un test de Planeación fija el `join` actual | no | XS |
| R08 | Ruta estructurada | **Parcial**: lista `<ol>` «setup/run», sin Estado, y vacía sin `ver_finanzas` | Tabla # / Proceso / Prep. / Operación / Estado (Estado «Pendiente» fijo hasta que Producción registre por operación) | no | M |
| R09 | Archivos vivos con origen / asociación / tipo | **Parcial**: ids congelados sin duplicar blobs (bien); faltan las 3 columnas; los archivos RFQ por ítem se ven «generales» | Derivar de `entidad`, `clase`, `revision_letra` en lectura | no | S |
| R10 | Actividad = eventos de negocio | **Parcial**: ya separada de Comentarios; faltan eventos (planificada, producción iniciada/completada, cancelación, entrega) y etiquetas | Fase 1: diccionario de etiquetas (sin migración). Fase 2 opcional: migración que emite los eventos | solo Fase 2 | S |
| R11 | Preparar entrega + entregas parciales | **Cumple**: la RPC admite parciales (orden EN_PRODUCCION o PRODUCCION_COMPLETADA) y topa contra producido y solicitado | Ninguno | no | XS |
| R12 | Cierre solo con 100 % entregado | **Parcial**: la RPC ya exige producción completada **y** entregado ≥ solicitado; la UI deja pulsar el botón y falla | Deshabilitar el botón con «Faltan N por entregar» (ficha y cola) | no | S |
| R13 | Producción completada ≠ Orden cerrada | **Parcial**: 50/50 producido y 30/50 entregado se ve «Producción completada» al 100 % verde | Etiqueta derivada «Pendiente de entrega» / «Entrega parcial X/Y» (solo presentación) | no | S |
| R14 | Reactivar fuera | **Contradice**: existe en la cola **y** en la tarjeta de Planeación | Retirar la UI en ambos sitios; acción y RPC dormidas (o con guarda en servidor, D1) | no | S |
| R15 | Repetir = nueva Orden | **Parcial**: la RPC ya crea una Orden **nueva** con folio propio y `orden_origen_id`; ninguna UI muestra el origen | Mantener la RPC; la ficha de la nueva muestra «Basada en: folio»; el botón sale de la cola (D2) | no | S |
| R16 | Documento con subtotal / descuento / IVA / total para roles autorizados | **Parcial**: existe, pero `ver_finanzas` solo lo tienen admin y contador; **Gerente (Management) no**; Customer Service no tiene ni `orden_vista` | Decisión del PO (D5); si se concede, migración de datos idempotente en `permisos_rol` | sí (datos) | XS |
| R17 | Vista/hoja para Operator sin precios | **Ausente**: no hay hoja de trabajo; sin `ver_finanzas` la ficha pierde ruta, archivos, material y espesor | Hoja de trabajo con lista blanca de campos (DTO, nunca spread) | no | M |
| R18 | Restricción también en backend | **Cumple**: `snapshot_json` solo con `ver_finanzas`; privilegios por columna (C4.3); la cola usa columnas operativas | Pruebas RED/estáticas que lo fijen **antes** de ampliar proyecciones | no | S |
| R19 | Cada pestaña responde su pregunta | **Parcial**: los 7 rótulos ya coinciden con los del cliente; falta la pregunta / microcopy | Constante `PREGUNTAS_PESTANA` + subtítulo bajo las pestañas (testids intactos) | no | S |
| R20 | Guardarraíles y 12 criterios | **Parcial** | Registrar CLI-15, Corte 8 con los 12 criterios como casillas y refinamientos sobre DC-10 / PRD-15 / CLI-08 (matriz vieja) | no | S |

## 2. Hallazgo estructural (explica 4 requisitos a la vez)

La ficha solo carga `snapshot_json` cuando el usuario tiene `ver_finanzas`, y los folios de origen, la ruta, los archivos, el material y el espesor viven **solo ahí**. Un operador o Customer Service sin `ver_finanzas` ve Ruta y Archivos vacíos (R04, R08, R09, R17).
**Solución única y mínima:** una proyección de servidor con lista blanca (origen con folios, ruta sin tarifas ni costos, archivos, material/espesor) para todos los roles; finanzas solo con `ver_finanzas`. Orden de trabajo: primero el candado de pruebas (R18), después las proyecciones. Así se evita el bucle típico «ampliar lectura → fuga de precios → corregir».

## 3. Propuesta preliminar de 4 tandas de 5 (un PR por tanda; Corte 8 = C8.1–C8.4)

| Tanda | Tema | Requisitos | Migraciones |
|---|---|---|---|
| **C8.1** | Ficha segura y legible: sin IDs, origen con folios, fechas, candado de confidencialidad | R03, R04, R05, R06, R18 | ninguna |
| **C8.2** | Contenido operativo de la ficha: Ítems, Ruta, Archivos, Actividad y hoja del operador | R07, R08, R09, R10, R17 | ninguna (Fase 2 de R10 opcional: 1 migración de triggers) |
| **C8.3** | Cola simplificada y acciones ambiguas (reubicar → retirar), pestañas con su pregunta | R01, R02, R14, R15, R19 | ninguna |
| **C8.4** | Entrega, cierre, permisos del documento y aceptación | R11, R12, R13, R16, R20 | 1 de datos (permisos), solo si el PO concede `ver_finanzas` |

Por qué este orden: C8.1 crea la proyección segura y el candado; C8.2 la reutiliza; C8.3 necesita la ficha lista para «reubicar antes de retirar»; C8.4 toca reglas de negocio y permisos con efecto en otros módulos (Cobranza, KPIs). **T1–T3 no requieren que apliques nada en remoto.**

## 4. Decisiones que necesito del PO (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | Reactivar: ¿solo retirar UI, o además bloquear la acción en servidor? (reverso de PRD-15) | Retirar UI en cola y Planeación **y** guarda en servidor «no disponible en el MVP» (reversible con una línea); RPC intacta |
| D2 | Repetir: ya crea una Orden nueva con folio y origen, pero copia precios y crea AR. ¿Se mantiene (movido a la ficha como «Nueva orden basada en…») o se deshabilita en el MVP como sugiere el cliente? ¿Se permite sobre órdenes heredadas? | Retirar el botón de la cola ahora; decidir su reubicación con el cliente (conservador, sin riesgo) |
| D3 | Cierre: hoy exige producción completada **y** 100 % entregado. ¿Se mide contra lo solicitado o lo producido? ¿Qué pasa con el scrap (puede dejar la orden sin poder cerrarse)? ¿Se puede cerrar desde EN_PRODUCCION? | Mantener la RPC; solo UI. Regla de scrap = pregunta al cliente antes de C8.4 |
| D4 | Comentarios en la ficha: ¿8.ª pestaña o sección? | 8.ª pestaña «Comentarios» (la nota pide Actividad separada de Comentarios) |
| D5 | ¿Gerente (Management) debe tener `ver_finanzas`? Afecta RLS de Cobranza, gastos, facturación, compras, tesorería y KPIs. ¿Customer Service ve el documento con totales o uno comercial sin costos? | No decidir por defecto: confirmar con el cliente; no mezclar con C8.1–C8.3 |
| D6 | Hoja del operador: ¿la imprime el operador en piso (sesión PIN), Planeación o el gerente? ¿Qué observaciones ve? ¿Archivos como enlaces firmados o solo nombre/tipo/asociación? | Solo lectura en la ficha para quien tenga `orden_vista`; piso con PIN en una segunda fase |
| D7 | Actividad Fase 2 (eventos faltantes por trigger): ¿antes de Producción o basta el diccionario? | Fase 1 ahora; Fase 2 como migración aparte, antes de arrancar Producción |
| D8 | ¿Totales en Resumen o solo en Documento para quien tiene `ver_finanzas`? | Dejarlo como está (el cliente no lo pidió) |
| D9 | Archivos: ¿mostrar adjuntos propios de la Orden como Origen=Orden? ¿ocultar los retirados de la propuesta? ¿nombre original o normalizado? | Sí a ambos; nombre original |
| D10 | Avance en la cola: ¿solo producción o también entrega? | Producción como hoy + etiqueta de entrega (R13) |

## 5. Hallazgos extra (no se tocan sin tu OK)

- **Alta:** Gerente (Management) sin `ver_finanzas` en la matriz por defecto (D5).
- **Media:** archivos retirados de la propuesta quedan congelados en la Orden · «callejón» del cierre con scrap · Entregas usa `fecha_compromiso` espejo (KPI OTD) · varios canales de adjuntos propios de la Orden sin unificar · la matriz de cobertura 164 quedó obsoleta frente a A20.
- **Baja:** botón Comentarios de la cola sin `data-testid` · Documento duplicado en cola y ficha · clase de archivo sin catálogo único · etiquetas «setup/run» en inglés · fixture con `folioSii` inválido · rama redundante en `cerrar_orden_administrativa`.

## 6. Qué falta y cuándo corre

- Fase transversal (impacto por módulo, BD/migraciones/RLS, inventario de pruebas, pre-mortem de bucles de error) + plan formal en 4 tandas + crítico + plan final: `Workflow` sin `hastaOla` con `resumeFromRunId: wf_302166f5-203` (las 9 áreas vuelven del journal). Aviso programado a las 11:46; si la sesión se cierra, una sesión nueva recibe sola la orden de reanudar (`checkpoint-activo.json`).
- Registro formal de decisiones (CLI-15, Corte 8, refinamientos sobre DC-10 / PRD-15 / CLI-08 vieja): solo con tu autorización.
