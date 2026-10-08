# Contratos compartidos — Corte 0

Estado: **aprobado para implementar `DC-01..DC-15` en cortes incrementales**. Este documento fija significados, invariantes y fronteras entre módulos antes de crear migraciones o repartir archivos entre Codex y Claude. Los nombres SQL definitivos se implementarán de forma aditiva sobre el esquema indicado aquí; cualquier cambio semántico requiere una decisión nueva, no una reinterpretación silenciosa.

## 1. Baseline confirmado

- El RFQ usa `pipeline` como cabecera y ya posee `estado_rfq = INCOMPLETE`; sus ítems viven en `rfq_items` y conservan un `ITxx` único por RFQ.
- La fecha solicitada por el cliente existe hoy como `pipeline.fecha_requerida`, pero todavía no forma parte del tipo ni de la ficha RFQ nueva. No debe reutilizarse como fecha compromiso.
- Crear Propuesta Rev A es una acción explícita. La revisión copia cabecera e ítems del RFQ y el RFQ pasa a `CONVERTED`.
- La aceptación (`aceptar_revision`) y la creación idempotente de Orden (`crear_orden_desde_revision`) son operaciones separadas. La Orden ya posee unicidad parcial por `propuesta_revision_id`, pero actualmente deriva `fecha_compromiso` de `pipeline.fecha_requerida` y permite modificarla como dato operativo.
- `grupos_equipo` no posee tarifa. `recursos_planeacion.costo_hora_interno` es obligatorio y usa cero como valor predeterminado, por lo que no distingue “sin override” de un override igual a cero.
- `catalogo_materiales` es el catálogo comercial nuevo. `materiales`, movimientos, existencias y kardex pertenecen al inventario legado. El consumo actual depende de `materiales`, descuenta stock y solo congela el costo unitario.

## 2. Convenciones transversales

1. Todas las mutaciones de negocio sensibles se ejecutan en servidor/RPC, con permiso, actor, fecha, `correlation_id` y control de concurrencia.
2. Los historiales y snapshots son append-only: la aplicación ordinaria no actualiza ni elimina una versión histórica.
3. Las bajas funcionales son lógicas. Ningún `ITxx`, archivo, costo confirmado o evento histórico se reutiliza ni destruye.
4. Los datos congelados se leen desde su snapshot; nunca se recalculan desde un maestro vigente.
5. Los DTO para operación excluyen precio, costo, margen, moneda y cualquier otro dato financiero, aunque la UI no lo muestre.
6. No se crean propuestas, órdenes, movimientos de stock ni cambios de costo como efecto lateral de navegar o consultar.
7. Las migraciones son aditivas y se verifican solo en Supabase local hasta autorización expresa del Product Owner.

## 3. Contrato RFQ

### 3.1 Fechas y canal

| Concepto | Persistencia canónica | Regla |
| --- | --- | --- |
| Fecha requerida por cliente | `pipeline.fecha_requerida` durante la compatibilidad; DTO `fechaRequeridaCliente` | Opcional, informativa y editable solo antes de crear Rev A. No crea ni reprograma una Orden. |
| Fecha compromiso comercial | Nueva columna en la aceptación/revisión aceptada y copia inmutable en la Orden; DTO `fechaCompromisoComercial` | Obligatoria al aceptar. Representa lo prometido al cliente y no se modifica por planeación. |
| Fecha operativa | Nueva columna explícita de Orden/planeación; DTO `fechaOperativa` | Puede reprogramarse con motivo, actor, fecha e historial. No altera la fecha compromiso comercial. |

`ordenes_produccion.fecha_compromiso` es legado ambiguo. La migración debe copiar su valor a los campos explícitos según el origen disponible, mantener compatibilidad temporal y migrar consumidores antes de retirarlo o redefinirlo. Nunca se vuelve a derivar automáticamente la fecha compromiso comercial desde la fecha requerida.

El canal deja de ser texto libre y referencia un catálogo configurable con códigos estables para `WHATSAPP`, `CORREO`, `TELEFONO`, `VISITA`, `REFERIDO` y `OTRO`. Un registro histórico conserva el código aunque el catálogo se desactive. `OTRO` exige `canalDetalle` no vacío; los demás rechazan detalle residual. El backfill mapea valores conocidos sin perder el texto original y envía valores desconocidos a `OTRO` con detalle.

