# Plan de corrección — observaciones del cliente 2026-10-07

Estado: **decisiones funcionales `DC-01..DC-15` aceptadas; P0, C1, C2 y C3.1 cerrados localmente. El siguiente corte vertical es C3.2 (tarifa estándar de Grupo y override de recurso)**.

## 1. Objetivo y límites

Adaptar el ERP al flujo operativo aclarado por el cliente, priorizando facilidad de uso, trazabilidad, seguridad por rol y ausencia de captura repetida. La auditoría global B1–B9 continúa pausada y no se mezclará con este frente salvo que una observación reutilice o corrija una capacidad ya desarrollada.

Fuentes consideradas:

- Decisiones confirmadas en `docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md` (fuente vigente para este frente).
- Observaciones del cliente en `Texto pegado.txt` y cuatro capturas referenciales.
- Implementación vigente de RFQ, Propuestas, Órdenes, Producción, Configuración, archivos e Inventario.
- `ERP_SII_Handoff_Tecnico_Funcional.md` y planes aplicables de `docs/plan-erp-sii/`.
- Punto de control de auditoría en `docs/plan-erp-sii/auditoria-cumplimiento/CONTINUIDAD.md`.

Las capturas son referencias de estructura y facilidad de uso, no una orden de copiar píxel por píxel. Se conservarán los componentes, tokens, accesibilidad y comportamiento responsive del sistema.

Las preguntas funcionales quedaron cerradas. Si aparece una contradicción nueva, se detendrá únicamente el corte afectado y se registrará una decisión adicional; no se reinterpretará el alcance durante la codificación.

Baseline de preparación:

- Rama aislada `feature/observaciones-cliente`, nacida de `fdce24e`; auditoría B1–B9 pausada.
- Node 24.14.0, pnpm 11.9.0, Supabase CLI 2.109.0, Docker 29.4.0 y Playwright 1.62.1 comprobados.
- Dependencias al día mediante `pnpm install --frozen-lockfile`.
- Supabase local saludable en loopback; puertos 54321/54322/54323 disponibles. `.env.local` continúa prohibido para pruebas mutantes.
- El wrapper local se corrigió para que los avisos normales de `imgproxy`, `edge_runtime` y `pooler` detenidos no aborten la carga de variables; `validar-entorno.mjs` acepta el entorno.

## 2. Agrupación por módulos afectados

| Frente | Observaciones | Módulos afectados | Impacto principal |
| --- | --- | --- | --- |
| Diseño y navegación comercial | Colores más claros/vivos; RFQ solo lista; Resumen de RFQ según referencia | Diseño compartido, Pipeline/RFQ | Tokens semánticos, lista única, estados y estructura de ficha |
| Alta y edición de RFQ | Retirar PO/horas del alta; Fecha requerida opcional; modal integral; canal controlado; autocompletado; ítems y archivos en el mismo flujo | Pipeline, RFQ, Clientes, Contactos, archivos | Nuevo flujo guiado, validación de datos y guardado recuperable |
| Versiones e historial de RFQ | RFQ editable antes de propuesta; agregar/quitar ítems; historial de solo lectura | RFQ, actividad/auditoría, base de datos | Snapshots append-only y bloqueo al convertir |
| Gestión documental | Pertenencia visible, versiones, herencia sin duplicar, DXF/DWG, PDF por revisión | Almacenamiento, RFQ, Propuestas, PDF | Claridad de origen, vigencia, versionado y seguridad |
| Ruteo y costeo | Etiquetas de tiempos; costo por hora configurado; costo estimado por proceso | Propuestas, Configuración, catálogos, cálculo de costos | Fuente única de tarifas, snapshot de tarifa y desglose reproducible |
| Seguimiento comercial | Próxima acción obligatoria al cambiar etapa/estado | RFQ, Propuestas, auditoría | Transiciones atómicas con próxima acción |
| Versiones de propuesta | “Nueva versión”, agregar/quitar ítems y procesos, historial | Propuestas | Completar capacidad ya existente y mejorar lectura histórica |
| Propuesta aceptada a orden | Orden automática y precargada | Propuestas, Órdenes, Cobranza, crédito | Transacción idempotente y snapshot comercial inmutable |
| Órdenes y confidencialidad | Sin Editar/Procesos/Seleccionar; cancelar solo administración; operadores sin precios | Órdenes, RBAC, Producción | Inmutabilidad, proyección segura por rol y UX operativa |
| Acceso de operadores | PIN más claro; administrador puede “ver como operador” | Autenticación, Producción, Configuración, auditoría | Delegación temporal segura, sin revelar PIN |
| Consumo y costo de materiales | Retirar inventario formal del MVP; catálogo, costo vigente/histórico y consumo congelado | Inventario, catálogos, Órdenes, Producción, Gastos, Rentabilidad | Cambio arquitectónico no destructivo y compatibilidad histórica |

