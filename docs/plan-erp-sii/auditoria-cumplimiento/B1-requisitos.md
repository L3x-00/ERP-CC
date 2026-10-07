# B1 — Matriz normativa de requisitos

Fuente principal: `docs/ERP_SII_Handoff_Tecnico_Funcional.md`. Complementos: decisiones finales del cliente y `docs/plan-erp-sii/01-sistema-catalogos.md`. Esta matriz persiste la especificación que antes existía solo dentro del workflow de auditoría.

## Roles y permisos

| ID | Fuente | Regla verificable |
|---|---|---|
| R-B1-01 | §5, líneas 159-180 | Existen cinco responsabilidades: Operator, Customer Service, Administrative, Management y Admin, mapeadas a los roles del sistema. |
| R-B1-02 | §5, línea 162 | Operator no ve precios, costos ni importes comerciales. |
| R-B1-03 | §5, líneas 162-163 | Cada operador usa credencial individual y sus acciones quedan trazadas por operador. |
| R-B1-04 | §5, líneas 164-168 | Customer Service opera clientes, RFQ, propuestas y seguimiento. |
| R-B1-05 | §5, líneas 169-172 | Administrative gestiona facturación, CxC, pagos y cierres administrativos, con consulta comercial. |
| R-B1-06 | §5, líneas 172-173 | Los permisos de crédito de Administrative están separados. |
| R-B1-07 | §5, líneas 174-177 | Management tiene supervisión, aprobaciones y acceso amplio; catálogos según permiso. |
| R-B1-08 | §5, línea 179 | Admin gestiona sistema, permisos y configuración. |
| R-B1-09 | §5, líneas 179-180 | Un Admin no puede eliminar accidentalmente su propio acceso crítico ni dejar el sistema sin admin activo. |
| R-B1-10 | §5, líneas 182-184 | Los permisos son por acción: ver propuesta, editar artículo, editar precio, enviar y crear revisión, entre otros. |
| R-B1-11 | §5/§6/§19 | Los permisos se aplican en servidor, tanto en Server Actions como en RPC/RLS. |
| R-B1-12 | Decisiones #1/#2 | Customer Service edita artículos, precio y ruteo; costo y margen solo Management/Admin. |

## Catálogos

| ID | Fuente | Regla verificable |
|---|---|---|
| R-B1-13 | §15.1, líneas 572-573 | Materiales iniciales: Acero al carbón, Galvanizado, Inoxidable, Aluminio, Birch, MDF, Acrílico y Plástico ingeniería. |
| R-B1-14 | §15.1, línea 574 | Espesores dependientes del material, con milímetros normalizados y etiqueta. |
| R-B1-15 | §15.1, líneas 575-576 | Procesos iniciales: Láser fibra, Doblado CNC, Soldadura, CNC Router, Láser CO₂, Marcado láser, Maquinado/Fabricación y Acabado. |
| R-B1-16 | §15.1, líneas 577-578 | Grupos de equipo configurables (CNC Router, Láser Fibra, Press Brake, etc.). |
| R-B1-17 | §15.1, línea 579 | Grupos planeados iniciales: Corte, Doblado, Soldadura, Maquinado, Acabado y Ensamble. |
| R-B1-18 | §15.1/§10.4 | Siete próximas acciones iniciales; OTHER exige texto. |
| R-B1-19 | §15.1 | Los catálogos se configuran desde Configuración. |
| R-B1-20 | §15.1 | Los valores se activan/desactivan. |
| R-B1-21 | §15.1 | Los cambios de catálogo se versionan. |
| R-B1-22 | §15.1 | Los cambios de catálogo se auditan con actor y contexto comprensibles. |
| R-B1-23 | §15.1, líneas 583-584 | Solo valores activos se seleccionan en registros nuevos. |
| R-B1-24 | §15.1, línea 584 | Los valores inactivos permanecen visibles en históricos. |
| R-B1-25 | Decisiones #4/#5/#6 | Por proceso se configura archivo técnico para RFQ LISTO, primera pieza e intervalo de lote 10/20. |

## Archivos

| ID | Fuente | Regla verificable |
|---|---|---|
| R-B1-26 | §15.2/§6 | Los archivos se almacenan de forma privada. |
| R-B1-27 | §6/§19 | La lectura se concede mediante enlaces temporales a usuarios autorizados. |
| R-B1-28 | §15.2, línea 590 | La metadata se mantiene separada del blob. |
| R-B1-29 | §15.2, línea 592 | Se conserva nombre original y nombre ERP. |
| R-B1-30 | §15.2, línea 594 | Cada archivo tiene vínculo explícito a entidad, revisión o ítem. |
| R-B1-31 | §15.2, línea 596 | Un archivo histórico no se reemplaza silenciosamente. |
| R-B1-32 | §15.2, línea 598 | Los cambios del archivo vigente quedan trazados. |

## Actividad y reglas transversales

| ID | Fuente | Regla verificable |
|---|---|---|
| R-B1-33 | §15.3, línea 602 | La vista de Actividad permite entender qué ocurrió. |
| R-B1-34 | §15.3, línea 602 | Actividad no muestra IDs técnicos al usuario. |
| R-B1-35 | §15.3, línea 604 | Los eventos de una acción comparten `correlationId`. |
| R-B1-36 | §3, líneas 68-69 | Todo cambio relevante registra usuario, fecha, entidad, acción y contexto. |
| R-B1-37 | §6, línea 204 | La auditoría es append-only. |
| R-B1-38 | §4, líneas 105-109 | Actividad cubre RFQ, Propuestas, Producción y Tesorería. |
| R-B1-39 | §6, línea 188 | IDs internos inmutables están separados de folios/códigos visibles. |
| R-B1-40 | §6, línea 194 | Las operaciones multirregistro son atómicas. |
| R-B1-41 | §6, línea 200 | Las ediciones usan control optimista de versión. |
| R-B1-42 | §6, línea 206 | La UI nunca escribe sin validación del backend. |
| R-B1-43 | §3, líneas 62-63 | Se preserva historia antes que borrar; preferir desactivar. |
| R-B1-44 | §3, líneas 64-65 | Los estados cambian mediante acciones de negocio, no un dropdown genérico. |
| R-B1-45 | §3, líneas 72-74 | Los fallos son seguros y no dejan estados parciales silenciosos. |
| R-B1-46 | §17 | Las pantallas son densas pero claras, accesibles, claro/oscuro y con validaciones accionables. |
| R-B1-47 | §4, líneas 98-103 | Los catálogos son fuente única para RFQ, Propuestas, Órdenes, Producción y Facturación. |
| R-B1-48 | §4, líneas 93-96 | Usuarios y roles se aplican en RFQ, Propuestas y Producción. |
| R-B1-49 | §16.1 | GL1 incluye Usuarios/permisos, Configuración y Actividad. |
| R-B1-50 | §23 | El sistema es fácil y entendible de manejar. |

## Estado de auditoría

La cobertura y los hallazgos vigentes están en `B1-hallazgos.md`. El punto exacto de reanudación está en `CONTINUIDAD.md`.

