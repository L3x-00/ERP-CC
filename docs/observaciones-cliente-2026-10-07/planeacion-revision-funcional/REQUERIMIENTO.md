# Requerimiento — Revisión funcional del módulo Planeación y Capacidad (nota del cliente, relevada por el PO el 2026-10-14)

> Fase: **requerimiento normalizado** (aún sin investigar el código). Mismo método que Órdenes (`../ordenes-revision-funcional/`): requerimiento → estado real verificado → cambio mínimo → impacto entre módulos → plan en 4 tandas de 5 → el PO aprueba → ejecución.
> Regla del PO: **ajustar, no rehacer**; MVP para la propia empresa del cliente; oleadas de agentes (no simultáneos sin resultado); reutilizar; **coherencia entre los cambios** (incluida la coherencia con el plan de Órdenes).
> Escrito para: el PO.

## 1. Principio del cliente

Propuesta = ruteo estimado y horas · Orden = congela lo aceptado · **Planeación = solo acomoda operaciones en recurso / fecha / turno** · Producción = registra lo real. Planeación **no es un APS**: su pregunta central es *«¿cuántas horas tiene ocupadas cada equipo y cuánto espacio queda esta semana?»*. El calendario se conserva; la **capacidad pasa a ser el dato central**.

## 2. Requisitos atómicos P01–P20 y agrupación hipotética (Corte 9)

| Tanda | ID | Sec. | Requisito |
|---|---|---|---|
| **C9.1 Capacidad como dato central (pantalla)** | P01 | 5, 6, 13 | Vista de **carga semanal por equipo/recurso**: horas ocupadas / capacidad por día (Lun–Vie) y capacidad libre semanal; como resumen superior o vista alterna, coexistiendo con el calendario |
| | P02 | 5 | **Semana** como vista principal (Día / Semana / Mes se mantienen); se mantienen filtros de fecha, recurso y estado; **Área** pierde protagonismo si recurso/grupo ya identifica el equipo |
| | P03 | 12 | Semáforo accesible **disponible / cerca de límite / sobrecargado** acompañado de horas y texto (no solo color); capacidad antes que filtros secundarios; sin métricas de Producción ni Finanzas; densa pero legible |
| | P04 | 5 | Cada bloque programado muestra **Orden, Ítem, Proceso y horas estimadas** |
| | P05 | 5 | **Clic en un bloque** abre el contexto de la operación / orden |
| **C9.2 Programación operativa y validaciones** | P06 | 3 | Ver **operaciones pendientes por programar** |
| | P07 | 3, 13 | Asignar una operación a un **recurso/máquina compatible**, **fecha** y **turno** |
| | P08 | 7 | Datos mínimos de una programación: Orden, Ítem, Operación/proceso, Grupo de equipo, Recurso, Fecha, Turno, Horas estimadas, Estado, Responsable, Historial |
| | P09 | 3, 9, 13 | **Advertir sobrecapacidad** del turno/recurso **antes de guardar** |
| | P10 | 3, 9 | Bloqueos básicos por recurso: no permitir dos operaciones incompatibles simultáneas en la misma máquina; compatibilidad recurso–proceso |
| **C9.3 Reprogramación y estimado vs real** | P11 | 3, 9, 13 | **Mover / reprogramar con historial** (quién, cuándo, motivo) |
| | P12 | 9, 13 | Reprogramar **no cambia el compromiso comercial** de la Orden (la fecha operativa sí, con historial) y la planificación **no modifica el ruteo estimado** heredado de la Propuesta |
| | P13 | 8, 11 | Separación **estimado vs real**: la capacidad se calcula con horas estimadas programadas; lo real (Producción) no altera retroactivamente el estimado original |
| | P14 | 3, 8, 13 | La capacidad se **actualiza** cuando una operación termina antes o después de lo estimado (libera remanente / refleja el exceso) |
| | P15 | 9 | Una **pausa prolongada** por material/aclaración puede liberar el recurso según la regla ya definida |
| **C9.4 Estados, Producción, alcance y aceptación** | P16 | 10 | Estados simples de programación: Programada, En preparación, En proceso, Bloqueada, Completada, Cancelada (los existentes bastan) |
| | P17 | 13 | **Producción consume la programación** sin duplicar captura |
| | P18 | 4, 13 | Guardarraíl: **no APS / MRP / optimización**: sin secuenciación automática avanzada, ruteo óptimo, dependencias complejas, simulación, multi-planta |
| | P19 | (PO) | **Coherencia con Órdenes y Producción**: contratos compartidos sin choques con el plan de Órdenes (§4) |
| | P20 | 13, 14 | Aceptación: los 9 criterios de la nota evidenciados |