## 3. Diagnóstico contra el sistema actual

| ID | Solicitud | Estado comprobado | Trabajo real requerido |
| --- | --- | --- | --- |
| CLI-01 | RFQ con colores más claros/vivos y solo lista | Parcial. Hay tokens semánticos, pero la cola abre en tablero y ofrece ambas vistas. | Hacer lista única, ajustar tokens/estados con contraste AA y validar claro/oscuro. |
| CLI-02 | Simplificar campos del alta | Decisión cerrada. Orden de compra y Horas estimadas salen del alta; Fecha requerida por cliente se conserva opcional y no equivale a Fecha compromiso. | Separar nombres/validaciones y confirmar Fecha compromiso antes de aceptar/crear Orden. |
| CLI-03 | Espesor inmediatamente debajo de Material | Ya implementado en el modal de ítem con catálogo dependiente, pero el campo se oculta si el material no tiene espesores configurados y no se encontró semilla inicial del catálogo. | Completar datos/configuración, mostrar un estado explicativo cuando falten espesores y cubrirlo con regresión; no duplicar backend. |
| CLI-04 | Modal integral de alta RFQ con cliente, solicitud, ítems y archivos | Parcial. Selector/alta de cliente y autocompletado existen, pero el formulario es inline y solo crea cabecera básica; Resumen/ítems/archivos se completan después. | Wizard modal accesible, guardado recuperable, contacto del cliente y flujo de archivos directo. |
| CLI-05 | Canal desplegable | Decisión cerrada. RFQ guarda texto libre actualmente. | Catálogo configurable con WhatsApp, Correo, Teléfono, Visita, Referido y Otro; “Otro” exige detalle. Reutilizarlo en alta, Resumen y seguimiento, con backfill no destructivo. |
| CLI-06 | Archivos con pertenencia, historial, DXF/DWG y herencia | Parcial avanzado: etiquetas por entidad, tres grupos de propuesta, metadata versionada, URLs firmadas y validación DXF/DWG ya existen. Sin embargo, la lista ordinaria filtra solo la versión vigente y los archivos de `rfq_item` no llegan hoy al flujo de piso de producción. | Hacer visible el historial, evitar borrado físico/sobrescritura silenciosa, declarar formatos en el selector y garantizar que los archivos ITxx autorizados lleguen a Propuesta/Orden/Producción sin duplicar blobs. |
| CLI-07 | Edición/versionado histórico de RFQ sin conversión implícita | Parcial. Edición y cancelación lógica de ítems existen; no existe snapshot versionado de RFQ. La creación de propuesta vigente es explícita, pero se debe reproducir el reporte del cliente. | Historial append-only, modal de lectura, bloqueo al convertir y E2E que pruebe que navegar/editar no crea propuesta. |
| CLI-08 | Ruteo con etiquetas y costo estimado por uso | Decisión cerrada. Hay setup/run y total, pero la tarifa estándar no vive aún en `grupos_equipo` y no hay desglose automático por fila. | Tarifa estándar por Grupo de Equipo, override opcional y explícito por recurso/máquina, misma tarifa para preparación + operación y snapshot por fila. |
| CLI-09 | Próxima acción obligatoria en cambios de estado | Parcial. El gate LISTO de RFQ y el envío de propuesta ya exigen seguimiento; no todas las transiciones lo hacen. | Contrato uniforme por transición; estados terminales no exigen próxima acción y piden motivo/resultado cuando aplique. |
| CLI-10 | Nueva versión de propuesta e historial | Parcial avanzado. “Nueva revisión” y tabla histórica existen; copia ítems/ruteo/costos y permite desactivar ítems y reemplazar ruteo. No permite crear un ítem nuevo de propuesta. | Renombrar/mejorar UX, alta de ítem nuevo con código estable, historial de solo lectura y pruebas. |
| CLI-11 | Propuesta aceptada crea orden automáticamente | Decisión cerrada. Aceptación y creación idempotente de orden existen, pero son dos acciones separadas y requieren permisos distintos. | Comercial acepta la revisión exacta y confirma Fecha compromiso. Registrar aceptación y solicitud de orden juntas; ante un gate fallido conservar `Orden pendiente`, causa y reintento; crear exactamente una Orden. |
| CLI-12 | Orden no editable y precios solo administrativos | Brecha confirmada. La cola aún muestra Editar y Procesos; “Seleccionar” abre el hilo de comentarios debajo y por eso se percibe sin función; la ficha permite Ajustar. El acceso PIN de piso ya evita precios, pero la ruta administrativa de Órdenes necesita gate de página y proyección financiera explícita. | Retirar mutaciones comerciales, reubicar comentarios antes de quitar “Seleccionar”, conservar solo operaciones permitidas y aplicar confidencialidad en servidor, ruta y UI. |
| CLI-13 | Acceso PIN simple y vista administrativa como operador | Decisión cerrada. PIN táctil, hash seguro y sesión firmada existen; el flujo depende de volver a Producción y no hay delegación administrativa. | Flujo guiado y “Vista operador” temporal, auditada, sin PIN y estrictamente de solo lectura en el MVP. |
| CLI-14 | Catálogo/consumo/costo sin stock | Decisión cerrada. El módulo actual maneja stock, entradas, salidas, reservas, kardex y CPP. Ya existen consumo real y costo congelado, pero están acoplados al descuento de stock. | Desacoplar consumo; catálogo en MXN/USD, unidad base, costo propuesto/confirmado e historial. Conservar inventario legado en solo lectura sin nuevas operaciones. |

