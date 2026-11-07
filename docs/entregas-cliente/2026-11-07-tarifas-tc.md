# Ajuste de tarifas / TC — regla V1 del ruteo

**Cliente:** CC Manufacturing  
**Documento base:** aclaraciones del 06/11/2026 — tarifas / TC  
**Fecha de respuesta:** 07/11/2026  
**Alcance:** tarifa estándar por grupo de equipo, tarifa propia por máquina, tarifa de respaldo y visibilidad del origen en el ruteo/costeo.

---

## 1. Regla aplicada

Cada operación del ruteo se costea con esta prioridad, en este orden:

1. **Tarifa propia de la máquina**, solo si su override está activo de forma explícita.
2. **Tarifa estándar del grupo de equipo**: es la **fuente maestra** del costeo. La estación de Tarifas / TC es solo una referencia para copiar su valor y no compite en el cálculo.
3. **Tarifa de respaldo**, únicamente cuando el grupo no tiene tarifa estándar. Es una excepción temporal de V1, candidata a revisión/eliminación en V2.

La tarifa de respaldo **nunca se usa en silencio**. El sistema la marca con advertencia, muestra el valor utilizado y el grupo que no tiene tarifa configurada.

## 2. Qué se corrigió

| Punto de la aclaración | Cómo quedó resuelto |
| --- | --- |
| Duplicidad de tarifa estación/grupo | La **tarifa del grupo es la fuente maestra**. La estación de Tarifas / TC queda solo como referencia para copiar su valor; no compite en el cálculo. |
| Fallback silencioso al costo de respaldo | El respaldo es el último recurso y devuelve `advertencia = true`, el valor utilizado y el grupo sin tarifa. Sin respaldo configurado, el costeo se bloquea en vez de inventar un valor. |
| Tarifa por máquina obligatoria | No se obliga a capturarla. La máquina solo la usa si se activa un override explícito; si no, hereda la del grupo. |
| Grupos planeados como nivel obligatorio | El grupo planeado no participa en el costeo ni es obligatorio: se conserva solo como dato de planeación. El vínculo que importa es Proceso → Grupo de equipo. |
| Navegación fragmentada | El **alta guiada de un grupo de equipo** permite capturar su tarifa estándar y marcar sus **procesos compatibles** en el mismo formulario, sin salir a otro catálogo. |
| Alta de equipos fragmentada | **Nuevo equipo** pide en un solo formulario nombre, código, grupo, tarifa heredada, excepción de tarifa propia, área y estado. El equipo queda listo para Planeación al guardar. |
| Origen de la tarifa invisible | Cada operación del ruteo y el desglose de fabricación muestran **Proceso / Grupo o máquina / Tarifa / Origen**. La ficha advierte antes de enviar. |
| Respaldo como tarifa normal | Se conserva solo como **protección de excepción V1**; la UI y el código lo marcan como candidato a revisión/eliminación en V2. |

## 3. Qué ve el usuario

En el ruteo, cada operación muestra:

| Proceso | Grupo / máquina | Tarifa | Origen |
| --- | --- | --- | --- |
| Corte láser fibra | Láser Fibra | $512.50/h | Tarifa del grupo |
| Doblado CNC | Press Brake | $512.50/h | Tarifa del grupo |
| Proceso especial | Máquina 02 | $650.00/h | Tarifa propia de la máquina |
| Sin tarifa estándar | Grupo X | $649.99/h | **Advertencia: tarifa de respaldo · Grupo X** |

El origen queda congelado al costear: aunque después cambien los catálogos, la propuesta conserva la explicación de la tarifa que usó.

## 4. Reglas de captura

- Cada fila del ruteo exige un **grupo de equipo**.
- El proceso se vincula a un **grupo de equipo compatible**; no se exige configurar «Grupo planeado».
- La **tarifa estándar del grupo** es la fuente maestra. La estación de Tarifas / TC solo sirve para copiar su valor.
- La tarifa propia de la máquina es opcional y solo se usa cuando está activa.
- Si un grupo no tiene tarifa estándar y existe respaldo, el costo se calcula con respaldo y se marca con advertencia, indicando el valor y el grupo.
- Si no existe respaldo, el costeo se bloquea y se indica exactamente qué configurar.
- Un equipo se **desactiva**, no se borra: conserva su historial y puede reactivarse.

## 5. Escenario de aceptación

1. Se crea el grupo **Láser Fibra** desde el Tarifario del ruteo con su **tarifa estándar** y se marcan los procesos **Corte láser** (y los compatibles) en el mismo formulario.
2. En una propuesta, la operación muestra **Tarifa del grupo** y su monto.
3. Si se activa una tarifa propia a la máquina **Láser 01**, la operación muestra **Tarifa propia de la máquina**.
4. Si se deja el grupo sin tarifa estándar, la operación muestra **Advertencia: tarifa de respaldo** con el valor utilizado y el nombre del grupo.
5. La ficha de la propuesta lista ese ítem en el aviso de tarifa de respaldo antes de enviarla.

### Alta guiada de un equipo

1. En **Tarifas / TC → Tarifario del ruteo** se pulsa **Nuevo equipo**.
2. Se captura **LASER-01**, nombre **Láser Fibra 01** y grupo **Láser Fibra**.
3. El sistema muestra **Tarifa heredada: $512.50/h**.
4. Se responde **No** a «¿Esta máquina tiene un costo distinto al grupo?».
5. Al guardar, el equipo queda activo y disponible en Planeación con la tarifa del grupo.
6. Si se responde **Sí**, aparece la tarifa propia y el sistema explica que sustituye la del grupo solo para esa máquina.

## 6. Fuera de alcance

- Prorrateo de costos entre órdenes.
- Inventario físico, kardex o saldos.
- Distribución automática de costos no solicitada.
- Conversión silenciosa de moneda: una tarifa en moneda distinta a la propuesta sigue bloqueando el costeo para que se decida explícitamente.

## 7. Verificación técnica

- Tipos, lint y build sin errores.
- Pruebas unitarias: **295 archivos / 2,506 pruebas**, todas en verde.
- Pruebas pgTAP de tarifario único, C3.2, C3.3 y corrida integrada en verde en la base local (26, 17, 16 y 11 aserciones).
- Migraciones `20261107120000_t1_tarifas_ruteo_v1.sql` y `20261107130000_t2_tarifa_grupo_maestra.sql` aplicadas en local; **pendientes de aplicar en remoto** con autorización del Product Owner.