### 3.2 Borrador recuperable y estados

- Al iniciar captura se persiste un RFQ con `INCOMPLETE` antes de guardar ítems o archivos.
- Cada guardado del wizard actualiza el mismo `rfq_id`; reabrirlo devuelve el último paso completo y todos los datos confirmados.
- Cerrar, recargar, perder conectividad o fallar una subida no elimina cabecera, ítems ni archivos confirmados.
- Una subida preparada pero no confirmada puede reintentarse o descartarse sin afectar lo ya confirmado.
- `Continuar captura` opera sobre el mismo RFQ. Nunca clona ni genera un folio nuevo.
- Finalizar valida los campos mínimos y transiciona atómicamente fuera de `INCOMPLETE`.
- Los estados terminales `CLOSED` y `CANCELLED` no exigen próxima acción; la transición exige el motivo o resultado definido para ese estado. Las transiciones no terminales que requieran seguimiento guardan estado y próxima acción en la misma transacción.

### 3.3 Versionado y congelamiento

Una nueva tabla `rfq_versiones` debe guardar, como mínimo:

- `rfq_id`, número monotónico, `snapshot_cabecera`, `snapshot_items`, causa, actor, `correlation_id` y fecha;
- una restricción única por `(rfq_id, numero)` y asignación serializada;
- prohibición de `UPDATE` y `DELETE` desde roles de aplicación.

El snapshot incluye cabecera e ítems activos/cancelados con sus operaciones. No copia blobs ni seguimientos. Archivos y acciones comerciales conservan sus propios historiales y solo se relacionan por entidad/identificador.

Crear explícitamente Propuesta Rev A genera la versión final del RFQ y lo congela en la misma operación. Después de esa frontera, las mutaciones de cabecera/ítems del RFQ fallan con un código estable; abrir Resumen, Propuestas, Seguimiento o Historial nunca ejecuta esa acción.

## 4. Contrato de archivos

- La identidad de una versión es `entidad + entidad_id + tema + nombre + version`; reemplazar crea metadata nueva y marca la anterior no vigente, sin sobrescribir ni borrar el blob histórico.
- La vista ordinaria puede mostrar vigentes; `Ver versiones` consulta también no vigentes y no ofrece borrado físico.
- La pertenencia (`RFQ`, `ITxx`, revisión, Orden) y el origen se muestran siempre. Heredar significa referenciar la misma metadata/blob autorizado, no duplicarlo.
- DXF y DWG deben aparecer en ayuda y `accept`, conservar validación servidor y probar subida/descarga directa mayor de 1 MiB.
- Los archivos de `rfq_item` autorizados viajan por referencia a Propuesta, snapshot de Orden y piso de producción.

## 5. Contrato de tarifa y ruteo

### 5.1 Fuente de tarifa

- `grupos_equipo` incorpora una tarifa estándar vigente no negativa, su moneda de costeo y versionado mediante el mecanismo de catálogos.
- El recurso/máquina incorpora un indicador explícito de override y un valor opcional. `override_activo = false` usa el Grupo; `override_activo = true` exige tarifa no negativa. El número cero nunca significa por sí solo “sin override”.
- Sin tarifa resoluble, el costeo falla con un código estable y un mensaje que identifica el Grupo/Recurso a configurar. No se calcula silenciosamente con cero.

### 5.2 Snapshot por fila

Cada fila de `propuesta_item_ruteo` congela al costear:

- horas de preparación, horas de operación y total;
- una única tarifa por hora para ambas clases en el MVP;
- costo de preparación, costo de operación y total;
- fuente `GRUPO` o `RECURSO`, grupo, recurso opcional, moneda y fecha del snapshot.

Cambiar la tarifa maestra no altera revisiones previas. Los costos manuales deben usar categorías excluyentes respecto del costo generado por ruteo para impedir doble conteo.

## 6. Contrato de aceptación y Orden pendiente

La acción comercial autorizada recibe `revisionId`, `fechaCompromisoComercial`, versión esperada y datos auditables. En una sola transacción:

1. valida y acepta la revisión exacta;
2. congela la fecha compromiso comercial;
3. crea o recupera una solicitud durable de Orden única por revisión aceptada.

