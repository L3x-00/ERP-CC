# Decisiones aceptadas del cliente — 2026-10-07

Estado: **fuente funcional aprobada para fortalecer el plan y preparar la implementación**.

Estas decisiones sustituyen las recomendaciones provisionales de `PREGUNTAS-PARA-EL-CLIENTE.md`. Una modificación posterior debe registrarse con fecha, autor y requisitos afectados; no se reinterpretará silenciosamente durante el desarrollo.

| ID | Decisión del cliente | Consecuencia obligatoria |
| --- | --- | --- |
| DC-01 | Retirar Orden de compra y Horas estimadas del alta. Mantener Fecha requerida por cliente como opcional. Fecha compromiso es distinta y se confirma antes de aceptar/crear Orden. | Separar `fecha_requerida_cliente` de `fecha_compromiso_comercial`; no derivar una de la otra silenciosamente. |
| DC-02 | Catálogo configurable: WhatsApp, Correo, Teléfono, Visita, Referido y Otro; Otro exige detalle. | Catálogo administrable y validación condicional del detalle, reutilizable en RFQ y seguimiento comercial. |
| DC-03 | Un alta interrumpida se conserva como `INCOMPLETO` y permite Continuar captura; no se pierden datos ni archivos guardados. | Borrador durable, reanudación idempotente y tratamiento explícito de subidas preparadas/confirmadas. |
| DC-04 | La versión RFQ congela cabecera + ítems; archivos y seguimientos tienen historial independiente. | Snapshot RFQ append-only sin copiar blobs ni acciones de seguimiento. |
| DC-05 | El RFQ se congela al crear Propuesta Rev A. | La creación explícita de Rev A es la frontera de inmutabilidad del RFQ. |
| DC-06 | Próxima acción no obligatoria en estados terminales; exigir motivo/resultado cuando corresponda. | Contrato de transición por estado, dentro de la misma operación atómica. |
| DC-07 | Tarifa estándar por Grupo de Equipo, con override opcional por recurso/máquina. Misma tarifa para preparación + operación inicialmente. | Fuente canónica en Grupo de Equipo; override distinguible de “cero”; snapshot de tarifa y fuente por renglón de ruteo. |
| DC-08 | Se permiten ítems nuevos en una revisión de Propuesta, con IT consecutivo estable y referencia de revisión de alta. El RFQ no cambia. | Numeración monotónica por oportunidad/propuesta, baja lógica e historial de origen. |
| DC-09 | Comercial acepta una revisión exacta y confirma fecha compromiso. Si la Orden falla, conservar aceptación como `Orden pendiente`, causa y reintento idempotente. Debe existir exactamente una Orden. | Aceptación durable + solicitud de orden única; reintentos convergentes y permisos explícitos para aceptar/reintentar. |
| DC-10 | Congelar alcance comercial, ítems, cantidades, precios, moneda y revisión aceptada. Permitir prioridad, fecha operativa, recurso y notas con historial. Fecha compromiso original separada. | Snapshot comercial inmutable y planificación operativa versionada/auditada. |
| DC-11 | “Ver como operador” sin PIN, temporal, auditado y solo lectura en el MVP. | Delegación segura sin acciones productivas ni reutilización del PIN. |
| DC-12 | Retirar la operación diaria de inventario; conservar movimientos, existencias y kardex históricos en solo lectura. Usar “Materiales y costos”. | Migración aditiva, ocultar/bloquear nuevas operaciones de stock y no eliminar historia. |
| DC-13 | Último costo manual o propuesto por Compra/Gasto; una compra requiere confirmación y no cambia automáticamente el maestro. | Flujo proponer/confirmar y auditoría append-only de anterior, nuevo, moneda, fecha, fuente y actor. |
| DC-14 | Materiales en MXN/USD y unidad base configurable. El consumo congela costo, moneda, tipo de cambio, unidad y cantidad. | Snapshot económico completo por consumo y conversión reproducible. |
| DC-15 | Mantener identidad actual; usar tokens semánticos accesibles. No existe paleta corporativa obligatoria. | No copiar colores literales de las capturas; validar contraste, estados y temas con tokens. |

## Refinamientos posteriores

