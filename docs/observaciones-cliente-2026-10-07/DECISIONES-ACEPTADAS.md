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

## Invariantes transversales

- Ninguna navegación o edición crea una Propuesta implícitamente.
- No se sobrescriben ni eliminan físicamente archivos históricos desde la interfaz ordinaria.
- Operación no recibe precios, costos, márgenes ni moneda en su payload.
- La aceptación comercial no se revierte por un fallo técnico o de validación al crear la Orden.
- Los datos históricos de inventario y costos no se destruyen.
- Cada mutación de estado, versión, costo o delegación conserva actor y fecha.

## Límite de esta aprobación

Estas decisiones autorizan cerrar el diseño y preparar el entorno. La ejecución seguirá cortes pequeños, pruebas RED/GREEN, revisión Codex y commits atómicos. No autorizan acciones remotas, migraciones en producción, push, despliegue ni eliminación de datos.
