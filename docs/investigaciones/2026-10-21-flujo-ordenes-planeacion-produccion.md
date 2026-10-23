# Investigación: flujo Órdenes → Planeación → Producción

**Qué sobra, qué pidió el cliente y qué hay que decidir antes de ajustar**
Fecha: 2026-10-21 · Alcance: Órdenes, Planeación y Producción · Tipo: solo investigación (no se modificó código ni base de datos).

## 1. Conclusión

1. **Lo que se pide ahora** (venta confirmada → pasa sola a Producción → un operario la elige; sin cola de programación) va con el espíritu del documento original del cliente: captura única, «control sin micromanagement», «no trasladar burocracia al usuario» y **posponer la planificación sofisticada**.
2. **Pero contradice las respuestas que el cliente firmó el 14 y 15 de octubre para Planeación.** Ahí pidió explícitamente programar:
   - P06 «ver operaciones pendientes por programar».
   - P07 «asignar a recurso, fecha y turno», que además es criterio de aceptación.
   - P-01 B: programar por operación, «indispensable para el MVP».
   - P-11: «no habrá programación automática».
   - P-09: conservar «Liberar» y «Bandeja».
   - P17: Producción consume la programación.

   El formulario «Programar partida» existe por esas respuestas. Antes de retirarlo hay que registrar el cambio de decisión (§7).
3. Hoy, entre la venta y el primer registro de un operario, hay **cinco pasos manuales obligatorios**. Uno de ellos (asignar el operario a la partida) **no tiene pantalla**, así que una orden nueva no le aparece a ningún operario.
4. Además hay funciones **sin respaldo en la documentación**: pantallas que no se usan, dos caminos para producir y dos caminos para entregar (uno salta una regla del cliente). Se pueden retirar sin afectar al cliente, decida lo que decida sobre la programación (§5).

## 2. Fuentes revisadas

| Fuente | Qué dice sobre este flujo |
|---|---|
| `docs/ERP_SII_Handoff_Tecnico_Funcional.md` (documento del cliente) | Flujo Órdenes → Planeación → Producción → Calidad → Entregas (§4). Estados de la orden: Confirmado → Planificado → Listo → En producción → Producción completada → Cerrada (§11.2). «La Orden no se inicia manualmente; se libera a producción y su estado deriva del avance» (§11.3). Reglas de piso y calidad (§12). Go Live 3 = «ejecución por equipo, iniciar/pausar/continuar/terminar, piezas, tiempo real y bloqueo por máquina» (§16.3). **Postergar «capacidad instalada y planificación sofisticada»** (§16.5). Principios: captura única, control sin micromanagement, «no trasladar burocracia al usuario» (§3, §23). |
| `docs/plan-erp-sii/05-orden-trabajo.md` y `06-produccion.md` | Así se interpretó: «Planificada» cuando todas las partidas tienen programación («definición revisable por PO»); «Lista» con la acción manual **Liberar**; «En producción» con la primera sesión; corridas como unidad de ejecución. |
| `observaciones-cliente-2026-10-07/planeacion-revision-funcional/REQUERIMIENTO.md` (nota del cliente, 14-oct) | «Planeación = **solo acomoda operaciones en recurso / fecha / turno**… no es un APS». P01–P20, con P06/P07 (programar), P09 (avisar sobrecapacidad), P11 (reprogramar con historial), P17 (Producción consume la programación sin recaptura) y P18 (sin APS). |
| `observaciones-cliente-2026-10-07/PLAN-REVISADO-RESPUESTAS-2026-10-15.md` (respuestas del cliente) | P-01 **B** (programar por operación, indispensable), P-02 A, P-03 B, P-04 impedir fuera de grupo, P-05 responsable = quien captura, P-09 Sí (Liberar y Bandeja), P-11 Sí (sin programación automática). |
| `observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md` | DC-09: la aceptación crea la orden; si falla queda «Orden pendiente». DC-10: la orden permite prioridad, fecha operativa, recurso y notas con historial. DC-11: «ver como operador» es solo lectura. |
| Imágenes del PO (2026-10-21) | Flujo resumido 1–6. Incluyen un paso de Planeación: «asigna fecha, recurso y secuencia» y «selecciona órdenes liberadas y las asigna al día y al equipo». La indicación escrita, en cambio, pide que la orden **no** pase por una cola de programación. |

## 3. Flujo actual verificado: de la venta al operario