| Fecha | Autor | Requisito afectado | Ajuste |
| --- | --- | --- | --- |
| 2026-10-10 | Product Owner | DC-12 | El módulo visible «Materiales y costos» deja de mostrar las vistas históricas de existencias y kardex para reflejar la lógica ligera del cliente (catálogo con unidad base, costo vigente e historial; consumo y costo congelado viven en las órdenes). Los datos y servicios legados no se destruyen: permanecen en base y sus RLS endurecidas, sin exponerse en la interfaz. |
| 2026-10-10 | Product Owner | DC-08 | La ficha de Propuesta reemplaza el botón «Actualizar» por «Crear nueva versión», con diálogo de motivo y «Historial de versiones» navegable en solo lectura; el vocabulario visible de la acción pasa de «revisión» a «versión». |
| 2026-10-11 | Product Owner | DC-08 | «Listo para enviar» también admite «Crear nueva versión» (migración `20261011130000`): permite ajustar antes de enviar sin editar la revisión validada, que queda en el historial. En borrador no se ofrece (se edita directamente). El resultado de «Generar PDF» se muestra explícitamente con acceso «Ver PDF». |
| 2026-10-11 | Product Owner | DC-06 | El seguimiento de la Propuesta se captura en un modal: «Validar» lo exige (el servidor registra la próxima acción y luego valida, sin duplicar en reintentos) y la pestaña Seguimiento lo reutiliza para registros posteriores. En RFQ la próxima acción sigue siendo obligatoria en el modal de «Marcar listo» y en cada transición de estado. |
| 2026-10-13 | Product Owner | DC-12 | Obs. 8: «Materiales y costos» recupera una lógica ligera propia. (1) Grupos/subgrupos de materiales con `catalogo_materiales.padre_id` («Acero al carbón» → subítems); (2) alta/edición de material en el módulo (código, nombre, grupo, unidad, espesores y costo inicial vía confirmación autorizada), con Materiales/Espesores retirados de Configuración → Catálogos base (misma tabla y versionado); (3) existencias como saldo manual con historial —`saldos_material` + `movimientos_saldo_material` append-only, granularidad material + espesor, RPC atómica `ajustar_saldo_material` con permiso `gestionar_inventario`—, y el consumo NO descuenta. La historia legada de inventario (kardex/existencias antiguos) permanece oculta y sin tocar. |
| 2026-10-13 | Product Owner | DC-08 | Propuesta: «Agregar ítem» existe también en la revisión A (antes solo B..Z) y la tabla de ítems muestra Material y Espesor heredados del RFQ. Migración `20261014100000` retira la guarda `item_nuevo_solo_revision` de `agregar_item_propuesta`; el resto de la RPC (ITxx bajo lock, origen = la revisión donde nace, RFQ intacto) no cambia. |
| 2026-10-13 | Product Owner | DC-07 | Ruteo: se retira el campo «Máquina» (la tarifa sale del Grupo de Equipo) y el Grupo de Equipo se rellena solo al elegir el proceso —el configurado en el proceso o el grupo que se llama igual por nombre/código—, también en las filas que nacen del RFQ. El override por máquina permanece en base para registros históricos pero ya no se captura. |
| 2026-10-13 | Product Owner | DC-07 | Costeo interno de la Propuesta: solo se capturan Material y Otros (categoría `gastos_directos` rotulada «Otros»); máquina y mano de obra salen del ruteo costeado. Los montos históricos de las demás categorías se conservan, siguen sumando al total y se avisan. |
| 2026-10-13 | Product Owner | DC-06 | «Validar» una Propuesta exige al menos un ítem activo, ruteo costeado por proceso en cada ítem y al menos un archivo (propio, por ítem o heredado del RFQ). La ficha marca en rojo suave lo faltante y bloquea el botón; el servidor lo revalida antes de registrar el seguimiento o validar. |
| 2026-10-13 | Product Owner | DC-07 | Tarifario único: la tarifa por hora de «Tarifas / TC» (estaciones: Corte láser, Router CNC, Dobladora, Soldadura, Mano de obra, Acabado) alimenta el costeo del ruteo. Cada Grupo de Equipo se vincula a una estación (`grupos_equipo.estacion_tarifa`, migración `20261014110000`) y la resolución es: tarifa de la máquina > tarifa propia del grupo > tarifa de la estación vinculada (MXN) > bloqueo. El tarifario por grupo y por máquina se configura solo en Configuración → Tarifas / TC (ya no en Catálogos base). El snapshot del renglón congela fuente `ESTACION`. Vínculo inicial por código de los grupos sembrados (LASER_FIBRA→láser, CNC_ROUTER→router, PRESS_BRAKE→dobladora, SOLDADURA→soldadura, MAQUINADO→mano de obra), editable. |
| 2026-10-13 | Product Owner | DC-07 | Costeo interno de la Propuesta: Material y Otros son campos de texto libre (aceptan símbolo de moneda y separadores; se interpretan como monto) con un detalle opcional por categoría; las tarifas propias de grupo y máquina también. |
| 2026-10-13 | Product Owner | DC-08 | Propuesta → Ítems: «Nuevo ítem» abre un formulario plegable (sin el título «Agregar ítem a la revisión X») que se cierra al agregar. «Costear ruteo» guarda antes el ruteo pendiente de los ítems y costea en un solo paso. |

## Invariantes transversales

- Ninguna navegación o edición crea una Propuesta implícitamente.
- No se sobrescriben ni eliminan físicamente archivos históricos desde la interfaz ordinaria.
- Operación no recibe precios, costos, márgenes ni moneda en su payload.
- La aceptación comercial no se revierte por un fallo técnico o de validación al crear la Orden.
- Los datos históricos de inventario y costos no se destruyen.
- Cada mutación de estado, versión, costo o delegación conserva actor y fecha.

## Límite de esta aprobación

Estas decisiones autorizan cerrar el diseño y preparar el entorno. La ejecución seguirá cortes pequeños, pruebas RED/GREEN, revisión Codex y commits atómicos. No autorizan acciones remotas, migraciones en producción, push, despliegue ni eliminación de datos.
