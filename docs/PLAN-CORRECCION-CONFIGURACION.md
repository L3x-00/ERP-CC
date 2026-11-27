# Plan de corrección del flujo de configuración

> Estado: **investigación inicial, sin cambios aplicados**.
> Fecha: 2026-11-27.
> Alcance: orden real para configurar ORCA MFG ERP antes de capturar RFQs, contrastado entre el manual (`content/docs`) y el código fuente.
> Método: lectura de los capítulos de configuración y del código real; ningún archivo fue modificado.

## 1. Objetivo

Dejar una sola ruta de configuración, comprensible para una persona sin conocimientos técnicos, que responda a preguntas como:

- ¿Van primero las máquinas o el área?
- ¿Cuándo se crea el grupo de equipo si el formulario de procesos lo pide?
- ¿Qué se necesita sí o sí antes del primer RFQ y qué puede esperar?

## 2. Lo que dice hoy el manual

Existen tres órdenes distintos y una cadena de enlaces que retrocede.

| Fuente | Secuencia declarada |
| --- | --- |
| `content/docs/index.mdx:58-72` | grupos planeados → grupos de equipo → áreas → procesos → próximas acciones → canales RFQ → catálogos → tarifas y costos → folios → documentos → verificación final |
| `content/docs/verificacion-final.mdx:101-112` | Igual que el índice |
| `content/docs/primeros-pasos.mdx:60-69` | grupos planeados → **áreas** → procesos → próximas acciones y canales → **tarifas y costos (aquí se crean los grupos de equipo)** → catálogos → folios → documentos |
| `content/docs/meta.json:22-34` | …tarifas y costos → **capacidad** → folios… |

Cita crítica (`content/docs/procesos.mdx:29-35`):

> Ya debes tener creados: los grupos planeados, los grupos de equipo, las áreas de trabajo. Si falta alguno, el selector correspondiente aparecerá vacío o incompleto.

Cita contradictoria (`content/docs/primeros-pasos.mdx:64,66`):

> 3. Catálogos → Operativos → Procesos. Toman los grupos planeados y las áreas que ya creaste.
> 5. Tarifas y costos → Tarifario del ruteo. Aquí creas los grupos de equipo con su tarifa, vinculas procesos y das de alta los equipos.

Además, `content/docs/capacidad.mdx:44-46` enlaza de vuelta a grupos de equipo, rompiendo el flujo lineal.

## 3. Lo que hace realmente el sistema

| Objeto | Dónde se crea | Permiso real | Dependencia |
| --- | --- | --- | --- |
| Grupo planeado | Catálogos → Operativos | `catalogo_editar` | Opcional; solo organiza planeación (`pestana-catalogos-base.tsx:564-582`) |
| Grupo de equipo con tarifa | Tarifas y costos → Tarifario del ruteo (`seccion-tarifas-grupos.tsx:9,75`) | `catalogo_editar` | Necesario para procesos y para tarifa |
| Área de trabajo | Configuración → Áreas de trabajo | `configuracion` | Necesaria para procesos y para el área de la máquina |
| Proceso | Catálogos → Operativos | `catalogo_editar` | Selector de grupo de equipo y área; prefijo de corrida y controles |
| Máquina/equipo | Tarifas y costos → Equipos y sus tarifas (`tarifas-recursos.ts:177-240`) | `catalogo_editar` | FK a grupo; área validada contra los procesos del grupo (`area-equipo.ts:72-95`) |
| Capacidad instalada | Planeación → Capacidad instalada | `gestionar_planeacion` | Equipos × jornada |
| Material, espesor y costo | Operación → Materiales y costos (`/inventario`) | `gestionar_inventario` | El RFQ exige material; espesor solo si existen espesores activos |
| Canal RFQ y próxima acción | Catálogos → Operativos | `catalogo_editar` | El RFQ LISTO exige canal y seguimiento |
| Usuarios activos | Personas y accesos | solo administrador activo (`crear-usuario.ts:47-50`) | Son los responsables del RFQ |
| Folios | Configuración → Folios | `configuracion` | No bloquea: el folio CNC se genera por RPC (`generar-folio-cnc.ts:16-21`) |
| Plantilla T1, tiers, categorías | Configuración | `configuracion` | Valores por defecto; afectan presentación/comercial |
| Cuentas bancarias | `/cobros?seccion=cuentas` | `configuracion` | No participan en RFQ ni Propuestas |

## 4. Ruta crítica validada en código