## 4. Arquitectura recomendada

### 4.1 RFQ

- Cola única en tabla, conservando filtros y estados; eliminar el selector de vista y el tablero.
- Mostrar `Resumen` en tarjetas de solo lectura como la referencia (`Datos generales`, `Próxima acción`, `Descripción general`) y entrar a edición mediante una acción explícita; no dejar todos los controles abiertos por defecto.
- Dar a `Seguimiento` e `Historial` secciones explícitas como en la referencia. Cuando exista una propuesta, mostrar su enlace y estado sin convertir la navegación del RFQ en una acción de creación.
- Alta mediante wizard modal: `Cliente → Solicitud → Ítems → Archivos → Revisar y finalizar`.
- Crear cabecera e ítems mediante una operación transaccional; mantener el modal abierto para las subidas directas. Si una subida falla, conservar el borrador y permitir reintento.
- Orden de compra y Horas estimadas no aparecen en el alta. `Fecha requerida por cliente` es opcional; `Fecha compromiso comercial` es otro dato y se confirma al aceptar una revisión.
- Un cierre interrumpido conserva el RFQ como `INCOMPLETO` y ofrece `Continuar captura`; no elimina datos ni archivos ya confirmados.
- Canal mediante catálogo activo/inactivo, no enum rígido en frontend. “Otro” exige detalle. Los históricos conservan su valor aunque se desactive.
- Historial en `rfq_versiones`: número monotónico por RFQ, snapshot JSON de cabecera e ítems, actor, fecha y causa. Solo agregar; sin UPDATE/DELETE de versiones.
- Las bajas de ítems son lógicas. Un ITxx nunca se reutiliza.
- La propuesta se crea únicamente con la acción explícita “Crear propuesta”. Abrir pestañas, editar o marcar listo no debe crearla.

### 4.2 Archivos

- Mantener una tabla única de metadata y blobs privados con URLs firmadas.
- Presentar cada archivo con: nombre, pertenencia, tema, versión, vigencia, fecha y origen.
- Agrupar históricos bajo una acción “Ver versiones”; la consulta no se limitará a `vigente = true` cuando el usuario abra ese historial. Nunca ofrecer borrado físico desde la interfaz ordinaria.
- Reutilizar la versión automática por `entidad + entidad_id + tema + nombre`; confirmar mediante pruebas que la anterior queda no vigente y recuperable.
- Mantener DXF/DWG, ya admitidos por el validador técnico, declararlos también en el atributo `accept` y en la ayuda visible, y cubrirlos con una prueba de subida/descarga.
- Propagar a Propuesta, Orden y piso de producción la referencia autorizada de los archivos asociados a `rfq_item`; no copiar el blob ni perder la pertenencia ITxx.

### 4.3 Costeo de propuesta