| # | Paso | ¿Manual? | Qué lo exige (evidencia) |
|---|---|---|---|
| 1 | **Aceptar la versión** de la propuesta (Propuestas). La orden se crea **sola**; si el crédito o el cliente lo impiden, queda «Orden pendiente» con reintento. | Manual (decisión comercial, requerido) | `supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql:877-898` (solicitud durable + orden automática) |
| 2 | **Programar cada operación de cada partida** en Planeación (partida, operación, recurso, fecha, turno, horas, prioridad). La orden pasa a «Planificada» solo cuando **todas** sus partidas tienen programación. | **Manual** | `20261007120002_sii_b5_orden_estados.sql:412-456` |
| 2a | En ese formulario las **horas se vuelven a escribir** aunque el ruteo de la propuesta ya las trae. | Recaptura | `src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx:144-145` (vacías en altas) y `:446-452` (al elegir la partida solo se fija operación y secuencia) |
| 3 | **Liberar** la orden (ficha de la orden o tarjeta de Planeación). Exige programación completa, ruteo y archivos vigentes. | **Manual** (permiso `orden_liberar`) | `20261007120002_sii_b5_orden_estados.sql:31-125`. **Ojo:** iniciar producción no exige «Lista», porque acepta el estado interno `programada`, que cubre Planificada y Lista (`20261007120001_sii_b5_orden_base.sql:168-171`, `20261007130002_sii_b6_produccion_acciones.sql:589-596`). Es un paso manual que no condiciona nada. |
| 4 | **«Iniciar preparación»** de cada programación (Planeación). Sin esto el operario no puede arrancar. | **Manual** | Botón en `panel-asignacion-planeacion.tsx:700-708`; función `20260813205005_fase_6_motor_capacidad.sql:428-520`; condición al iniciar `20261007130002_sii_b6_produccion_acciones.sql:621-623` |
| 5 | **Asignar el operario a la partida.** Es obligatorio para que el operario la vea (`src/modulos/ordenes/servicios/ordenes-servicio.ts:561-563`) y para que pueda iniciar (`20261007130002_sii_b6_produccion_acciones.sql:585-587`). | **Manual sin pantalla** | La acción `src/modulos/ordenes/acciones/asignar-operador-partida.ts` existe desde el 2026-08-12 (commit `138a4a3`) y **ningún componente la usa**. En la demo y en las pruebas se asigna directo en la base (`supabase/semillas/demo-cliente.mjs:967`). |
| 6 | **El operario produce.** Hay **dos pantallas distintas**: | — | — |
| 6a | Terminal de piso `/produccion-piso` (solo PIN): muestra únicamente órdenes **ya en producción** con partidas asignadas al operario (`ordenes-servicio.ts:578`). Registra inicio/pausa/fin, avance y consumo con funciones de la fase 5, sin cambios desde agosto. | — | `src/modulos/ordenes/componentes/control-piso-panel.tsx:10-12, 184`; `registrar_tiempo_operador_op` (última versión `20260812052820`) |
| 6b | Módulo `/produccion`: sesión con checklist, corridas y calidad. Exige el permiso `gestionar_produccion`, que el rol operador **no** tiene, más el PIN del operario en el mismo navegador. | — | `src/app/(privado)/produccion/page.tsx:22`; permisos del operador en `20261005100001_sii_b1_permisos_catalogo.sql:187-189`; `src/modulos/produccion/acciones/iniciar-sesion-operador.ts` |
| 6c | Resultado: una orden nueva **solo puede arrancar desde `/produccion`**, porque la terminal de piso no la muestra hasta que ya está en proceso. | — | Combinación de 6a y 6b |
| 7 | **Entregar.** Hay dos caminos: el módulo **Entregas** (`registrar_entrega`, con la regla O-08 del cliente: entregar solo con producción completada) y la **nota de entrega dentro de Producción** (`generar_nota_entrega`, fase 7), que el servidor permite con la orden **aún en proceso**. | Manual | `20260814054021_fase_7_unificar_orden_locks_entrega.sql:79` (`estado IN ('en_proceso','completada')`); `src/modulos/produccion/componentes/operacion-produccion.tsx:239, 311` |

## 4. Inventario por módulo: qué pide el cliente y qué no

Leyenda: **Requerido** (con su fuente) · **Sin respaldo** (no aparece en la documentación del cliente) · **En conflicto** (lo pidió el cliente, pero choca con la indicación de hoy).

### Órdenes