1. **Usuarios y permisos**: crear al responsable con un rol que tenga `rfq_vista`. El alta de usuarios y operadores requiere administrador activo.
2. **Grupo de equipo con tarifa** en Tarifas y costos. Se crea antes que el proceso porque el proceso lo necesita; al no tener aún procesos, no valida área.
3. **Áreas de trabajo**: áreas, subáreas y operadores por área.
4. **Procesos**: asignar grupo planeado (opcional), grupo de equipo y área; capturar prefijo de corrida y controles de calidad.
5. **Máquinas/equipos** del grupo, en el área correcta según los procesos del grupo. Si se crearon antes de los procesos, revisar el aviso **«Área distinta a la del grupo»**.
6. **Capacidad instalada**: cantidad de equipos y jornada. La base es `equipos × jornada`; lunes a viernes 8 h y sábado 4 h.
7. **Materiales, espesores y costo vigente** en Materiales y costos.
8. **Canales RFQ y próximas acciones** activos, con una sola opción de texto libre.
9. **Prueba controlada**: abrir un RFQ nuevo, confirmar que aparecen canales, procesos, próximas acciones y materiales; cancelar sin guardar.

### No bloqueantes

- Folios: se generan automáticamente; Configuración solo ajusta continuidad al migrar.
- Plantilla T1, tiers y categorías de gasto: existen valores por defecto.
- Tipo de cambio: hay valor por defecto y aviso si tiene más de 24 h.
- Cuentas bancarias: pertenecen a cobranza y pagos.

## 5. Inconsistencias manual ↔ código

| Tema | Manual | Código | Evidencia |
| --- | --- | --- | --- |
| Turnos de capacidad | Dice que se registran turnos y se crea uno base de 8 h | «Ya no se registran turnos base»; matutino/vespertino son etiquetas visuales | `capacidad.mdx:30-34`; `actualizar-capacidad-recurso.ts:35-37`; `panel-capacidad-instalada.tsx:81-82` |
| Orden áreas/grupos/procesos | `primeros-pasos` crea procesos antes que grupos | El proceso exige grupo de equipo previo | `primeros-pasos.mdx:64,66`; `procesos.mdx:29-35` |
| Área de la máquina | No se explica el riesgo | Si el grupo ya tiene procesos, el área debe coincidir; hubo bug el 27-nov | `area-equipo.ts:8-15,72-95` |
| Tarifa por estación | Describe override → grupo → estación | La estación solo es referencia para copiar | `tarifa-estacion.ts:92-99`; `20261107130000_t2…sql:82-116` |
| Catálogos inactivos | Dice que no se usan | Los canales inactivos sí se consultan y solo se ocultan en UI | `verificacion-final.mdx:24`; `obtener-catalogos.ts:78-81` |
| Permisos | Agrupa todo como «configuración» | Dos familias: `catalogo_editar` vs `configuracion`; usuarios solo admin | `modulos-navegacion.ts`; acciones correspondientes |
| Folios | Los pone antes de documentos | No son dependencia para RFQ | `generar-folio-cnc.ts:16-21` |

## 6. Decisiones pendientes para el plan de corrección

1. Qué archivo será la **fuente única** del orden: `index.mdx`, `primeros-pasos.mdx` o un capítulo nuevo.
2. Si el paso 0 (personas, datos de empresa y cuentas bancarias) entra en la ruta o queda como nota aparte.
3. Si se mantiene `capacidad.mdx` como capítulo independiente o se integra en la ruta principal.
4. Cómo redactar la regla de área de máquina sin jerga, para evitar el error del 27-nov.
5. Si se corrige el texto de turnos en `capacidad.mdx` antes o después de unificar la ruta.

## 7. Fuentes principales consultadas

- Manual: `content/docs/index.mdx`, `primeros-pasos.mdx`, `grupos-planeados.mdx`, `grupos-equipo.mdx`, `areas-trabajo.mdx`, `procesos.mdx`, `proximas-acciones.mdx`, `canales-rfq.mdx`, `catalogos.mdx`, `tarifas-tc.mdx`, `capacidad.mdx`, `folios.mdx`, `plantillas-t1.mdx`, `verificacion-final.mdx`, `meta.json`.
- Código: `src/modulos/catalogos/`, `src/modulos/configuracion/`, `src/modulos/inventario/`, `src/modulos/planeacion/`, `src/modulos/rfq/`, `src/modulos/propuestas/`, `src/nucleo/autenticacion/verificar-permiso.ts`, `src/compartido/componentes/navegacion/modulos-navegacion.ts`.
- Migraciones: `20261007100003_sii_b3_rfq_acciones.sql`, `20261107130000_t2_tarifa_grupo_maestra.sql`, `20261123000000_operador_inicia_sin_liberacion.sql`.
