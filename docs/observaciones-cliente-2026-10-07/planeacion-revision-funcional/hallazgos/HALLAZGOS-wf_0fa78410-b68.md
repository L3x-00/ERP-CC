# Hallazgos verificados - revision funcional de Planeacion
Generado sin modelo desde `wf_0fa78410-b68/journal.jsonl` el 2026-10-14T22:12:13.638Z. Áreas: 6 · otros resultados: 0.
Los estados «verificada» pasaron por un revisor escéptico independiente; «SIN verificar» es la lectura cruda del primer agente.

## Área «alcance-coherencia» (verificada) — Alcance APS/MRP, coherencia con Órdenes y trazabilidad documental (Planeación, Corte 9)

**Cómo funciona hoy:** Planeación es programación operativa por recurso/fecha/turno sobre programacion_areas, con capacidad en SQL y RPC auditadas que escriben orden_eventos_cambio sin tocar compromiso ni ruteo. Las ayudas con sabor APS son mínimas y deterministas (primer hueco). Verificado por grep: seleccionarPrimerHueco solo lo usa proponer-hueco-reprogramacion.ts; detectarCuellosBotella y CLASIFICACIONES_SATURACION solo se re-exportan en servicios/indice.ts, sin consumidor en UI. Los tipos de evento de Planeación (programacion_inicial, reprogramacion_operativa, ajuste_operativo) no aparecen en ningún punto de src/, así que la Actividad de la ficha de Órdenes (select('*') limit 50, ficha-orden-servicio.ts:85-90) los mostraría crudos. acciones-tarjeta-orden.tsx importa liberarOrdenAccion y ReactivarOrdenDialog de Órdenes, y puedeAdministrar sirve solo para Reactivar y viaja por operacion-planeacion, calendario, vistas y tarjeta. El informe del lector se confirma en lo esencial. Faltan por verificar los criterios 7 y 9 (oleada 2).

### R18 — cumple (confirmado) · esfuerzo XS

**Estado actual:** No hay secuenciación automática, optimización, dependencias multi-operación, simulación ni multi-planta. Las únicas ayudas son de primer hueco determinista: seleccionarPrimerHueco usado solo por proponerHuecoReprogramacionAccion (capacidad-servicio.ts:329; proponer-hueco-reprogramacion.ts:7,57), la bolsa con tope de sugerencias y asignación manual, y detectarCuellosBotella/CLASIFICACIONES_SATURACION sin consumidor de UI (solo servicios/indice.ts:36,45,50). Todas requieren clic del usuario y la RPC revalida capacidad.

**Cambio mínimo:** Ninguno de código. Registrar el criterio escrito (ayudas de primer hueco aceptables, sin ampliar) como fila de Refinamientos y en el plan C9. Opcional XS: prueba guardarraíl de que la bolsa y proponer-hueco no invocan RPC de escritura.

**Enfoque descartado:** Retirar la bolsa, Buscar hueco y las funciones de cuellos de botella, o construir un panel de alertas de cuellos de botella: lo primero contradice decisiones ya aceptadas; lo segundo acerca a APS.

**Archivos a tocar:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md
- tests/unitarias/planeacion-bolsa.test.ts

**Impacto en otros módulos:**
- [bajo] produccion (src/modulos/produccion/servicios/tablero-produccion-servicio.ts): Importa del índice de planeación; no se retira ni renombra nada.

**Pruebas afectadas:**
- tests/unitarias/planeacion-bolsa.test.ts
- tests/unitarias/planeacion-capacidad.test.ts
- tests/e2e/planeacion-bolsa-acciones.spec.ts

**Pruebas nuevas (RED):**
- Unitaria opcional: la sugerencia de la bolsa solo hace select (cliente simulado sin insert/update/rpc).

**Riesgos:**
- Interpretar la nota como retirar la bolsa contradice PLA-05.
- detectarCuellosBotella queda como código muerto; no borrar sin grep y sin actualizar planeacion-capacidad.test.ts.
- Constantes de tope y horizonte pueden crecer hacia una cola de prioridades: congelarlas.

**Preguntas al PO:**
- ¿Se confirma que la bolsa (PLA-05) y Buscar hueco (OBS-19) se mantienen como ayuda básica?
- ¿Se deja detectarCuellosBotella sin UI o se retira en un corte aparte?

**Evidencia:**
- src/modulos/planeacion/servicios/capacidad-servicio.ts:27-35, 329, 366 — Definiciones de CLASIFICACIONES_SATURACION, seleccionarPrimerHueco y detectarCuellosBotella.
- src/modulos/planeacion/acciones/proponer-hueco-reprogramacion.ts:7, 57 — Único consumidor de seleccionarPrimerHueco.
- src/modulos/planeacion/servicios/indice.ts:36-50 — detectarCuellosBotella y CLASIFICACIONES_SATURACION solo se re-exportan; grep en src sin otros usos.
- docs/auditoria-funcional-2026-09-13/fuentes/catalogo.csv:84-90, 153-154 — PLA-05 y PLA-04/OBS-19 son requisitos previos aceptados (cita del lector, no releída).

**Notas de verificación:** Grep en src confirma que detectarCuellosBotella y CLASIFICACIONES_SATURACION no tienen consumidor fuera del índice y que seleccionarPrimerHueco lo usa solo proponer-hueco-reprogramacion. No se releyó la bolsa ni el catálogo.

### R19 — parcial (confirmado) · esfuerzo S

**Estado actual:** El diseño es coherente pero no está congelado como contrato escrito. Confirmado en código: acciones-tarjeta-orden.tsx importa liberarOrdenAccion (l.5) y ReactivarOrdenDialog (l.6); Reactivar depende de puedeAdministrar (l.111, 125). Esa prop recorre operacion-planeacion:41,61,291, calendario:61,103,229, vistas:33,89 y tarjeta:39,58,166. La Bandeja navega a /ordenes?ordenId= (l.66). Ningún tipo de evento de Planeación tiene etiqueta en src. La ficha de Órdenes lee orden_eventos_cambio con select('*') (ficha-orden-servicio.ts:85-90). Las RPC de Planeación no tocan fecha_compromiso_comercial ni fecha_operativa (según c4_2, no releído aquí). Los 6 estados de programación son independientes de estado_sii. Las 8 superficies compartidas del lector (acciones de tarjeta, resumen de procesos, eventos de Actividad, estados, fechas, ruteo/horas, confidencialidad, deep link) y su orden (Órdenes T1, T2, T3 antes de que Planeación toque tarjeta, adopte resumirProcesos o muestre historial) se mantienen.

**Cambio mínimo:** Documento-contrato de una página en el plan C9 con las 8 superficies y el orden de dependencias. Reglas para tandas de Planeación: no tocar acciones-tarjeta-orden.tsx ni tarjeta-programacion-planeacion.tsx hasta que Órdenes T1 esté fusionado; no crear helper de procesos propio; enlazar a /ordenes/{id} solo después de T1; cualquier lectura de eventos pasa por el diccionario de T2 con proyección sin UUID. Añadir a T2 de Órdenes los tres tipos de evento de Planeación.

**Enfoque descartado:** Unificar estados de programación con estado_sii, mover acciones de Orden a Planeación o crear un panel de contexto que duplique la ficha de Órdenes: costo L y riesgo de confidencialidad.

**Archivos a tocar:**
- tasks/plan.md
- tasks/todo.md
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md

**Impacto en otros módulos:**
- [alto] ordenes (src/modulos/ordenes/componentes/reactivar-orden-dialog.tsx): T1 lo retira y Planeación lo importa en acciones-tarjeta-orden.tsx:6; editar la tarjeta antes provoca conflicto y E2E rotos.
- [medio] ordenes (src/modulos/ordenes/utilidades/procesos.ts): resumirProcesos (T3) frente a etiquetaProcesos de Planeación; separador distinto y test que fija ', '.
- [medio] ordenes (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): La Actividad mostrará tipos de Planeación crudos si T2 no los etiqueta.
- [bajo] produccion (src/modulos/produccion/servicios/sesiones-servicio.ts): Consume programacion_id; no cambiar granularidad ni estados de programación.

**Pruebas afectadas:**
- tests/unitarias/planeacion-desglose.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts
- tests/e2e/planeacion-bolsa-acciones.spec.ts
- tests/e2e/planeacion-flujo-colaborativo.spec.ts
- tests/integracion/reactivar-orden.test.ts
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts
- supabase/tests/c4_2_orden_comercial_operativa.test.sql
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql

**Pruebas nuevas (RED):**
- Unitaria RED (T2 Órdenes): etiquetaEvento para programacion_inicial, reprogramacion_operativa y ajuste_operativo devuelve español y la Actividad no muestra UUID ni recurso_id.
- Unitaria RED (C9): el título-enlace de la tarjeta apunta a /ordenes/{ordenId} tras T1.
- Unitaria guardarraíl: tras T1, acciones-tarjeta-orden.tsx no importa ReactivarOrdenDialog.
- pgTAP: reprogramar_partida_recurso_auditada no altera fecha_compromiso_comercial ni fecha_operativa (añadir aserción si falta).

