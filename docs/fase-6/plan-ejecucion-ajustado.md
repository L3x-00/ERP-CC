# Fase 6 — Planeación y capacidad por recurso

Estado: plan ajustado; todavía no implementado.

## Objetivo

Programar partidas de producción contra recursos reales de taller, medir su capacidad por día y turno, impedir colisiones de preparación/ejecución desde PostgreSQL y propagar los cambios sin refresco manual.

## Decisiones previas obligatorias

1. La unidad bloqueable será un **recurso de planeación**, no un texto libre de área o máquina. Un recurso representa una máquina concreta o un recurso virtual que ocupa toda un área, incluido trabajo externo.
2. `partidas_orden_produccion.maquina_asignada` se conserva como referencia histórica de Fase 5; no es una llave foránea ni fuente de capacidad. Una programación nueva exige `recurso_id` válido.
3. El estado global de `ordenes_produccion` no se reutiliza como candado de máquina. Una OP puede atravesar varios recursos; el candado pertenece a cada programación. La relación con el inicio de producción de Fase 7 se implementará mediante una RPC específica, no con actualizaciones directas de dos estados desconectados.
4. No se sembrarán capacidades ficticias. La migración puede crear el esquema vacío, pero antes de programar en producción se cargarán los recursos, turnos y horas reales aprobados por CC Manufacturing Group.

## Modelo recomendado

### Recursos y capacidad

Crear `public.recursos_planeacion` con identificador UUID, código único, área (`sheet_metal`, `taller`, `acabados`, `ext`), nombre, activo y marcas de tiempo. La capacidad normal se normalizará en `public.capacidades_recurso_turno` (`recurso_id`, turno, horas_capacidad) para no asumir que todos los turnos tienen las mismas horas. Las excepciones reales —mantenimiento, feriados o turno extra— se modelarán en una tabla de excepciones en la Sub-fase 6.2.

`public.programacion_areas` conserva el nombre propuesto, pero usará `recurso_id` en lugar de `maquina_id` textual. Mantendrá `orden_id`, `partida_id`, `secuencia`, fecha, turno, horas estimadas, prioridad, estado y auditoría. Un trigger comprobará que la partida pertenezca a la orden; las eliminaciones serán `RESTRICT` para conservar trazabilidad, y una cancelación se expresará por estado. Una restricción de partida/recurso y otra de partida/secuencia obligarán a reprogramar la misma fila en lugar de crear duplicados.

Los índices mínimos serán para calendario (`recurso_id`, `fecha_programada`, `turno`), partida y estados activos. Una restricción única parcial sobre `recurso_id` impedirá más de una programación en `en_preparacion` o `en_proceso` de forma atómica. Esto cubre máquinas individuales y recursos virtuales de área sin los errores de unicidad que producen los `NULL` en `maquina_id`.

### Estados y concurrencia

Los estados de programación serán `programada`, `en_preparacion`, `en_proceso`, `bloqueada`, `completada` y `cancelada`. `en_proceso` está presente porque la regla de candado original lo requiere; en Fase 6 solo se activa preparación. Fase 7 deberá llamar una RPC de toma de recurso para entrar en proceso y nunca actualizar este estado desde el cliente.

Programar, reprogramar y activar preparación serán RPCs de `service_role`. Cada una bloqueará el recurso con `FOR UPDATE`, validará capacidad y estado vigente, y usará la restricción única parcial como defensa de concurrencia. La reprogramación recibirá `actualizado_en` esperado para rechazar una pantalla obsoleta. Los errores públicos serán genéricos; los códigos de conflicto y referencias se conservarán únicamente en bitácora interna.

## Sub-fases ajustadas

### Gate 6.0 — Datos operativos

Antes de habilitar programación sobre datos reales, registrar la lista real de recursos: código, área, horas por turno, turnos habilitados y regla de trabajo externo. Es una decisión de negocio, no una suposición del código; no bloquea la creación segura del esquema vacío de 6.1.

### 6.1 — Esquema, permisos y contratos