| Función | ¿Lo pide el cliente? | Observación | Recomendación |
|---|---|---|---|
| Orden automática al aceptar la propuesta | Requerido (§11, DC-09) | Ya es automática | Mantener |
| Orden interna (TI) con autorización | Requerido (decisión del 2026-10-05) | Alta manual justificada | Mantener |
| «Nueva basada en esta» | Requerido (O-03 B) | — | Mantener |
| Liberar | §11.3 («se libera a producción») y P-09 | Manual y no condiciona el inicio (§3, paso 3) | Automatizar o retirar (§5) |
| Cancelar con motivo / Cierre administrativo | Requerido (§11.3, O-01, O-02) | — | Mantener |
| Comparativa de órdenes | **Sin respaldo** en el documento del cliente (viene del sistema anterior, ORD-11) | Informativa, no genera trabajo | Mantener o mover al Dashboard |
| Formulario de orden manual (`formulario-orden.tsx`, `crear-orden.ts`, `crear-orden-manual.ts`) | **Sin respaldo** y contrario a §11 (la orden nace de una revisión aceptada, salvo TI) | Ninguna pantalla lo usa | Retirar código |
| Editar orden en borrador (`editar-orden-dialog.tsx`, `actualizar-orden-borrador.ts`) | **Sin respaldo** (DC-10 cubre los cambios operativos con historial) | Ninguna pantalla lo usa | Retirar código |
| Configurar procesos/metas a mano (`configurar-procesos-dialog.tsx`) | **Sin respaldo** (las operaciones salen del ruteo) | Ninguna pantalla lo usa | Retirar código |
| Crear orden histórica (`crear-orden-heredada.ts`) | **Sin respaldo** (herramienta de migración) | Ninguna pantalla lo usa | Retirar o dejar como script de migración |
| Asignar operario a la partida | **Sin respaldo.** El cliente pide credencial individual y trazabilidad por operador (§5, §12.2), no una preasignación | Obligatorio y sin pantalla: **bloquea** las órdenes nuevas | Quitar el requisito: el responsable es quien inicia |

### Planeación

| Función | ¿Lo pide el cliente? | Observación | Recomendación |
|---|---|---|---|
| Carga semanal, semáforo y capacidad como dato central | Requerido (P01–P03, P-06, P-07; backlog §21) | — | Mantener |
| Calendario Día/Semana/Mes y resumen al hacer clic | Requerido (P02, P04, P05, P-08) | — | Mantener |
| **Programar partida/operación** (formulario) | **En conflicto:** lo exigen P06, P07, P-01 B y P17; la indicación de hoy lo declara innecesario | Paso manual obligatorio para cada operación | Decisión del PO/cliente (§6) |
| Campos del formulario | P08 pide Orden, Ítem, Operación, Grupo, Recurso, Fecha, Turno, Horas, Estado, Responsable e Historial. Prioridad la permite DC-10, pero P08 no la exige | Horas y secuencia ya existen en el ruteo y se recapturan | Precargar desde el ruteo (captura única) |
| Reprogramar con motivo e historial | Requerido (P11, P12) | — | Mantener |
| «Buscar hueco» y sugerencias de la bolsa | Requerido como ayuda (P-11) | — | Mantener |
| **«Iniciar preparación»** | **Sin respaldo como paso.** P16 solo nombra el estado «En preparación» | Manual y obligatorio para que el operario arranque | Hacerlo automático al iniciar |
| Capacidad instalada (turnos por recurso) | Requerido como configuración (P-07) | Vive dentro de Planeación | Mantener (o mover a Configuración) |
| «Liberar» en la tarjeta | P-09 | Mismo caso que en Órdenes | Según §5 |

### Producción

| Función | ¿Lo pide el cliente? | Observación | Recomendación |
|---|---|---|---|
| Iniciar, pausar con causa, continuar, terminar, piezas, tiempo real, bloqueo por máquina | Requerido (§12.2, §16.3) | — | Mantener |
| Checklist de eventos críticos antes de iniciar | Requerido (§12.2) | — | Mantener; simplificar la captura |
| Calidad: primera pieza, referencias de lote, cierre | Requerido (§12.3) | — | Mantener |
| Fin de jornada, horas extra autorizadas, liberar máquina tras más de 1 h | Requerido (§12.2, P15) | — | Mantener |
| Corridas | Requerido el concepto (§12.1) | Crearlas a mano es opcional (al iniciar se crea una sola) | Mantener como opcional |
| **Dos pantallas para producir** (piso con PIN y `/produccion`) | **Sin respaldo.** El cliente describe una sola ejecución por equipo y operador | La terminal del operario no tiene el flujo completo (checklist, corridas, calidad) | Unificar en la terminal del operario |
| **Nota de entrega dentro de Producción** | **Sin respaldo.** Duplica Entregas (§13) y **salta la regla O-08** del cliente | Camino de la fase 7 | Retirar de Producción |
| Tablero Kanban («Bandeja», etc.) | Vista derivada (P-09 menciona Bandeja) | No genera trabajo | Mantener |