La solicitud posee estados estables `PENDING`, `BLOCKED` y `CREATED`, causa/código seguro, número de intentos, actor/fechas y `orden_id` cuando exista. Un fallo de crédito, tipo de cambio, cliente u otra validación de Orden cambia la solicitud a `BLOCKED`, pero no revierte la aceptación. La UI muestra `Orden pendiente`, causa accionable y `Reintentar` según permiso.

El procesador y el reintento son idempotentes. La unicidad de la solicitud y el índice actual de `ordenes_produccion.propuesta_revision_id` forman la defensa en profundidad: llamadas repetidas o concurrentes convergen en exactamente una Orden y devuelven su identificador.

## 7. Contrato de Orden

El snapshot comercial inmutable conserva revisión aceptada, alcance, ítems, cantidades, precios, moneda, impuestos/total y fecha compromiso comercial original. No se aceptan mutaciones posteriores de esos campos.

Solo pueden cambiar prioridad, fecha operativa, recurso/programación y notas operativas. Cada cambio exige versión esperada, motivo, actor y evento con anterior/nuevo. El RPC legado `ajustar_orden_post_aceptacion` debe dejar de aceptar cambios de cantidades/descripción y no debe modificar el compromiso comercial.

## 8. Contrato de Materiales y costos

`catalogo_materiales` pasa a ser la fuente canónica para nuevas capturas y añade:

- unidad base configurable;
- moneda de costo `MXN` o `USD`;
- último costo confirmado y fecha de vigencia.

El historial de costo es append-only y guarda material, valor anterior, valor nuevo, moneda, fecha efectiva, fuente (`MANUAL`, `COMPRA` o `GASTO`), referencia, actor y fecha de confirmación. Compra/Gasto crea una propuesta de actualización; solo una confirmación autorizada y concurrentemente segura cambia el maestro. Ninguna compra lo cambia automáticamente.

El nuevo consumo de Orden referencia `catalogo_materiales` y congela cantidad, unidad, costo unitario, moneda, tipo de cambio aplicado, costo en moneda base, actor y fecha. Registrar consumo no crea movimientos, reservas ni cambios de existencia. Los consumos/inventario legados permanecen consultables en solo lectura y rentabilidad debe sumar cada origen una sola vez.

## 9. Contrato de UI, accesibilidad y pruebas

- Se mantiene la identidad visual actual y se usan tokens semánticos, nunca colores literales copiados de las capturas.
- Los estados no dependen solo del color; incluyen texto o icono accesible y contraste AA en claro/oscuro.
- Anchos de referencia obligatorios: 320, 768, 1024 y 1440 px.
- Selectores estables reservados: `rfq-lista`, `rfq-continuar-captura`, `rfq-resumen`, `rfq-datos-generales`, `rfq-proxima-accion`, `rfq-descripcion`, `propuesta-orden-pendiente`, `propuesta-reintentar-orden`, `vista-operador-solo-lectura`.

Caracterización mínima antes de cada migración conductual:

| Riesgo | Evidencia requerida |
| --- | --- |
| Navegar/editar crea propuesta | Prueba negativa que compara propuestas antes/después. |
| Reemplazo de archivo pierde historia | Integración que conserva ambas versiones y solo una vigente. |
| Nueva revisión altera la anterior | Prueba de snapshots/ítems/ruteo independientes. |
| Fallo de Orden pierde aceptación | Integración que conserva `ACCEPTED` y deja solicitud `BLOCKED`. |
| Carrera crea dos Órdenes | Dos conexiones y aserción de una solicitud/una Orden. |
| Cambio de tarifa reescribe historia | Prueba de snapshot previo inalterado. |
| Consumo modifica inventario | Prueba negativa sobre existencias/movimientos y positiva sobre snapshot económico. |

## 10. Secuencia y frontera de trabajo paralelo

1. Caracterizar comportamiento vigente y registrar baseline visual.
2. Migrar/validar contrato servidor en una sola rama de responsabilidad.
3. Regenerar tipos y adaptar servicios/DTO.
4. Implementar UI sobre el contrato ya verificado.
5. Ejecutar pruebas focales, integración/concurrencia cuando aplique, revisión visual y `cross-review`.

Codex y Claude no editan simultáneamente migraciones, tipos generados, contratos o componentes comunes. Cada encargo debe declarar archivos exclusivos en `ACTIVE_TASKS.md`; Codex conserva Git, integración, acciones remotas y aceptación final.