- Crear recursos, capacidad por turno y programación con RLS, `recurso_id`, secuencia de proceso, integridad orden/partida, timestamps, restricciones e índices.
- Incorporar `ver_planeacion` y `gestionar_planeacion`; solo `service_role` escribe tablas de planeación. La lectura autenticada se limitará al permiso de visualización o administración.
- Publicar las tablas de planeación en Supabase Realtime, manteniendo RLS como filtro.
- Generar tipos Supabase, tipos de dominio, mappers puros y esquemas Zod v4 estrictos (`z.uuid()`, `z.iso.date()`, objetos `.strict()`).
- Cubrir validación, mappers y restricciones de relaciones. La fecha de migración será la que genere el CLI al crearla, nunca una fecha futura escrita manualmente.

### 6.2 — Motor transaccional de capacidad y preparación

- Implementar `programar_partida_recurso`, `reprogramar_partida_recurso`, `activar_modo_preparacion` y la consulta de carga por rango. Las acciones de aplicación consumirán estas RPCs; no insertarán ni actualizarán planificación directamente. La activación no aceptará un `usuarioId` controlado por cliente: la acción identifica al actor en servidor y audita allí la operación.
- Calcular capacidad por recurso, fecha y turno, incluyendo excepciones. Programaciones canceladas o completadas no consumen capacidad; preparaciones y ejecuciones sí.
- Validar capacidad dentro de la transacción, no desde cálculos previos en TypeScript. Dos solicitudes simultáneas que superen el límite deben permitir como máximo una.
- `activar_modo_preparacion` devolverá un código estable de recurso ocupado; el servicio registra el conflicto sin revelar a usuarios no autorizados el folio o ID de la otra orden.
- Mantener separada la asignación de operador existente de Fase 5. La interfaz de planeación reutilizará su acción segura; el comienzo real de trabajo seguirá exigiendo el operador asignado dentro de PostgreSQL.

### 6.3 — Acciones, permisos y estado de cliente

- Crear Server Actions con la secuencia `safeParse → can → servicio/RPC → registrarLog → respuesta normalizada`.
- El permiso de planeación sustituye el uso incorrecto de `aprobar_ordenes`.
- `usarTiendaPlaneacion` solo guarda filtros, rango de fechas y recurso seleccionado. TanStack Query conserva datos de servidor; Realtime invalida o refresca consultas. Zustand no será una copia mutable de programación ni de capacidad.
- Agregar integración para autorización, errores genéricos, auditoría y compare-and-set de reprogramación.

### 6.4 — Operación funcional y gate E2E

- Crear una vista funcional de calendario, formulario de asignación y estado de candados. No se usará la Skill UI/UX Pro Max ni se priorizará estética.
- Conectar Realtime para que calendario y candados reflejen mutaciones de otros usuarios sin recargar la página.
- E2E remoto efímero: crear recursos, OP y partidas de prueba; programar, activar preparación y comprobar que una segunda activación del mismo recurso queda rechazada. El cleanup debe borrar en orden y no tocar datos reales.

## Pruebas de aceptación mínimas

| Riesgo | Evidencia requerida |
| --- | --- |
| Partida ajena a la orden | Inserción/RPC rechazada en PostgreSQL. |
| Sobre-capacidad | Dos programaciones concurrentes que exceden el turno dejan una sola confirmada. |
| Recurso ocupado | Dos activaciones simultáneas dejan una sola programación activa. |
| Pantalla obsoleta | Reprogramación con `actualizado_en` anterior es rechazada. |
| Autorización | Un usuario sin `gestionar_planeacion` no llega a ejecutar RPC. |
| Tiempo real | Una mutación externa actualiza el calendario y el candado sin refresco manual. |
| Regresión | Typecheck, lint, unitarias, integración, build, E2E, auditoría de dependencias, `db lint`, asesores y migraciones sin drift. |

## Secuencia de implementación

La implementación se hará de una sub-fase por vez. Codex aplica migraciones y genera tipos; Claude Code recibe encargos pequeños y explícitos de implementación o revisión. Ninguna sub-fase pasa a la siguiente sin diff revisado, pruebas pertinentes y un handoff actualizado.