## 5. Ajustes que conviene hacer en cualquier caso

Son correcciones de fricción o de defecto; no dependen de la decisión sobre programar:

1. **Quitar la preasignación de operario.** El responsable es quien inicia el trabajo. Corrige el bloqueo de las órdenes nuevas.
2. **«Iniciar preparación» automático** al iniciar el trabajo, conservando las validaciones de recurso ocupado y capacidad.
3. **Liberar automático**, cuando la orden tiene ruteo y archivos vigentes, o retirarlo. Hoy no condiciona el inicio.
4. **Precargar horas y secuencia** desde el ruteo congelado en la orden. No volver a escribir lo que ya se capturó.
5. **Una sola pantalla para el operario** (PIN), con el flujo completo de sesiones: checklist, corridas y calidad.
6. **Retirar la nota de entrega de Producción.** Se entrega solo desde Entregas, que respeta O-08.
7. **Retirar el código sin pantalla:** formulario de orden manual, editar borrador, configurar procesos, crear orden histórica y la acción de asignar operario.

Requieren cambios de base de datos (las funciones de inicio de sesión, liberar y las derivaciones de estado) y, por tanto, migraciones que el PO aplica en remoto.

## 6. Opciones para el modelo que se pide

| | **A. Producción toma la orden (sin programar)** | **B. Programación opcional** *(recomendada)* | **C. Mantener lo firmado** |
|---|---|---|---|
| Qué ve el operario | Cola «Por producir» de su grupo de equipo con las operaciones disponibles (respetando el orden del ruteo). Elige una y un equipo libre. | Lo mismo que A. Además, lo que Planeación haya acomodado por adelantado aparece primero. | Solo lo que Planeación programó y preparó. |
| Planeación | Solo vista: carga semanal y calendario de lo que está en curso o previsto. Sin formulario. | El formulario se conserva, pero **no es obligatorio**. Sirve para reservar recurso, fecha y turno cuando se quiera. | Igual que hoy. |
| Cómo se cumple lo del cliente | Al iniciar, el sistema crea la programación del día con el equipo elegido y las horas del ruteo. Así conserva el bloqueo por máquina (§12.2), la capacidad real (P14) y la producción sin recaptura (P17). | Igual que A cuando no hubo programación previa. Si la hubo, la consume (P17). | Igual que hoy. |
| Choca con | P06, P07, P-01 B (programación manual), P-11 y P-09 | Nada de lo firmado, salvo que la programación deja de ser obligatoria (P07 pasa a «se puede») | Con la indicación de hoy |
| Tamaño | Grande: rehace Planeación y el inicio de producción | Medio: cambia el inicio de producción y la derivación de estados; Planeación casi no cambia | Pequeño: solo los ajustes del §5 |

Recomiendo **B**: elimina la cola de programación obligatoria, que es lo que se pide, sin desechar lo que el cliente firmó, pagó y ya está construido (C9.0–C9.4). Si el cliente confirma que no quiere programar nunca, B se reduce a A ocultando el formulario.

## 7. Decisiones necesarias antes de tocar código

1. **¿El cliente cambia sus respuestas** P06/P07/P-01 B/P-11/P-09/P17, o es una preferencia interna? Cualquier cambio se registra antes en `DECISIONES-ACEPTADAS.md` («Refinamientos posteriores»), como pide el propio documento del cliente (§23: «actualizar primero la especificación funcional y después el sistema»).
2. **Modelo:** A, B o C (§6).
3. **¿Quién puede tomar una operación?** Cualquier operario habilitado en el área o grupo de equipo compatible (P-04 ya define la compatibilidad por grupo).
4. **¿Cómo se ordena la cola «Por producir»?** Por fecha compromiso comercial, por prioridad (DC-10) o por ambas.
5. **¿«Liberar» se conserva** como revisión humana de archivos y ruteo antes de producir, o se vuelve automático?

## 8. Riesgos e impactos a considerar

- **Capacidad y KPIs:** hoy salen de la programación. En A y B deben salir de las sesiones reales más las horas estimadas pendientes (P13, P14).
- **Pruebas:** muchas pruebas de punta a punta parten de datos con el operario ya asignado. Habrá que ajustarlas en el mismo cambio.
- **Coherencia:** las tandas C9.0–C9.4 de Planeación acaban de entregarse. Cualquier cambio debe reutilizarlas, no rehacerlas.
- **Base de datos:** los cambios del §5 y de la opción B tocan funciones de estado y de inicio de sesión. Van en migraciones que aplica el PO en remoto.