**Riesgos:**
- Dos tandas editando acciones-tarjeta-orden.tsx o la tarjeta generan conflicto y E2E rotos.
- El redirect de ?ordenId a /ordenes/{id} obliga a actualizar Bandeja y E2E en el mismo PR de T1.
- Unificar el separador de procesos rompe planeacion-desglose.test.ts.
- Leer eventos sin proyección filtra recurso_id y detalle (c4_3).
- Mezclar fecha programada, operativa y compromiso en la UI contradice DC-10.

**Preguntas al PO:**
- ¿C9.1 puede ir en paralelo a Órdenes T1 si no toca tarjeta ni acciones-tarjeta-orden.tsx?
- ¿Imprimir, Entregar, Sesión y Bandeja permanecen en la tarjeta hasta que Órdenes T4 redefina su destino?

**Evidencia:**
- src/modulos/planeacion/componentes/acciones-tarjeta-orden.tsx:5-6, 13, 66, 111, 125 — Importa liberarOrdenAccion y ReactivarOrdenDialog; puedeAdministrar solo gobierna Reactivar; Bandeja usa /ordenes?ordenId=.
- src/modulos/planeacion/componentes/operacion-planeacion.tsx:41, 61, 291 — Inicio de la cadena de puedeAdministrar hasta la tarjeta.
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:39, 58, 166 — Final de la cadena de puedeAdministrar hacia acciones-tarjeta-orden.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:85-90 — orden_eventos_cambio con select('*') limit 50, sin etiquetas para eventos de Planeación.
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/PLAN-ORDENES-RESUMEN.md:4-14, 24, 33, 74 — T1 retira Reactivar y poda puedeAdministrar; T2 crea diccionario de eventos; T3 crea resumirProcesos (cita del lector, no releída).

**Notas de verificación:** Se reabrieron las líneas de acciones-tarjeta-orden.tsx, la cadena de puedeAdministrar y ficha-orden-servicio.ts:85-90; coinciden con lo afirmado. No se releyó c4_2 ni el plan de Órdenes; esas citas se toman del lector.

### R20 — parcial (confirmado) · esfuerzo S

**Estado actual:** Estado de los 9 criterios según el lector y los hallazgos de oleada 1: (1) vista semanal por recurso ausente; (2) asignar recurso/fecha/turno cumple; (3) aviso previo parcial, la RPC bloquea mientras la nota dice advertir; (4) reprogramar con historial cumple en servidor y falta mostrarlo en UI; (5) compromiso intacto cumple; (6) ruteo intacto cumple por construcción, sin prueba explícita; (7) capacidad al terminar parcial, la carga usa horas estimadas; (8) no APS cumple (R18); (9) Producción consume programacion_id, parcial. Los criterios 7 y 9 y la exclusión de completada/cancelada en d02:168 no se re-verificaron aquí. El cierre exige registro documental mínimo y una prueba nombrada por criterio.

**Cambio mínimo:** Solo en el PR de cierre de C9: 3-4 filas de Refinamientos posteriores (2026-10-14, Product Owner) para OBS-19/PLA-04, PLA-06, carga semanal como vista principal y semáforo de 3 niveles; CLI-16 en tasks/plan.md; Corte 9 de 9 casillas en tasks/todo.md con evidencia; una matriz criterio-tanda-prueba. Sin DC nueva.

**Enfoque descartado:** Crear DC-16 en adelante y un documento de requisitos nuevo; reconstruir la matriz de 164.

**Archivos a tocar:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md
- tasks/plan.md
- tasks/todo.md

**Impacto en otros módulos:**
- [bajo] ordenes (tasks/plan.md): CLI-15 reservado por Órdenes; Planeación toma CLI-16; ambos PR de cierre editan las mismas tablas.

**Pruebas afectadas:**
- tests/unitarias/planeacion-capacidad.test.ts
- tests/e2e/planeacion-capacidad.spec.ts
- tests/e2e/planeacion-flujo-colaborativo.spec.ts
- supabase/tests/c4_2_orden_comercial_operativa.test.sql
- tests/e2e/produccion-avance-procesos.spec.ts

**Pruebas nuevas (RED):**
- E2E criterio 1: el resumen semanal muestra 6/8 h tras programar 6 h.
- Criterio 3: sobrecapacidad avisa antes de guardar con el exceso en horas.
- pgTAP criterios 4 y 5: reprogramar con motivo crea evento y no cambia fecha_compromiso_comercial ni fecha_operativa.
- Criterio 6: programar o reprogramar no altera snapshot_json ni el ruteo.
- Criterios 7 y 9 (oleada 2): completar libera carga; la sesión usa programacion_id sin recaptura.

**Riesgos:**
- Los criterios 1 y 7 dependen de decisiones abiertas del PO (suma de turnos, horas reales o estimadas).
- No mezclar las casillas pendientes de C4.2 con el Corte 9.
- El PO fusiona con CI en curso: el PR de cierre no debe asumir fusionadas las tandas previas sin verificar.

**Preguntas al PO:**
- ¿Se confirma el registro como Refinamientos posteriores más CLI-16 y Corte 9, sin DC nueva?
- Sobrecapacidad: ¿bloqueo duro de la RPC, bloqueo en UI con Buscar hueco, o advertir y permitir con confirmación y motivo?
- ¿Son aceptables los umbrales 70/90 del semáforo y el mapeo de 5 a 3 niveles?
- ¿Un recurso con varios turnos muestra capacidad sumada o por turno?

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:5, 18, 25-40 — Patrón de Refinamientos posteriores con fecha, autor y requisito (cita del lector).
- tasks/plan.md:62, 155-221 — Último CLI-14; Cortes 0-7 (cita del lector).
- tasks/todo.md:233-242 — C4.2 con casillas sin marcar (cita del lector).
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:168 — La carga excluye programaciones canceladas y completadas (cita del lector).
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/PLAN-ORDENES-RESUMEN.md:51, 76 — Órdenes usa 4 filas de Refinamientos y CLI-15 sin DC nuevas (cita del lector).