- Incorporar `costo_hora_estandar` al catálogo versionado `grupos_equipo`, en la moneda base de costeo definida por Configuración.
- El override de `recursos_planeacion.costo_hora_interno` será opcional y tendrá una marca explícita de uso; `0` no significará ambiguamente “sin override”. En una propuesta sin recurso concreto se usa siempre la tarifa estándar del Grupo de Equipo.
- Cada fila de ruteo mostrará etiquetas visibles: Proceso, Grupo de equipo, Grupo planeado, Preparación (h), Operación (h), Total (h).
- El cálculo aplica la misma tarifa a preparación + operación y guarda por fila: tarifa, fuente (`GRUPO` o `RECURSO`), grupo, recurso si existe y momento del snapshot. Una modificación posterior no altera revisiones históricas.
- Un grupo sin tarifa configurada mostrará una advertencia bloqueante; nunca se costeará silenciosamente en cero. Separar tarifas de preparación/operación queda fuera del MVP.
- El desglose mostrará al menos: tiempo, tarifa de preparación, tarifa de operación, costo de preparación, costo de operación y total por proceso/ítem.
- Los costos manuales se limitarán a conceptos que no provengan del ruteo, evitando sumar dos veces máquina/mano de obra.

### 4.4 Propuesta a orden

- La aceptación elegida debe producir exactamente una orden por revisión aceptada.
- La recepción del cliente se registrará como evento explícito y auditado antes de la aceptación, sin crear todavía la orden.
- Antes de aceptar, Comercial confirma `fecha_compromiso_comercial`; la Fecha requerida por cliente permanece como referencia distinta.
- La misma transacción que registra la aceptación creará una solicitud durable de orden. Un intento inmediato/idempotente generará la orden; una restricción única por revisión impedirá duplicados.
- Los gates de cliente activo, crédito, moneda/tipo de cambio e ítems fabricables se ejecutarán al intentar crear la orden. Si alguno falla, la aceptación —hecho comercial externo— se conserva y la propuesta queda como `Orden pendiente`, con motivo visible y reintento autorizado; no se pierde ni se duplica la venta.
- La orden nace desde el snapshot completo de la revisión y no admite cambios de alcance comercial, ítems, cantidades, precios, moneda ni revisión aceptada.

### 4.5 Órdenes, roles y vista de operador

- Retirar Editar, Procesos, Seleccionar y Ajustar como mutaciones de la definición comercial de la orden.
- Planeación podrá cambiar prioridad, fecha operativa, recurso y notas con historial, sin alterar `fecha_compromiso_comercial`; Producción podrá registrar horas, cantidades, consumos, pausas y evidencias.
- Administración conserva cancelación auditada y lectura financiera.
- La ruta de Órdenes tendrá gate de página y el servidor no consultará ni serializará totales/precios/moneda para roles sin `ver_finanzas`; ocultar HTML no será el control de seguridad.
- La vista administrativa como operador usará una sesión delegada de corta duración y **solo lectura**, con operador seleccionado, administrador real, motivo, expiración, banner permanente y salida explícita. En el MVP no podrá registrar producción. Nunca mostrará, recuperará ni reutilizará el PIN almacenado.

### 4.6 Catálogo de materiales y consumo sin inventario

- Adoptar `catalogo_materiales` como catálogo funcional canónico para RFQ, propuesta y nuevos consumos.
- Añadir unidad base, moneda MXN/USD y costo vigente; guardar cada cambio confirmado en un historial append-only con anterior, nuevo, moneda, fecha, fuente y actor.
- Evolucionar `registros_consumo_material` de forma compatible: nuevos consumos referencian el catálogo canónico y congelan costo/unidad; filas históricas conservan el vínculo legado.
- La nueva RPC de consumo valida orden/partida/rol y registra cantidad usada, scrap y costo congelado, pero no consulta ni modifica stock, reservas o kardex.
- Mantener las tablas antiguas de inventario solo para consulta histórica durante la transición. Retirar de navegación y bloquear nuevas entradas/salidas/reservas; no borrar datos.
- Compras/Gastos `CG-MMYY_####` siguen siendo administrativas y pueden **proponer** el último costo conocido, pero solo una confirmación autorizada cambia el maestro; nunca generan stock.
- Rentabilidad sumará consumos históricos y nuevos sin doble conteo.

## 5. Dependencias y coordinación Codex/Claude