Los 9 criterios de aceptación del cliente: P01 (vista semanal ocupada/disponible), P07 (asignar a recurso/fecha/turno), P09 (conflicto antes de guardar), P11 (reprogramar con historial), P12 (compromiso y ruteo intactos), P14 (capacidad al terminar), P18 (sin APS/MRP), P17 (Producción sin duplicar captura). *(P12 cubre dos criterios.)*

## 3. Pistas de partida (a verificar, no son hallazgos)

- Ya hay (según el cierre de septiembre): vistas día/semana/mes, resumen previo a guardar con capacidad, arrastre con confirmación bajo CAS, propuesta de siguiente día hábil con hueco, bolsa de planeación, capacidad instalada equipos × jornada con override (D-02), `UNIQUE(partida_id, recurso_id)` en `programacion_areas`.
- **Verificado por la investigación de Órdenes:** la tarjeta de Planeación (`acciones-tarjeta-orden.tsx`) trae el botón **Reactivar**; `planeacion/utilidades/desglose.ts` une los procesos con `join` y un test lo fija; las RPC `programacion_inicial` y `reprogramacion_operativa` ya dejan evento en `orden_eventos_cambio`; los triggers `derivar_orden_planificada / en_produccion / completada` mueven el estado de la Orden sin dejar evento.
- Riesgo de sobreingeniería a revisar contra P18: la «propuesta de hueco» automática y las sugerencias de la bolsa.

## 4. Puntos de coherencia con Órdenes (C8.1–C8.4) — decidir una sola regla

| Superficie compartida | Órdenes (plan) | Planeación | Regla propuesta |
|---|---|---|---|
| `acciones-tarjeta-orden.tsx` | R14 retira Reactivar (cola **y** tarjeta de Planeación) | P05 abre contexto; P16 estados | Quien llegue primero edita; el otro se rebasa. Reactivar se retira **una sola vez** (C8.3) |
| Resumen de procesos | R07 helper `resumirProcesos` en `ordenes/utilidades` | P04 muestra Proceso por bloque | Un único helper; Planeación lo consume **después** de C8.2; el test que fija el `join` se actualiza en el mismo corte |
| Fecha operativa vs compromiso | R06 cumple (BD inmutable + RPC con motivo) | P11, P12 | Planeación solo usa la RPC existente; una sola prueba de «compromiso intacto» |
| Eventos de Actividad | R10 etiquetas + fase 2 (eventos faltantes) | P11 historial, P16 estados | El diccionario de etiquetas incluye los eventos que escribe Planeación; fase 2 no se duplica |
| Estados | R13 etiqueta derivada de entrega | P16 estados de programación | Estados de **programación** ≠ estados SII de la **Orden**: no se mezclan; los triggers `derivar_orden_*` no se rompen |
| Horas estimadas / ruteo | R08 tabla de Ruta (Prep./Operación) | P04, P13 | Misma fuente (ruteo congelado en la Orden); Planeación no la modifica |
| Confidencialidad | R17/R18 (sin precios para operador) | P03 sin métricas de Finanzas | Los payloads de Planeación llevan **horas**, nunca importes |

## 5. Diseño de la investigación (barato y secuencial)

1. **Mapa estático sin modelo** del módulo (`MAPA-MODULO.md`: archivos, exports, RPC, tablas, testids, importadores, pruebas, migraciones) generado por script; todos los lectores lo leen primero → no re-descubren.
2. **6 áreas en 2 oleadas de 3** (lector → escéptico, esfuerzo medio, ~40 herramientas por agente): `carga-semanal` (P01, P03) · `pantalla` (P02, P04, P05) · `programacion` (P06–P10) · `reprogramacion` (P11–P13, P15) · `estados-produccion` (P14, P16, P17) · `alcance-coherencia` (P18–P20 + trazabilidad documental).
3. Fase final: impacto entre módulos · BD/RLS · pre-mortem de bucles · **coherencia con el plan de Órdenes** → plan en 4 tandas → crítico → plan final.
4. Orden de la cola de trabajo (una sola cosa activa a la vez, cada paso con sonda de uso): ver `../COLA-DE-TRABAJO.md`.

Nada de código se toca hasta que apruebes el plan (Órdenes y Planeación por separado).