**Notas de verificación:** Es un requisito de aceptación y documentación. No se pudo reverificar el estado de los criterios 7 y 9 con el presupuesto disponible; se mantienen como parciales.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Etiquetas de eventos de Planeación inexistentes en la Actividad de la ficha (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Grep en src de programacion_inicial, reprogramacion_operativa y ajuste_operativo no da resultados. La ficha de Órdenes lee orden_eventos_cambio con select('*') limit 50, así que la Actividad los mostraría crudos. Debe cubrirlo T2/R10 de Órdenes.
- [baja] select('*') sobre orden_eventos_cambio (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Rompe la regla de columnas explícitas; al etiquetar eventos conviene proyectar columnas y no exponer recurso_id ni UUID.
- [media] Advertir (nota) frente a bloqueo duro (RPC y catálogo) sin decisión registrada (supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql): La RPC lanza capacidad_insuficiente y el catálogo dice que OBS-19 reemplaza la sobreasignación por bloqueo; la nota del cliente pide advertir. Requiere decisión del PO y fila de Refinamientos. Cita del lector, no releída.

### Limitaciones
- Presupuesto limitado: solo se reverificaron por grep y lectura los consumidores de detectarCuellosBotella, seleccionarPrimerHueco y CLASIFICACIONES_SATURACION, la ausencia de etiquetas de eventos, la ficha de Órdenes y la cadena de puedeAdministrar.
- No se releyeron c4_2, d02, los catálogos, tasks/plan.md, tasks/todo.md ni PLAN-ORDENES-RESUMEN.md; esas citas son del lector.
- Los criterios 7 y 9 de la nota (oleada 2) no se verificaron en profundidad.
- No se ejecutó git; los patrones de rama se infieren del lector.

## Área «carga-semanal» (verificada) — Planeación: capacidad y carga semanal por equipo (datos, cálculo y semáforo)

**Cómo funciona hoy:** La capacidad se calcula en PostgreSQL (RPC obtener_carga_capacidad_diaria, migración 20260919000007: una fila por recurso activo x fecha x turno con horas_capacidad y horas_programadas). Los datos ya llegan al cliente como datos.cargas para el rango visible (semana por defecto). La UI no tiene matriz Equipo x día: la capacidad solo aparece como "x/y h" dentro de la tarjeta del calendario (rojo si sobrecargado). El semáforo de 5 niveles (umbrales 70/90/100) existe como funciones puras en capacidad-servicio.ts y ningún componente lo renderiza. PanelCapacidadInstalada va al final de la página y es de configuración. El cambio mínimo propuesto por el lector es correcto: un componente de solo lectura más una función pura de agregación, sin migración.

### P01 — ausente (confirmado) · esfuerzo S

**Estado actual:** No hay matriz Equipo x Lun-Vie ni columna de capacidad libre semanal. La carga solo se ve en el pie de la tarjeta (programadas/capacidad h) y en mensajes de panel y diálogo. El RPC y datos.cargas ya traen lo necesario por recurso, fecha y turno, así que basta agregar en cliente sumando los turnos.

**Cambio mínimo:** Función pura construirMatrizCargaSemanal en utilidades/carga-semanal.ts (nuevo, preferible al servicio por tamaño) que sume turnos por recurso y fecha, limite a Lun-Vie y calcule libre = suma de max(0, capacidad - programadas) por día. Componente de solo lectura resumen-carga-semanal.tsx montado en OperacionPlaneacion encima del calendario, con la misma fuente datosCalendario. Usar siempre horas_capacidad del RPC, sin recalcular.

**Enfoque descartado:** Un RPC o vista SQL nueva, o rehacer el calendario como grilla recurso x día: exige migración y duplica la fórmula de capacidad que hoy vive solo en SQL.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/resumen-carga-semanal.tsx (nuevo)
- src/modulos/planeacion/utilidades/carga-semanal.ts (nuevo)
- src/modulos/planeacion/componentes/operacion-planeacion.tsx
- src/modulos/planeacion/componentes/indice.ts

**Impacto en otros módulos:**
- [bajo] produccion (src/modulos/produccion/servicios/tablero-produccion-servicio.ts): Solo se agregan exports; no cambian los existentes.

**Pruebas afectadas:**
- tests/unitarias/planeacion-capacidad.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-capacidad.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: suma de dos turnos por recurso y día (capacidad 8+8, programadas 6+4) da 10/16 h y libre 6 h.
- Unitaria RED: se omiten sábado y domingo, y un día sobrecargado aporta 0 libre, no un valor negativo.
- Unitaria RED: un recurso sin filas de carga se muestra como 'sin turnos definidos'.
- Componente RED: ResumenCargaSemanal muestra una fila por recurso con 'x/y h' por día y la columna Libre.
- E2E RED: tras programar 6 h, el resumen superior muestra 6/8 h en ese día.

**Riesgos:**
- Decidir si se suma por día o se muestra por turno cuando hay varios turnos.
- Lun-Vie fijo frente al rango de la vista: en vista Día o Mes el resumen debe degradarse u ocultarse.
- Los recursos sin turnos configurados no aparecen en cargas.
- Completada no cuenta como ocupada, así que las semanas pasadas subestiman la carga.

**Preguntas al PO:**
- ¿Capacidad diaria como suma de turnos o una fila por turno?
- ¿Resumen fijo Lun-Vie o según el rango elegido?
- ¿La capacidad libre semanal ignora los días sobrecargados o los netea?
- ¿Un recurso sin turnos aparece como 'sin capacidad definida'?

**Evidencia:**
- src/app/(privado)/planeacion/page.tsx:121-129 — Se renderiza OperacionPlaneacion y luego PanelCapacidadInstalada; no hay resumen de carga.
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:140-144 — Única presentación de capacidad: '{horasProgramadas}/{horasCapacidad} h', solo en tarjetas no compactas y con carga.
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:105-200 — RPC vigente por recurso x fecha x turno (lectura del lector; no releída en esta pasada).
- src/modulos/planeacion/servicios/capacidad-servicio.ts:144-170 — clasificarSaturacion reutilizable para colorear/etiquetar las celdas.

**Notas de verificación:** Se reconfirmaron page.tsx (121-129), la tarjeta (140-144) y clasificarSaturacion (144-170). El grep en src/ no muestra ningún consumidor en componentes.

### P03 — parcial (confirmado) · esfuerzo S

**Estado actual:** clasificarSaturacion (5 niveles, umbrales 70/90/100) existe como función pura con pruebas, pero la UI no la usa. La única señal visual es el texto de la tarjeta en rojo cuando sobrecargado, junto con las horas, sin etiqueta de nivel. La capacidad no aparece antes de los filtros, y PanelCapacidadInstalada va al final. La tarjeta muestra 'Tiempo estimado' y 'Avance' de la partida, que son datos de Producción. detectarCuellosBotella solo se re-exporta desde servicios/indice.ts y solo lo usa la prueba unitaria. Con 100 % exacto la clasificación da 'saturado', no 'sobrecargado' (programadas > capacidad).

**Cambio mínimo:** Mapear los 5 niveles a 3 solo en presentación: libre y holgado = Disponible, ajustado y saturado = Cerca del límite, sobrecargado = Sobrecargado. Componente InsigniaSaturacion con icono, texto y 'x/y h' (con role/aria-label), usada en las celdas del resumen de P01 y en la tarjeta en lugar del span coloreado. La capacidad queda antes de los filtros al montar el resumen arriba, sin mover los filtros. Dejar Área tal cual (cosmético y opcional). No tocar detectarCuellosBotella, y si el PO lo pide, retirarlo en una tanda aparte tras buscar todos sus imports (reubicar antes de retirar).

**Enfoque descartado:** Reescribir clasificarSaturacion a 3 niveles o añadir un panel de alertas o cuellos de botella: rompe pruebas y se acerca a APS.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/insignia-saturacion.tsx (nuevo)
- src/modulos/planeacion/utilidades/etiquetas.ts (mapeo a 3 niveles)
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx
- src/modulos/planeacion/componentes/resumen-carga-semanal.tsx

**Impacto en otros módulos:**
- [bajo] planeacion (tests/unitarias/planeacion-capacidad.test.ts): Cubre clasificarSaturacion y detectarCuellosBotella; no se modifican.

**Pruebas afectadas:**
- tests/unitarias/planeacion-capacidad.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-capacidad.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: el mapeo a 3 niveles lleva libre y holgado a disponible, ajustado y saturado a cerca del límite, y sobrecargado a sobrecargado. Al 100 % exacto da 'cerca del límite'.
- Componente RED: InsigniaSaturacion muestra texto y horas, y expone aria-label.
- Componente RED: la tarjeta sobrecargada muestra el texto 'Sobrecargado'.
- E2E RED: el resumen semanal aparece en el DOM antes de los filtros del calendario.

**Riesgos:**
- Los umbrales 70/90 no están confirmados por el cliente; cambiarlos es mover constantes, sin migración.
- Quitar Avance de la tarjeta puede afectar pruebas de planeacion-componentes, y la tarjeta sirve de contexto de la operación (otro punto de la nota).
- detectarCuellosBotella sin consumidor en UI es deuda menor.

**Preguntas al PO:**
- ¿Los umbrales 70 % y 90 % son aceptables?
- ¿Se ocultan Avance y Tiempo estimado de la tarjeta por ser de Producción?
- ¿Se retira detectarCuellosBotella?

**Evidencia:**
- src/modulos/planeacion/servicios/capacidad-servicio.ts:19-35, 144-170 — Umbrales y clasificación confirmados: libre, holgado (<70), ajustado (>=70), saturado (>=90), sobrecargado (>capacidad o capacidad 0 con carga).
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:140-144 — Solo color text-peligro-texto más 'x/y h'; sin texto de nivel.
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:112-122 — Se muestran Tiempo estimado y Avance en el desglose.
- src/app/(privado)/planeacion/page.tsx:121-129 — La capacidad instalada va después del calendario con filtros.
- src/modulos/planeacion/servicios/indice.ts:44-47 — Se re-exportan clasificarSaturacion, detectarCuellosBotella y evaluarCargaRecursoTurno; en src/ no hay consumidores en componentes.

**Notas de verificación:** Se reconfirmaron los umbrales y la frontera del 100 %. No se halló ningún consumidor de la clasificación en los componentes de src/.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [baja] jornadaBaseHoras usa el máximo de turnos, el SQL usa la capacidad de cada turno (src/modulos/planeacion/utilidades/capacidad.ts): Reportado por el lector y no reverificado. Solo afectaría la etiqueta del panel de configuración.
- [baja] Recurso sin turnos configurados no aparece en cargas (supabase/migrations/20260919000007_d02_capacidad_instalada.sql): El JOIN con capacidades_recurso_turno deja invisibles en el resumen a los recursos sin turnos.

### Limitaciones
- Revisión parcial por presupuesto: solo se releyeron page.tsx, la tarjeta y capacidad-servicio.ts.
- No se releyeron el SQL del RPC, operacion-planeacion.tsx, calendario-planeacion.tsx ni las pruebas; esas citas del lector quedan sin reverificar.
- No se verificó el comportamiento en pantalla ni el esquema remoto.

## Área «estados-produccion» (verificada) — Planeación: estados de programación, actualización de capacidad al terminar y consumo desde Producción

**Cómo funciona hoy:** programacion_areas guarda un registro por partida/recurso/secuencia con fecha, turno, horas_estimadas y estado_planeacion (CHECK con los 6 estados del cliente). Producción inicia sesión con p_programacion_id y toma el recurso de la fila; no recaptura recurso/fecha/turno. El cierre (finalizar, migración sii_b6_jornada_horas_extra) guarda horas_netas en la sesión y suma a partidas.tiempo_real_minutos, y fija el estado de programación. La carga de capacidad (obtener_carga_capacidad_diaria, d02) suma solo horas_estimadas de filas no canceladas ni completadas; las horas reales nunca entran. La mutación de programar/reprogramar tiene su propio cálculo duplicado (misma exclusión, solo horas_estimadas) en las RPC de la migración fase_6_motor_capacidad y su reemplazo auditoria_ordenes_planeacion_produccion. Veredicto: el lector acertó en estados y consumo; corrijo la regla de transición de estado en el cierre y el alcance del cambio de P14.

### P16 — cumple (corregido) · esfuerzo XS

**Estado actual:** Los 6 estados existen en el CHECK de programacion_areas.estado_planeacion, en ESTADOS_PLANEACION y en las etiquetas (según el lector; CHECK y etiquetas no se releyeron aquí). El índice parcial de la base (línea 108 de fase_6_planeacion_base) usa NOT IN (cancelada, completada). Transiciones reales de cierre corregidas: pausada -> bloqueada; si NO es la última secuencia o la partida está completa -> completada; en otro caso (última secuencia sin partida completa) -> programada. Cambio de enum innecesario.

**Cambio mínimo:** ninguno

**Impacto en otros módulos:**
- [alto] produccion (src/modulos/produccion/servicios/sesiones-servicio.ts): Mapea estados y errores programacion_*; un renombre lo rompe.

**Pruebas afectadas:**
- tests/unitarias/planeacion-esquemas.test.ts
- supabase/tests/sii_b6_produccion.test.sql

**Pruebas nuevas (RED):**
- Unitaria: ESTADOS_PLANEACION, ETIQUETA_ESTADO y VARIANTE_ESTADO tienen las mismas 6 claves.

**Riesgos:**
- Una programación bloqueada sigue contando como carga (decisión P14).

**Evidencia:**
- supabase/migrations/20261007230003_sii_b6_jornada_horas_extra.sql:333-342 — bloqueada si pausada; completada si v_es_ultima_secuencia = false OR partida completa; programada en otro caso.
- supabase/migrations/20260813201729_fase_6_planeacion_base.sql:108 — índice parcial con estados NOT IN (cancelada, completada).
- supabase/migrations/20261007230003_sii_b6_jornada_horas_extra.sql:217-222 — v_es_ultima_secuencia = no existe secuencia posterior no cancelada.

**Notas de verificación:** Corregí la descripción del lector: 'completada si es la última secuencia' es inverso; el código completa cuando NO es la última secuencia (o la partida está completa).

### P14 — parcial (corregido) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** La capacidad se libera por completo al completar: la carga excluye completada/cancelada y suma solo horas_estimadas. Terminar antes libera todo el bloque; terminar tarde no refleja el exceso. Las horas reales existen en sesiones_trabajo.horas_netas y partidas.tiempo_real_minutos, pero programacion_areas no tiene columna real y la carga no las usa. Existe índice idx_sesiones_trabajo_programacion (fase_7_produccion_base 76), así que la agregación por programacion_id está indexada. Además la validación al programar/reprogramar tiene un cálculo propio y duplicado de horas_estimadas, no la RPC de carga.

**Cambio mínimo:** Dos alternativas mínimas. (A, solo visual, recomendada para MVP): redefinir obtener_carga_capacidad_diaria (nueva migración, CREATE OR REPLACE, mismo patrón de seguridad de d02) para que las programaciones abiertas cuenten max(horas_estimadas - sum(horas_netas de sesiones cerradas), 0) y devolver al final horas_exceso (completadas con horas_netas > horas_estimadas), con horas_netas derivadas de sesiones_trabajo por programacion_id (sin columna nueva). Se mapea en CargaRecursoTurno y el panel. (B, si el PO quiere coherencia total): extraer el cálculo a una función privada común usada por la RPC de carga y por los guardarraíles de programar/reprogramar; si no, el panel mostrará huecos que el guardarraíl sigue rechazando. Decidir con el PO antes de ampliar a B.

**Enfoque descartado:** Columna horas_reales en programacion_areas con trigger en cada cierre: duplica sesiones_trabajo.horas_netas y obliga a tocar las RPC de cierre, que son la parte más frágil.

**Migración:** CREATE OR REPLACE de obtener_carga_capacidad_diaria(date,date) con columnas nuevas AL FINAL de RETURNS TABLE. Ojo: cambiar RETURNS TABLE obliga a DROP FUNCTION previo (CREATE OR REPLACE no admite cambiar el tipo de retorno); repetir REVOKE/GRANT solo a service_role. La definición vigente es la de 20260919000007. Regenerar tipos de Supabase. El PO aplica la migración en remoto.

**Archivos a tocar:**
- supabase/migrations/<AAAAMMDDNNNNNN>_planeacion_capacidad_real_al_cerrar.sql
- src/compartido/tipos/supabase.ts (regenerar en UTF-8)
- src/modulos/planeacion/tipos/planeacion.ts
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- src/modulos/planeacion/componentes/panel-capacidad-instalada.tsx
- supabase/tests/sii_b6_produccion.test.sql

**Impacto en otros módulos:**
- [medio] planeacion (src/modulos/planeacion/servicios/planeacion-servicio.ts): La validación de sobrecapacidad al guardar NO usa la RPC (cálculo propio en SQL); cambiar la RPC solo cambia lo mostrado, no lo permitido.
- [bajo] produccion (src/modulos/produccion/servicios/tablero-produccion-servicio.ts): Lee programacion_areas directamente; no cambia.
- [medio] kpis (src/modulos/kpis/componentes/seccion-kpis-sii.tsx): No se verificó si reutiliza la carga; revisar.

**Pruebas afectadas:**
- supabase/tests/sii_b6_produccion.test.sql
- supabase/tests/a20_prd09_avance_proceso.test.sql
- tests/unitarias/planeacion-capacidad.test.ts
- tests/unitarias/planeacion-servicio.test.ts
- tests/e2e/planeacion-capacidad.spec.ts

**Pruebas nuevas (RED):**
- pgTAP RED: 8 h estimadas con sesión cerrada parcial de 3 h -> horas_programadas del día baja a 5 h.
- pgTAP RED: completada en 10 h con 8 estimadas -> horas_exceso = 2 y horas_estimadas sigue en 8.
- Unitaria: mapeo de CargaRecursoTurno con horasReales/horasExceso.

**Riesgos:**
- Regla de pausa/bloqueada (libera o no) requiere decisión del PO.
- Divergencia visual vs guardarraíl si solo se hace la opción A.
- El exceso de fechas pasadas se muestra sin mover bloques.
- Sesiones activas (horas_netas nulas) deben tratarse con coalesce.

**Preguntas al PO:**
- Cuando se pausa por material, ¿la programación bloqueada debe seguir ocupando horas o liberarlas?
- ¿El exceso debe verse en el día programado o en el día real de la sesión?
- ¿Basta que el panel muestre el remanente real (opción A) o el guardarraíl debe usar la misma regla (B)?

**Evidencia:**
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:160-170 — CTE carga: sum(horas_estimadas) con estado NOT IN (cancelada, completada).
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:171-190 — Solo devuelve horas_capacidad, horas_programadas, disponibles, porcentaje y sobrecargado.
- supabase/migrations/20261007230003_sii_b6_jornada_horas_extra.sql:304-329 — Guarda horas_netas en la sesión y tiempo_real_minutos en la partida, sin tocar programacion_areas.
- supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:323, 453 — Los guardarraíles de programar/reprogramar suman horas_estimadas con la misma exclusión, por separado de la RPC de carga.
- supabase/migrations/20260813205005_fase_6_motor_capacidad.sql:266-274 — Versión original del guardarraíl: v_horas_programadas + p_horas_estimadas > v_capacidad.
- src/modulos/planeacion/servicios/planeacion-servicio.ts:208 — Único consumidor TS de la RPC de carga.

**Notas de verificación:** Refuté la afirmación del lector de que las validaciones de sobrecapacidad usan el mismo cálculo que la RPC: son sumas SQL independientes en las RPC de programar/reprogramar. Añadí que cambiar RETURNS TABLE exige DROP FUNCTION. Confirmé que existe índice sobre sesiones_trabajo.programacion_id (limitación del lector resuelta).

**Omisiones halladas por el verificador:**
- supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql: Guardarraíles de programar (323) y reprogramar (453) con cálculo propio de carga; no listados por el lector.
- supabase/migrations/20260813205005_fase_6_motor_capacidad.sql: Define también obtener_carga_capacidad_diaria (superada por d02) y el guardarraíl original.

### P17 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Producción consume la programación sin recapturar recurso, fecha ni turno: iniciar_sesion_trabajo recibe p_programacion_id, exige en_preparacion y toma el recurso de la fila (según citas del lector; cuerpo de esa función no releído en esta pasada). El cierre calcula tiempos con reloj del servidor y deriva el estado de la programación (verificado en 215-216, 333-342). Producción solo captura operador, piezas, notas y motivo de pausa. Sin evidencia de captura duplicada.

**Cambio mínimo:** ninguno

**Pruebas afectadas:**
- tests/e2e/produccion-piso.spec.ts
- tests/e2e/produccion-avance-procesos.spec.ts

**Pruebas nuevas (RED):**
- pgTAP: iniciar_sesion_trabajo con programación distinta de en_preparacion falla con programacion_no_preparada.

**Riesgos:**
- No verificado que reprogramar bloquee con sesión activa; el guardarraíl de reprogramar solo admite estados programada/bloqueada (líneas 415/468), lo que sugiere que sí.

**Evidencia:**
- supabase/migrations/20261007130002_sii_b6_produccion_acciones.sql:570-639 — Inicio con p_programacion_id, valida estado y toma recurso de la programación (según lector).
- supabase/migrations/20261007230003_sii_b6_jornada_horas_extra.sql:215-216, 340-342 — Horas calculadas por BD y estado de programación actualizado al cierre.
- src/modulos/produccion/servicios/sesiones-servicio.ts:198-250 — Envía programacionId, sin recurso ni turno (según lector).

**Notas de verificación:** Hallazgo adicional: reprogramar solo acepta programada o bloqueada (auditoria_ordenes... 415), lo que impide mover una programación en_preparacion o en_proceso y mitiga el riesgo del lector.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Programación bloqueada por pausa sigue contando como carga (supabase/migrations/20260919000007_d02_capacidad_instalada.sql): La carga excluye solo cancelada y completada (168); una bloqueada con libera_maquina sigue consumiendo todas sus horas estimadas. Regla de pausa de la nota (sección 9) no se aplica a la capacidad.
- [baja] Cierre parcial de la última secuencia regresa a programada con horas completas (supabase/migrations/20261007230003_sii_b6_jornada_horas_extra.sql): Líneas 335-339: sin pausa, última secuencia y partida incompleta -> programada con la estimación completa aunque ya se trabajó parte.

### Limitaciones
- No se releyó el cuerpo de iniciar_sesion_trabajo ni sesiones-servicio.ts; P17 se apoya en las citas del lector más la lectura del cierre.
- No se releyeron CHECK de estados ni etiquetas.ts; P16 se apoya en el lector.
- No se revisaron KPIs ni pruebas e2e/pgTAP.
- No se verificó si una definición posterior a 20261007230003 redefine finalizar_sesion.

## Área «pantalla» (verificada) — Pantalla /planeacion: filtros, vistas, bloques y contexto

**Cómo funciona hoy:** /planeacion monta CalendarioPlaneacion con filtros (fechas, Área, Recurso, Turnos, Estados) en un solo bloque de rejilla, botones de vista Día/Semana/Mes debajo y la vista en useState local con valor inicial 'semana'. Área y Turno filtran solo en cliente; Recurso, Estado y fechas viajan al servidor. La tarjeta muestra folio y pieza, descripción, Área, Procesos (solo no compacta), equipo, material, tiempo, avance y pie con recurso, turno y horas. codigo_item se consulta en desglose-servicio pero no se mapea. El clic en la tarjeta no hace nada; solo el botón Seleccionar abre el panel de asignación, y AccionesTarjetaOrden navega con router a /ordenes o /produccion por ordenId. Las citas y hallazgos del lector se verificaron en lo leído.

### P02 — parcial (confirmado) · esfuerzo S

**Estado actual:** Semana ya es la vista inicial y Día/Semana/Mes se mantienen, con filtros de fecha, recurso y estado. Falta la jerarquía: Área y Recurso tienen el mismo peso que las fechas, y los botones de vista están debajo de los filtros. El selector de Recurso se filtra por Área y su etiqueta no muestra el área.

**Cambio mínimo:** Solo JSX en calendario-planeacion.tsx: subir botones de vista y navegación sobre los filtros; plegar Área y Turnos en un <details> 'Más filtros' cerrado; mostrar el área en la etiqueta del recurso. Sin tocar tienda ni URL. Ojo: si el <details> está cerrado y hay un área o turno activos, mostrarlo abierto o indicar filtro activo para no ocultar un filtro vigente.

**Enfoque descartado:** Eliminar el filtro de Área o mover la vista a la tienda o a la URL: toca pruebas y no aporta, porque Semana ya es el valor por defecto.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/calendario-planeacion.tsx

**Impacto en otros módulos:**
- [bajo] planeacion/e2e (tests/e2e/planeacion-flujo-colaborativo.spec.ts): Specs de planeación usan selectores de filtros; si usan Área o Turnos deben abrir el <details>. No se leyó su contenido.

**Pruebas afectadas:**
- tests/unitarias/planeacion-componentes.test.ts
- tests/unitarias/planeacion-tienda.test.ts
- tests/e2e/planeacion-flujo-colaborativo.spec.ts
- tests/e2e/planeacion-bolsa-acciones.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: botones de vista antes de los filtros en el DOM y Área dentro de <details> cerrado por defecto
- Unitaria RED: la opción de Recurso incluye el área

**Riesgos:**
- Ocultar Área puede sorprender a quien filtra por área; es reversible
- calendario-planeacion.tsx ronda 380 líneas; extraer FiltrosCalendarioPlaneacion si crece
- Un filtro activo dentro de un <details> cerrado puede confundir

**Preguntas al PO:**
- ¿El recurso seleccionado basta para identificar el equipo y Área puede plegarse?

**Evidencia:**
- src/modulos/planeacion/componentes/calendario-planeacion.tsx:126 — vista inicial 'semana' en useState local
- src/modulos/planeacion/componentes/calendario-planeacion.tsx:248-334 — bloque único de filtros; Área antes de Recurso, Turnos y Estados al mismo nivel
- src/modulos/planeacion/componentes/calendario-planeacion.tsx:146-156 — Área y Turno filtran en cliente
- src/modulos/planeacion/componentes/calendario-planeacion.tsx:336-366 — botones de vista debajo de los filtros
- src/modulos/planeacion/componentes/calendario-planeacion.tsx:293-299 — opción de recurso 'codigo · nombre' sin área, filtrada por área

**Notas de verificación:** Citas reabiertas y correctas. Añadí la salvedad del <details> con filtros activos.

### P04 — parcial (corregido) · esfuerzo S

**Estado actual:** Orden (folio) y horas estimadas ya se muestran, y Procesos solo en la tarjeta no compacta. Falta el Ítem: codigo_item se consulta pero no se mapea ni llega al tipo. El título usa codigoPieza, no el ítem. El proceso es por partida (arreglo), no por operación programada.

**Cambio mínimo:** Añadir codigoItem: string | null al tipo y mapearlo en mapearPartida; mostrar 'Ítem {codigoItem}' (o 'Por definir') en la tarjeta; mostrar Proceso también en la compacta en una línea truncada. Dejar etiquetaProcesos intacto hasta que Órdenes entregue su helper de resumen de procesos; entonces sustituir el cuerpo y actualizar planeacion-desglose.test.ts en el mismo commit.

**Enfoque descartado:** Proceso por operación en programacion_areas (migración, cambio de granularidad) o duplicar el helper de resumen en Planeación.

**Archivos a tocar:**
- src/modulos/planeacion/tipos/planeacion.ts
- src/modulos/planeacion/servicios/desglose-servicio.ts
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [medio] ordenes (src/modulos/ordenes/utilidades/procesos.ts): Helper de resumen de procesos planeado por Órdenes; Planeación lo consumirá después
- [bajo] planeacion/panel-asignacion (src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx): Usa etiquetaProcesos; cambiar el helper lo afecta

**Pruebas afectadas:**
- tests/unitarias/planeacion-desglose.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/unitarias/planeacion-servicio.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED: tarjeta con codigoItem muestra el ítem y el folio
- Unitaria RED: tarjeta compacta muestra proceso y horas
- Unitaria RED: mapearPartida devuelve codigoItem

**Riesgos:**
- codigo_item puede ser nulo: mostrar 'Por definir'
- Tarjeta compacta de mes con poco espacio: truncar
- Los literales de DesglosePartidaPlaneacion en pruebas y fixtures deberán incluir el campo nuevo (si es obligatorio, rompe tsc en fixtures; usar opcional o actualizarlos)

**Evidencia:**
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:62 — titulo = folio · codigoPieza, sin ítem
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:93-102 — Procesos solo cuando !compacta
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:132-139 — horas estimadas en pie en ambos modos
- src/modulos/planeacion/servicios/desglose-servicio.ts:20 — SELECT incluye codigo_item y propuesta_item_id; es la única mención de codigo_item en planeacion
- src/modulos/planeacion/tipos/planeacion.ts:84-103 — DesglosePartidaPlaneacion sin campo de ítem

**Notas de verificación:** Se confirmó todo, pero se quita etiquetaProcesos de archivosATocar (no se toca en este corte) y se añade el riesgo de fixtures al añadir un campo al tipo.

**Omisiones halladas por el verificador:**
- tests/unitarias/planeacion-componentes.test.ts: Fixtures de DesglosePartidaPlaneacion deben incluir codigoItem

### P05 — ausente (corregido) · esfuerzo S

**Estado actual:** El <article> solo tiene draggable y onDragStart, sin onClick. Seleccionar abre el panel de asignación, no el contexto de la orden. Bandeja navega a /ordenes?ordenId=; Sesión y Entregar a /produccion?ordenId= y solo existen en la tarjeta no compacta. En el mes no hay ninguna acción de orden.

**Cambio mínimo:** Convertir el título de la tarjeta en un <Link> a /ordenes?ordenId={programacion.ordenId}, también en la compacta, sin onClick en el contenedor para no chocar con el arrastre. Mantener Seleccionar. Recortar las acciones de la tarjeta (Imprimir, Entregar, Sesión, Reactivar) solo si el PO lo confirma y coordinando con Órdenes; no es necesario para cumplir P05, así que va como paso aparte.

**Enfoque descartado:** Panel o modal propio de contexto de orden en Planeación: duplica la ficha de Órdenes, costo L.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [bajo] ordenes (src/app/(privado)/ordenes/page.tsx): El destino es el deep link; si Órdenes lo redirige a la ficha, solo cambia la ruta

**Pruebas afectadas:**
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-bolsa-acciones.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: el título es un enlace a /ordenes?ordenId={ordenId} y no dispara onSeleccionar
- E2E RED: desde /planeacion, el clic en el bloque abre el contexto de la orden correcta

**Riesgos:**
- Recortar acciones rompe E2E que usan accion-* (planeacion-bolsa-acciones, ordenes-estados-sii, entregas-flujo)
- Reactivar debe retirarse una sola vez, coordinado con Órdenes
- Si el tarjetas de la vista día/semana viven dentro de un contenedor con eventos propios, verificar que el enlace no propague

**Preguntas al PO:**
- ¿El clic debe abrir la ficha de la orden en /ordenes o basta un resumen de solo lectura en Planeación?
- ¿Liberar y las demás acciones deben seguir en la tarjeta?

**Evidencia:**
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:71-81 — article sin onClick, solo arrastre
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:145-154 — único disparo de selección: botón Seleccionar
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:163-169 — AccionesTarjetaOrden solo si !compacta y hay onRefrescarOperacion
- src/modulos/planeacion/componentes/acciones-tarjeta-orden.tsx:66, 86, 96 — enrutador.push a /ordenes?ordenId= y /produccion?ordenId=
- src/app/(privado)/ordenes/page.tsx:23-25 — deep link ordenId existente

**Notas de verificación:** Estado confirmado. Reduje el cambio mínimo: el enlace en el título basta para P05; recortar acciones pasa a paso opcional que no se necesita para cumplir y depende de Órdenes. Quité acciones-tarjeta-orden.tsx de archivosATocar.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [baja] Limpiar filtros no restablece la vista (src/modulos/planeacion/componentes/calendario-planeacion.tsx): restablecerFiltros (L206-210) reinicia fechas y tienda pero no la vista local; queda en la vista actual con el rango inicial semanal.
- [baja] Filtros de Área y Turno solo en cliente (src/modulos/planeacion/componentes/calendario-planeacion.tsx): L146-156: el servidor trae todo el rango. Sin impacto en MVP.

### Limitaciones
- No se leyeron los E2E ni el cuerpo de panel-asignacion-planeacion.tsx; los impactos en pruebas vienen del mapa del lector.
- Los hallazgos extra del lector sobre duplicidad de ordenamiento y helpers en page.tsx no se reverificaron y se omiten.
- No se verificó que /ordenes?ordenId= abra la ficha, solo que la página lee el parámetro.

## Área «programacion» (verificada) — Planeación — Programar: pendientes, asignación, datos mínimos, sobrecapacidad y conflictos (P06-P10)

**Cómo funciona hoy:** La unidad programada es partida x recurso (programacion_areas). /planeacion carga las últimas 100 partidas y filtra solo por orden.estado distinto de cancelada/completada; no excluye las ya programadas ni usa estado_sii. Hay una bolsa aparte con sugerencias de primer hueco. El panel de asignación avisa la sobrecapacidad antes de guardar, pero Guardar no se deshabilita. La RPC bloquea con capacidad_insuficiente. El candado de ejecución es un índice único parcial por recurso. No hay compatibilidad recurso-grupo ni recurso-proceso. El historial lo escribe orden_eventos_cambio. La función vigente es la de 20260911000002; las migraciones posteriores solo hacen REVOKE. La tarjeta del calendario ya muestra folio, pieza, procesos (etiquetaProcesos), horas y prioridad.

### P06 — parcial (corregido) · esfuerzo S

**Estado actual:** El selector de partidas toma las últimas 100 partidas de órdenes cuyo estado no es cancelada ni completada. No filtra por estado_sii y no excluye las ya programadas. La bolsa por separado sí es sobre órdenes PLANIFICADA/LISTA/EN_PRODUCCION sin programación activa, con sugerencias de primer hueco (ayuda básica, no APS). Los pendientes son por partida, no por operación.

**Cambio mínimo:** Dejar la bolsa. En page.tsx excluir del selector las partidas con programación activa y alinear el criterio de orden con el de la bolsa. Quitar o subir el tope de 100 o priorizar las pendientes.

**Enfoque descartado:** Tabla o vista nueva de operaciones pendientes o cola priorizada: duplica la bolsa y es APS.

**Archivos a tocar:**
- src/app/(privado)/planeacion/page.tsx

**Impacto en otros módulos:**
- [bajo] ordenes: Criterio de estado que entra a Planeación (C8).

**Pruebas afectadas:**
- tests/unitarias/planeacion-bolsa.test.ts
- tests/e2e/planeacion-bolsa-acciones.spec.ts

**Riesgos:**
- Cambiar el criterio sin alinear con Órdenes puede ocultar partidas.
- El tope de 100 oculta pendientes con volumen.

**Evidencia:**
- src/app/(privado)/planeacion/page.tsx:58-62,93-110 — Selector: últimas 100 partidas, filtro solo por orden.estado; sin estado_sii ni exclusión de ya programadas.
- src/modulos/planeacion/servicios/bolsa-planeacion-servicio.ts:39-70,100-103,172-209 — Bolsa y sugerencias de primer hueco, tope 12.
- src/modulos/planeacion/componentes/operacion-planeacion.tsx:236-241 — Asignar sugerencia invoca la acción directamente.

**Notas de verificación:** Confirmado el estado parcial. Se corrige el archivosATocar: bolsa-planeacion-servicio.ts y panel-bolsa-planeacion.tsx no necesitan cambios, porque los procesos ya viajan en PartidaBolsa.

### P07 — parcial (corregido) · esfuerzo S

**Estado actual:** Asignar recurso, fecha y turno funciona (acción con Zod, can, RPC y registrarLog). La unidad es partida x recurso. El selector lista todos los recursos activos y la RPC no valida compatibilidad. La tarjeta del calendario ya muestra los procesos de la partida.

**Cambio mínimo:** Mantener la unidad partida x recurso. Mostrar los procesos también en el panel de asignación. Filtrar u ordenar el select por grupo de equipo (ver P10). No añadir columna de proceso.

**Enfoque descartado:** Una fila por operación del ruteo: rompe la unicidad, sesiones_trabajo.programacion_id y las pruebas de producción.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx

**Impacto en otros módulos:**
- [bajo] produccion (src/modulos/produccion/servicios/sesiones-servicio.ts): Depende de programacion_id.

**Pruebas afectadas:**
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-flujo-colaborativo.spec.ts
- supabase/tests/c4_2_orden_comercial_operativa.test.sql

**Riesgos:**
- Secuencia manual frágil.

**Evidencia:**
- src/modulos/planeacion/acciones/programar-partida-recurso.ts:17-58 — Flujo estándar safeParse, can y RPC.
- supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:232-358 — Definición vigente de la RPC; sin chequeo de compatibilidad.
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx:62,101 — La tarjeta ya muestra folio, pieza y etiquetaProcesos.
- src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx:385-398 — Select con todos los recursos activos.

**Notas de verificación:** La tarjeta ya muestra procesos (tarjeta líneas 62 y 101), así que se retira de archivosATocar la tarjeta y desglose.ts. El esfuerzo baja de M a S, y el trabajo real se reduce al panel y al filtro de recursos.

### P08 — parcial (corregido) · esfuerzo M

**Estado actual:** programacion_areas guarda orden, partida, recurso, secuencia, estado, fecha, turno, horas y prioridad. No guarda grupo, proceso ni responsable. Los procesos se derivan de la partida y ya se muestran en la tarjeta. El historial lo escribe orden_eventos_cambio (programacion_inicial y reprogramacion_operativa, con actor). Ningún código de src/modulos/planeacion lee orden_eventos_cambio, así que no hay historial ni responsable visibles en la UI.

**Cambio mínimo:** Sin migración: añadir en planeacion-servicio una lectura de orden_eventos_cambio por orden/partida (solo con permiso adecuado) y mostrar responsable e historial en el detalle al hacer clic. El grupo se obtiene por el join recurso -> grupo_equipo. Si el PO exige persistir el responsable, añadir programado_por (migración aditiva).

**Enfoque descartado:** Tabla programacion_historial paralela: duplica orden_eventos_cambio.

**Archivos a tocar:**
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- src/modulos/planeacion/tipos/planeacion.ts
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [medio] ordenes: Lectura de orden_eventos_cambio; respetar su RLS y confidencialidad.

**Pruebas afectadas:**
- tests/unitarias/planeacion-servicio.test.ts
- supabase/tests/c4_2_orden_comercial_operativa.test.sql

**Riesgos:**
- Las programaciones anteriores a C4.2 no tienen evento inicial; mostrar '—'.
- La RLS de orden_eventos_cambio puede impedir la lectura con el rol de Planeación.

**Evidencia:**
- supabase/migrations/20260813201729_fase_6_planeacion_base.sql:75-99 — Columnas de la fila; sin responsable.
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:393-412,440-485 — Eventos con actor, motivo y anterior/nuevo.
- src/modulos/planeacion — Grep de orden_eventos_cambio en el módulo: 0 coincidencias.

**Notas de verificación:** Se confirma que la UI no lee el historial (0 usos en el módulo). Se corrige la limitación del lector: la tarjeta sí muestra folio, pieza, procesos y horas.

### P09 — parcial (confirmado) · esfuerzo S

**Estado actual:** Hay resumen previo y aviso rojo con 'Buscar hueco' antes de guardar. Guardar solo se deshabilita por enviando o preparando, no por !evaluacion.cabe. La RPC bloquea con capacidad_insuficiente. Un slot fuera del rango cargado puede mostrar un falso 'Sin capacidad configurada'.

**Cambio mínimo:** Mostrar el exceso en horas en el aviso. Resolver la carga de una fecha fuera del rango visible. Decisión del PO: bloquear o permitir con confirmación. Sin migración mientras se mantenga el bloqueo.

**Enfoque descartado:** Duplicar el cálculo de capacidad en TypeScript.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx
- src/modulos/planeacion/servicios/capacidad-servicio.ts

**Impacto en otros módulos:**
- [medio] produccion (src/modulos/produccion/servicios/tablero-produccion-servicio.ts): Solo si se permite sobrecarga.

**Pruebas afectadas:**
- tests/unitarias/planeacion-capacidad.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-capacidad.spec.ts

**Riesgos:**
- Expectativa de la nota 'advertir' frente al bloqueo duro actual.

**Preguntas al PO:**
- Al exceder capacidad, ¿se sigue bloqueando o se permite con confirmación y motivo?

**Evidencia:**
- src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx:479-495,530 — El aviso depende de evaluacion.cabe; Guardar disabled={enviando || preparando}.
- supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:308-327 — Bloqueo duro en la RPC.

**Notas de verificación:** Confirmado: líneas 479-495 y 530 del panel, y bloqueo en la RPC.

### P10 — parcial (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** El conflicto simultáneo está cubierto por un candado duro por recurso (índice único parcial más recurso_ocupado en activar_modo_preparacion). No hay compatibilidad recurso-proceso ni recurso-grupo en las RPC ni en la UI. La definición vigente de programar y reprogramar es 20260911000002; las migraciones posteriores solo hacen REVOKE.

**Cambio mínimo:** Primero filtrar y marcar en la UI los recursos del grupo (sin migración) y acordar con el PO la fuente del grupo requerido. Solo después, si el PO pide bloqueo, una migración que redefina ambas RPC con recurso_incompatible, permisiva si falta el grupo.

**Enfoque descartado:** Matriz recurso x proceso o validador de dependencias.

**Migración:** Opcional y en una segunda fase. CREATE OR REPLACE de las dos funciones desde el cuerpo de 20260911000002, con la misma firma. Depende de resolver de dónde sale el grupo de la partida; no se verificó el snapshot de ruteo.

**Archivos a tocar:**
- src/modulos/planeacion/componentes/panel-asignacion-planeacion.tsx
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- supabase/migrations/20261014120000_planeacion_compatibilidad_recurso_grupo.sql

**Impacto en otros módulos:**
- [medio] produccion (supabase/tests/sii_b6_produccion.test.sql): Fixtures pgTAP con recursos arbitrarios.

**Pruebas afectadas:**
- supabase/tests/c4_2_orden_comercial_operativa.test.sql
- supabase/tests/sii_b6_produccion.test.sql

**Riesgos:**
- Datos sin grupo.
- El candado ignora cantidad_equipos > 1.

**Preguntas al PO:**
- ¿La compatibilidad es solo por grupo de equipo?
- ¿Bloquear o solo advertir?
- Con cantidad_equipos > 1, ¿se permiten operaciones simultáneas?

**Evidencia:**
- supabase/migrations/20260813201729_fase_6_planeacion_base.sql:114-119 — Índice único parcial por recurso.
- supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:232,364 — Definiciones vigentes de programar y reprogramar.
- supabase/migrations/20261006100001_sii_b1_catalogos_base.sql:164-170 — recursos_planeacion.grupo_equipo_id.

**Notas de verificación:** Confirmado que 20260911000002 es la definición vigente: el grep de CREATE FUNCTION no muestra redefiniciones posteriores. Se prioriza la ruta de UI sin migración.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] UNIQUE(partida_id, recurso_id) no es parcial (supabase/migrations/20260813201729_fase_6_planeacion_base.sql): Según el informe del lector (no reverificado), cuenta también filas canceladas o completadas y bloquea reprogramar la misma partida en ese recurso.
- [media] La UI de Planeación no lee el historial de orden_eventos_cambio (src/modulos/planeacion): El historial se escribe en BD, pero ningún código del módulo lo muestra.
- [media] Advertir (nota) frente a bloquear (RPC) la sobrecapacidad (supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql): Decisión de producto pendiente.

### Limitaciones
- No se leyó el snapshot de ruteo de la Orden, así que no se confirmó el origen del grupo de equipo.
- No se leyó evaluarAsignacionTurno ni obtener_carga_capacidad_diaria.
- No se reverificó el UNIQUE no parcial ni la cuenta de cantidad_equipos.
- No se abrió panel-bolsa-planeacion.tsx.
- La RLS de orden_eventos_cambio para el rol de Planeación no se verificó.

## Área «reprogramacion» (verificada) — Planeación: reprogramación con historial, compromiso/ruteo intactos, estimado vs real y pausas

**Cómo funciona hoy:** Reprogramar pasa por reprogramarPartidaRecursoAccion (Zod, can gestionar_planeacion, registrarLog) y por la RPC reprogramar_partida_recurso_auditada (solo service_role). La RPC exige motivo y escribe un evento reprogramacion_operativa en orden_eventos_cambio. El compromiso comercial y el snapshot de la Orden están blindados por trigger y la RPC no toca ordenes_produccion. El historial solo se lee en la ficha de la Orden. La capacidad suma horas_estimadas excluyendo cancelada y completada. Las horas reales viven aparte en sesiones_trabajo. La pausa liberable de Producción solo pone una marca recurso_liberado y no libera capacidad en Planeación. Verificación: confirmé el informe y cerré una duda del lector: ambas rutas de reprogramar exigen motivo por el esquema Zod compartido.

### P11 — parcial (corregido) · esfuerzo S

**Estado actual:** Hay reprogramación con historial (quién, cuándo, motivo) escrita en orden_eventos_cambio por la RPC auditada. El motivo es obligatorio (3 a 500 caracteres) en las dos rutas: el esquema Zod de la acción lo exige (validaciones/planeacion.ts:64-68) y tanto el arrastre como el panel de asignación envían datos.motivo (operacion-planeacion.tsx:137-146). La brecha es de visibilidad: en src/ el único lector de orden_eventos_cambio es ficha-orden-servicio.ts:86; Planeación no muestra el historial.

**Cambio mínimo:** Solo lectura: consulta en planeacion-servicio.ts de eventos reprogramacion_operativa filtrados por detalle->>'programacion_id' (con nombre del actor) y lista corta en el contexto del bloque o el diálogo. Sin tabla nueva. Duda cerrada: no hace falta tocar el panel de asignación.

**Enfoque descartado:** Tabla nueva de historial o visor de auditoría propio: duplica orden_eventos_cambio.

**Archivos a tocar:**
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- src/modulos/planeacion/acciones/obtener-historial-programacion.ts
- src/modulos/planeacion/componentes/dialogo-reprogramacion-planeacion.tsx
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [bajo] ordenes (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Lectura compartida; no cambia.

**Pruebas afectadas:**
- tests/unitarias/planeacion-servicio.test.ts
- tests/unitarias/planeacion-componentes.test.ts
- tests/e2e/planeacion-flujo-colaborativo.spec.ts
- supabase/tests/c4_2_orden_comercial_operativa.test.sql

**Pruebas nuevas (RED):**
- Unitaria: el servicio de historial devuelve fecha, actor, motivo y de/a de una programación.
- E2E: reprogramar con motivo y ver motivo y actor en Planeación.

**Riesgos:**
- Filtrar por detalle->>'programacion_id' (eventos por orden).
- RLS de orden_eventos_cambio para quien tenga gestionar_planeacion sin ver la Orden: validar (no leída).

**Preguntas al PO:**
- ¿Basta ver el historial en el contexto del bloque o se quiere una vista aparte?

**Evidencia:**
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:418-489 — RPC auditada con permiso, motivo y evento reprogramacion_operativa.
- src/modulos/planeacion/validaciones/planeacion.ts:64-68 — Zod exige motivo min 3, max 500 en la reprogramación (cubre ambas rutas).
- src/modulos/planeacion/componentes/operacion-planeacion.tsx:137-146 — El panel de asignación reprograma enviando motivo.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:86 — Único lector de orden_eventos_cambio en src/.
- src/modulos/planeacion/acciones/reprogramar-partida-recurso.ts:17-57 — safeParse, can, registrarLog.

**Notas de verificación:** El lector no había verificado si el panel de asignación exige motivo: sí lo exige (Zod en la acción, usado por ambas rutas). Se elimina la prueba nueva 'panel rechaza sin motivo' como necesidad de código; basta con la validación existente.

### P12 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Ninguna ruta de Planeación cambia fecha_compromiso_comercial, snapshot ni ruteo de la partida: el trigger privado.proteger_orden_comercial_c4_2 lo bloquea y la fecha operativa solo cambia por ajustar_orden_post_aceptacion con permiso y evento. Matiz: reprogramar acepta horas_estimadas de la programación (no del snapshot ni de la partida).

**Cambio mínimo:** ninguno

**Pruebas afectadas:**
- supabase/tests/c4_2_orden_comercial_operativa.test.sql

**Pruebas nuevas (RED):**
- pgTAP opcional: tras reprogramar_partida_recurso_auditada no cambian fecha_compromiso_comercial, fecha_operativa, snapshot_json ni tiempo_estimado_minutos.

**Riesgos:**
- Mantener la compuerta set_config solo en ajustar_orden_post_aceptacion.

**Evidencia:**
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:131-140 — alcance_comercial_inmutable.
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:202-214 — Congela procesos y tiempo_estimado_minutos de la partida.
- supabase/tests/c4_2_orden_comercial_operativa.test.sql:95-111 — pgTAP de inmutabilidad.

### P13 — parcial (confirmado) · esfuerzo S

**Estado actual:** La capacidad usa solo horas_estimadas con estados distintos de cancelada y completada; lo real vive en sesiones_trabajo y no reescribe lo estimado, y el snapshot está congelado. Falta mostrar estimado contra real en Planeación. Al completarse, la programación sale de la carga por completo (no se libera solo la diferencia) y el exceso de tiempo real no ocupa capacidad.

**Cambio mínimo:** Dejar el cálculo. Opcional, solo lectura: mostrar horas_netas acumuladas por programacion_id junto a las estimadas en el contexto del bloque.

**Enfoque descartado:** Reescribir horas_estimadas con lo real o recalcular capacidad con remanentes: viola 'no alterar retroactivamente' y obliga a migración.

**Archivos a tocar:**
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [bajo] produccion (src/modulos/produccion/servicios/sesiones-servicio.ts): Solo lectura de horas_netas.

**Pruebas afectadas:**
- tests/unitarias/planeacion-capacidad.test.ts
- supabase/tests/sii_b6_produccion.test.sql

**Pruebas nuevas (RED):**
- pgTAP: cerrar sesión no cambia programacion_areas.horas_estimadas.
- Unitaria: la tarjeta muestra estimado y real por separado.

**Riesgos:**
- Sumar sesiones por programación puede ser costoso en vista de mes.

**Preguntas al PO:**
- Si una operación se pasa del tiempo, ¿debe ocupar capacidad adicional o basta mostrarlo como real?

**Evidencia:**
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:160-170 — Carga = suma de horas_estimadas excluyendo cancelada y completada.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:48 — Horas reales desde sesiones_trabajo.horas_netas.
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:202-214 — Congela tiempo_estimado_minutos.

### P15 — parcial (confirmado) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** La regla existe en Producción (libera_maquina, reclamar_recurso_liberado manual a ≥60 min) pero solo marca sesiones_trabajo.recurso_liberado. En Planeación no tiene efecto: una programación bloqueada sigue contando en la carga y nada indica el recurso liberado.

**Cambio mínimo:** Señalizar en Planeación (etiqueta 'recurso liberado por pausa') leyendo recurso_liberado. Descontar capacidad (migración con CREATE OR REPLACE de obtener_carga_capacidad_diaria) solo si el PO lo decide.

**Enfoque descartado:** Job automático que cancele o reprograme a los 60 min: contradice la regla manual.

**Migración:** Solo si descuenta capacidad: redefinir obtener_carga_capacidad_diaria (última en 20260919000007) con NOT EXISTS de sesión con recurso_liberado = true. La señalización no requiere migración.

**Archivos a tocar:**
- src/modulos/planeacion/servicios/planeacion-servicio.ts
- src/modulos/planeacion/componentes/tarjeta-programacion-planeacion.tsx

**Impacto en otros módulos:**
- [medio] dashboard/kpis (supabase/migrations/20261007210001_sii_b9_kpis.sql): Comparte lectura de capacidad; cambiaría utilización.
- [medio] produccion (src/modulos/produccion/servicios/consultas-b6-servicio.ts): Al reanudar debe revalidar capacidad.

**Pruebas afectadas:**
- supabase/tests/sii_b6_produccion.test.sql
- tests/unitarias/planeacion-capacidad.test.ts

**Pruebas nuevas (RED):**
- pgTAP: tras reclamar_recurso_liberado, la carga refleja la decisión del PO.
- Unitaria: etiqueta 'liberado por pausa'.

**Riesgos:**
- Si se descuentan horas, al reanudar se puede sobrecargar el día; revalidación no verificada.

**Preguntas al PO:**
- ¿La liberación por pausa solo avisa o también descuenta horas de la capacidad?

**Evidencia:**
- supabase/migrations/20261007130002_sii_b6_produccion_acciones.sql:1189-1209 — Solo UPDATE recurso_liberado = true.
- supabase/migrations/20260919000007_d02_capacidad_instalada.sql:168 — La carga solo excluye cancelada y completada.
- src/modulos/produccion/acciones/reclamar-recurso.ts:28-51 — Acción manual con can y registrarLog.
- docs/plan-erp-sii/06-produccion.md:62 — Regla acordada.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Bloqueada sigue contando como capacidad ocupada tras liberar el recurso (supabase/migrations/20260919000007_d02_capacidad_instalada.sql): La carga (líneas 160-170) solo excluye cancelada y completada; una programación bloqueada con recurso liberado sigue sumando horas.
- [baja] El exceso de tiempo real no se refleja en capacidad (supabase/migrations/20260919000007_d02_capacidad_instalada.sql): Coherente con no alterar el estimado, pero no cubre 'la programación debe reflejar el exceso'; decisión del PO.

### Limitaciones
- No leí el cuerpo de reprogramar_partida_recurso (motor de capacidad) ni los candados de conflicto.
- No verifiqué si al reanudar una sesión se revalida capacidad (solo lo dice el doc).
- No leí la RLS de orden_eventos_cambio ni el código de cierre de sesión que pasa la programación a completada.
- Revisión de solo lectura con presupuesto reducido; sin ejecutar pruebas.