```text
DC-01..DC-15 + caracterización
          │
          ├── Contratos RFQ/archivos ── RFQ UX ── versionado/congelamiento
          │                                      │
          │                                      └── Propuesta Rev A y revisiones
          │                                                   │
          ├── Tarifa Grupo de Equipo ── snapshot de ruteo ────┤
          │                                                   │
          └── Transiciones/seguimiento ─ aceptación durable ─ Orden
                                                              │
                  Delegación operador ─────────────────────────┤
                                                              │
                  Materiales/costos ─ consumo sin stock ─ rentabilidad
```

Reglas de trabajo paralelo:

- Un contrato compartido —tipo, RPC, migración o esquema— se define y verifica antes de dividir frontend/backend.
- Cada encargo registra un único dueño, archivos exclusivos, dependencias y gates en `ACTIVE_TASKS.md`.
- Codex y Claude no editan simultáneamente el mismo archivo ni crean migraciones dependientes en paralelo.
- Claude puede implementar código, pruebas y migraciones locales asignadas; no usa Git, remoto ni despliegues. Codex revisa el diff, ejecuta `cross-review`, verifica e integra.
- Los cortes de UI independientes pueden avanzar en paralelo con pruebas de caracterización, pero su integración espera el contrato de datos aprobado.
- Con 20 % disponible no se inicia un corte amplio. Con 10 % o menos se cierra el incremento verificable, se actualiza `HANDOFF.md` y el agente se detiene; el otro continúa únicamente trabajo independiente ya contratado.

## 6. Orden de implementación por cortes verificables

### Corte 0 — decisiones y caracterización

- Persistir `DC-01..DC-15`, preparar rama/entorno y sincronizar la Skill compartida.
- Crear pruebas de caracterización para flujos que ya existen: espesor, archivos, nueva revisión, aceptación y consumo.
- Definir contratos de Fecha requerida/Fecha compromiso, borrador `INCOMPLETO`, tarifa Grupo/override, solicitud durable de Orden y snapshot de consumo antes de repartir archivos.
- Registrar métricas/base visual en 320, 768, 1024 y 1440 px, claro/oscuro.

### Corte 1 — mejoras RFQ sin cambio destructivo

- Lista única, tokens semánticos más legibles y Resumen por tarjetas.
- Modal/wizard de alta; retirar Orden de compra y Horas estimadas, conservar Fecha requerida opcional y reanudar `INCOMPLETO`.
- Canal controlado y autocompletado de contacto.
- Confirmar espesor debajo de Material y estados loading/empty/error.

Gates: unitarias de validación, integración de alta, E2E de cliente existente/nuevo y revisión visual/accesible.

### Corte 2 — RFQ versionado, transiciones y archivos

- Migración aditiva de historial y RPC transaccionales con CAS.
- Historial de solo lectura y cancelación lógica de ítems.
- Próxima acción dentro de la misma transición de estado.
- Claridad documental, historial de versiones y pruebas DXF/DWG y archivo mayor de 1 MiB.
- Disponibilidad de archivos técnicos ITxx en el piso de producción sin duplicar blobs ni romper autorización.

Gates: pgTAP de append-only/CAS/RBAC, concurrencia, integración y E2E; ninguna transición implícita a propuesta.

### Corte 3 — propuesta, ruteo y costo

- Completar nueva versión con alta/baja de ítems y edición de ruteo.
- Tarifa estándar versionada por Grupo de Equipo, override explícito por recurso y snapshot por fila.
- Etiquetas de tiempos, desglose por proceso y total de fabricación/margen.
- Evitar duplicación entre costo automático y manual.

Gates: paridad cálculo SQL/TypeScript, redondeo/moneda, pgTAP de snapshot, unitarias y E2E de dos versiones.

### Corte 4 — aceptación, orden inmutable y confidencialidad

- Aceptación durable + solicitud idempotente de orden, estado `Orden pendiente`, causa y reintento seguro.
- Retirar mutaciones de definición en Órdenes y acciones sin función.
- Separar DTO financiero y operativo en servidor.
- Verificar cancelación administrativa, snapshot y Cobranza sin regresión.

Gates: concurrencia de doble aceptación, crédito/tipo de cambio, RBAC negativo, E2E administrativa y operativa.

### Corte 5 — acceso de operador

- Rediseñar los pasos de ingreso/inicio/cierre de sesión.
- Implementar vista delegada administrativa segura y solo lectura en el MVP.
- Mostrar identidad efectiva y real; auditar inicio/fin/expiración.

Gates: PIN correcto/incorrecto/bloqueo, expiración/revocación, separación de operadores y ausencia de datos financieros.

### Corte 6 — catálogo y consumo sin stock

- Migración aditiva y backfill verificable por código/mapeo explícito.
- Historial de costos y nueva RPC de consumo sin movimientos de inventario.
- Sustituir la UI de Inventario por “Materiales y costos”; retirar entradas/salidas/stock/reservas.
- Adaptar rentabilidad y compras/gastos sin borrar historia.

Gates: pgTAP de costo congelado y append-only, reconciliación de rentabilidad antes/después, prueba de que ningún consumo modifica stock y E2E de consumo administrativo/operador.

### Corte 7 — cierre transversal

- Typecheck, lint, unitarias, integración, pgTAP, concurrencia, build y E2E focales/completos proporcionales.
- Revisión visual y accesible; revisión independiente `cross-review`.
- Actualizar documentación, ADR del retiro de inventario formal y memoria compartida.
- Entregar `REPORTE-HALLAZGOS-Y-CORRECCIONES.md` con errores incidentales encontrados/corregidos y pendientes.

## 7. Política para errores incidentales

Durante la implementación se corregirán defectos funcionales o visuales encontrados únicamente cuando estén dentro del flujo tocado, tengan causa reproducible y puedan cubrirse con prueba. Cada uno se registrará con síntoma, causa, severidad, archivos, corrección y evidencia. Un hallazgo fuera de alcance se documentará para decisión del Product Owner; no se ampliará silenciosamente el trabajo.

### Hallazgos preliminares a confirmar durante los cortes

- El catálogo de espesores carece de una semilla inicial comprobada; esto puede ocultar el control ya implementado.
- El historial documental existe en metadata, pero la consulta ordinaria oculta las versiones no vigentes.
- Los archivos técnicos asociados a un ITxx no están incluidos hoy en la carga documental del piso de producción.
- Hay un editor alterno de cotización aparentemente huérfano y terminología mezclada entre “revisión” y “versión”; se verificará antes de retirar código o renombrar UI.
- La constante `ESTADOS_PROPIESTA` parece contener un error tipográfico y existen colores ámbar sin token semántico; ambos se validarán al tocar esos flujos.
- Un Grupo de Equipo puede quedar sin tarifa estándar y terminar con costo cero sin advertencia; el Corte 3 debe convertirlo en un estado explícito.
- La ruta administrativa de Órdenes no tiene un gate de permiso a nivel de página, aunque el flujo PIN operativo ya restringe los precios; se endurecerá sin atribuir una fuga no demostrada.

## 8. Riesgos principales y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Perder historia al retirar Inventario | Migraciones aditivas, tablas antiguas read-only y reconciliación de totales; nunca DROP inicial. |
| Doble costo por ruteo y captura manual | Contrato de categorías excluyentes y pruebas de paridad. |
| Crear dos órdenes por reintento/concurrencia | Solicitud durable, restricción única por revisión e idempotencia; los reintentos convergen en la misma orden. |
| Exponer precios a operación | DTO/proyección autorizada en servidor, pruebas RBAC negativas y sin datos sensibles en payload. |
| Versiones RFQ inconsistentes | RPC única con CAS, snapshot tras mutación exitosa y tabla append-only. |
| Archivos huérfanos al cerrar el modal | Subida preparada/confirmada/descartada y reanudación del borrador. |
| Confundir “ver como operador” con conocer PIN | Delegación firmada y auditada, nunca lectura del PIN. |
| Cambiar tarifas y alterar historia | Snapshot de tarifa/costo en propuesta, orden, sesión y consumo. |
| Confundir cero con “sin override” de máquina | Indicador explícito de override y validación; nunca inferirlo del valor numérico. |
| Colisión Codex/Claude | Archivo con propietario único, locks declarados y revisión del estado antes de cada entrega. |
| Pausa de un agente bloquea al otro | Contratos primero, cortes independientes y handoff con siguiente acción exacta al 20/10 %. |

## 9. Criterio de finalización

Cada corte se considera terminado solo después de revisión Codex, revisión independiente proporcional, gates verdes y evidencia. La validación técnica local no equivale a despliegue, producción ni aceptación del cliente; esas confirmaciones se reportarán por separado.
