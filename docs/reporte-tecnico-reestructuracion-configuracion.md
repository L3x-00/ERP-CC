# Reporte técnico — Reestructuración UI/UX de Configuración

**Proyecto:** ORCA MFG ERP / CC Manufacturing
**Periodo:** UI-01 a UI-05, 2026-11-09 / 2026-11-10
**Commit final de `main`:** `af32992`
**Producción:** https://erp-cc-flame.vercel.app
**Migraciones:** ninguna. No se creó ni aplicó SQL; Supabase remoto intacto.

---

## 1. Resumen de la implementación

El módulo Configuración pasó de **11 pestañas** a **6 secciones**, conservando
Server Actions, servicios, RPC, query keys, Realtime, permisos, validaciones,
cálculos, datos históricos y enlaces existentes.

| Fase | PR | Alcance entregado |
|---|---|---|
| UI-01 | #167 | Navegación de 6 secciones con `PestanasModulo`; subsecciones Catálogos (Comerciales/Operativos) y Personas y accesos (Usuarios/Permisos/Operadores); compatibilidad `?pestana=`; permisos intactos. |
| UI-02 | #168 | Empresa al menú de usuario en modal; Cuentas bancarias a Cobros y tesorería; alta/edición de Áreas en diálogo; redirección de enlaces antiguos. |
| UI-03 | #169 | Tarifario del ruteo como bloque principal; grupos de equipo con un solo punto de administración; alta de equipo con tarifa heredada y “Configurar tarifa ahora”; catálogos agrupados, con estados vacíos. |
| UI-04 | #170 | Usuarios con vista previa de permisos por rol y confirmaciones por diálogo; matriz de permisos con primitivas del sistema; operadores en modal y retiro confirmado; acceso a áreas autorizadas. |
| UI-05 | #171 | Mensajes sin duplicados, correcciones de accesibilidad, documentación y manual actualizados, verificación final. |

### Arquitectura conservada

- **Permisos:** `configuracion` para Configuración y operaciones bancarias;
  `catalogo_ver`/`catalogo_editar` para catálogos; rol `admin` activo para
  Usuarios, Permisos y Operadores. Sin cambios en `can()`, RLS ni roles.
- **Datos:** singleton `configuracion_sistema`, tablas `cuentas_bancarias`,
  `areas_trabajo_config`, `operadores_areas`, catálogos y `recursos_planeacion`.
- **Escritura:** RPC `actualizar_configuracion_seccion`, `reemplazar_areas_operador`,
  `asignar_procesos_a_grupo_equipo`; Server Actions con Zod y auditoría.
- **Lectura:** `obtenerConfiguracionAccion` + TanStack Query; Realtime invalida
  `['configuracion']` y relee bajo RLS.
- **Caché:** mismas claves (`CLAVE_CONFIGURACION`, `CLAVE_CATALOGOS_BASE`,
  `CLAVE_TARIFAS_RECURSOS`, etc.). UI-03 solo añadió invalidación cruzada para
  que la tarifa del grupo se refleje al instante en Equipos.

---

## 2. Implementación de la jerarquía de tarifas V1

### 2.1 Resolución en base de datos

`public.resolver_tarifa_hora(uuid, uuid)` en
`supabase/migrations/20261014110000_tarifario_unico_estacion_grupo.sql:124-192`:

1. **`RECURSO`** — si `recursos_planeacion.tarifa_override_activa` es verdadero,
   devuelve `tarifa_override_hora` y `tarifa_override_moneda` (líneas 145-153).
2. **`GRUPO`** — si el grupo tiene `tarifa_hora`, la devuelve como fuente maestra
   (líneas 166-174).
3. **`ESTACION`** — si el grupo no tiene tarifa pero sí `estacion_tarifa`,
   devuelve el valor de la estación vinculada (líneas 176-185).
4. **Error** — si no hay ninguna, lanza `tarifa_no_configurada` con el grupo en
   `DETAIL` (líneas 187-190). **Nunca hay un fallback silencioso en SQL.**

La restricción `grupos_equipo_tarifa_valida` (migración
`20261009140000_c3_2_tarifas_grupo_recurso.sql:24-27`) exige
`tarifa_hora IS NULL OR tarifa_hora >= 0`.

El costeo congela el resultado: `20261009160000_c3_3_snapshot_costeo_ruteo.sql:97`
usa `resolver_tarifa_hora` al costear y guarda `tarifa_hora` en el snapshot.

### 2.2 Resolución y presentación en la UI

- `seccion-tarifas-grupos.tsx:34-36` devuelve `origen: 'Tarifa del grupo'`; la
  estación aparece como **“Referencia: Tarifas y costos · Estación”**, nunca como
  tarifa efectiva.
- `seccion-tarifas-recursos.tsx:393-452` muestra la **tarifa heredada** antes de
  guardar y, si el grupo no tiene tarifa, el bloque **“Configurar la tarifa del
  grupo sin salir de este alta”** con el botón **“Configurar tarifa ahora”**.
  El borrador del equipo se conserva.
- `panel-ruteo-costeo.tsx:226-251` resuelve máquina → grupo → respaldo y devuelve
  `origen` y `advertencia`.
- `panel-ruteo-costeo.tsx:759-790` pinta el origen por operación
  (`data-testid="origen-tarifa-<item>-<n>"`).
- `panel-ruteo-costeo.tsx:907-919` muestra el banner
  `data-testid="aviso-tarifa-respaldo"` cuando hay operaciones con respaldo.

---

## 3. Criterios de aceptación del cliente (§6)

**Estado global: 10/10 cumplidos.** Evidencia ejecutada el 2026-11-10 sobre
`main` `af32992`.

| # | Criterio | Implementación | Evidencia real | Estado |
|---|---|---|---|---|
| 1 | Cada Grupo de equipo usado para costear tiene una tarifa estándar válida. | `resolver_tarifa_hora`: grupo con `tarifa_hora` devuelve `GRUPO`; restricción `tarifa_hora >= 0`; sin tarifa ni estación lanza `tarifa_no_configurada`. El tarifario advierte cuántos grupos activos no tienen tarifa. | `tarifas-c32.test.ts` (validación de tarifa y mensaje de bloqueo) · `configuracion-tarifario-ruteo.test.ts` “avisa cuántos grupos activos no tienen tarifa ni estación” · E2E `catalogos-base.spec.ts` (`tarifario-resumen-sin-tarifa`). | ✅ |
| 2 | Una máquina sin tarifa propia hereda automáticamente la tarifa del grupo. | Sin override activo, SQL no retorna `RECURSO` y cae a `GRUPO`. La lista de equipos muestra “Usa la tarifa de «grupo»”. | `configuracion-tarifas-desplegables.test.ts` “muestra la tarifa heredada del grupo antes de guardar” y “crea el equipo con grupo y sin tarifa propia por defecto” · E2E `catalogos-base.spec.ts:391-398,404-406`. | ✅ |
| 3 | Una máquina con tarifa propia sustituye de manera explícita la tarifa del grupo. | `tarifa_override_activa` devuelve `RECURSO` antes de evaluar el grupo. El alta solo muestra el campo de tarifa propia al activar la excepción. | E2E `catalogos-base.spec.ts:301-339` (tarifa propia sustituye y tarifa propia en cero es explícita) · `tarifas-c32.test.ts` “el alta guiada… solo pide tarifa propia al activar la excepción”. | ✅ |
| 4 | Las Tarifas por estación no compiten con la tarifa del grupo. | Orden SQL: `GRUPO` antes de `ESTACION`. `resumenTarifaGrupo` etiqueta el origen como “Tarifa del grupo”; la estación se muestra como referencia. | `tarifa-estacion.test.ts:66-70` “la estación no compite: sin tarifa del grupo no hay tarifa efectiva” · `configuracion-tarifario-ruteo.test.ts:66-94` (origen y referencia). | ✅ |
| 5 | El fallback nunca es silencioso. | Sin tarifa ni respaldo, SQL lanza `tarifa_no_configurada` (bloquea el costeo). Con respaldo, la UI muestra banner y badge de advertencia. | `tarifa-estacion.test.ts:72-107` (respaldo con `advertencia: true`; respaldo inválido bloquea) · `propuestas-costeo-fabricacion.test.ts:732-748` “marca la tarifa de respaldo con advertencia visible” · `propuestas-validacion-contenido.test.ts:34-44` “solo genera advertencia, no bloquea” · `panel-ruteo-costeo.tsx:907-919`. | ✅ |
| 6 | El ruteo muestra tarifa y origen de tarifa. | Cada operación pinta `origen-tarifa-*` con valor `/h`, origen y advertencia si aplica. | `propuestas-costeo-fabricacion.test.ts:728-729` (“$650.00/h” + “Tarifa del grupo”) · E2E `propuestas-flujo.spec.ts:569-570`. | ✅ |
| 7 | Nuevo equipo permite asignar grupo sin salir del formulario. | El formulario de alta incluye el selector `alta-guiada-equipo-grupo`; no exige visita a otro catálogo. | `configuracion-tarifas-desplegables.test.ts` “crea el equipo con grupo…” · E2E `catalogos-base.spec.ts:388-399`. | ✅ |
| 8 | Nuevo equipo muestra tarifa heredada antes de guardar. | Bloque `alta-guiada-equipo-heredada` con “Tarifa heredada: … · origen”. | `configuracion-tarifas-desplegables.test.ts:184-194` · E2E `catalogos-base.spec.ts:392-397`. | ✅ |
| 9 | Si falta tarifa del grupo, puede resolverse desde el mismo flujo. | Sección condicional con `alta-guiada-equipo-tarifa-grupo` y botón `Configurar tarifa ahora`; usa `guardarGrupoEquipoAccion`, actualiza la tarifa heredada y conserva el borrador. | `configuracion-tarifas-desplegables.test.ts` “permite configurar la tarifa del grupo sin salir del alta ni perder el borrador”. | ✅ |
| 10 | Grupos planeados no son requisito para costear o crear equipos en V1. | `esquemaCrearEquipo` solo exige `grupoEquipoId`; no contiene `grupoPlaneadoId`. El formulario de equipo no pide grupo planeado. | `tarifas-c32.test.ts:41-66` (alta válida sin grupo planeado) · `tarifas-c32.test.ts:22-26` (el grupo planeado no acepta tarifa) · E2E `catalogos-base.spec.ts:388-399` (alta sin grupo planeado). | ✅ |

### Criterio transversal “Se conserva”

- **Permisos:** `configuracion`, `catalogo_ver`, `catalogo_editar` y rol admin
  activo sin cambios. Cuentas bancarias sigue exigiendo `configuracion` aunque se
  acceda desde Tesorería.
- **Contratos:** no se modificaron Server Actions existentes, servicios, RPC,
  esquemas, tablas, migraciones, query keys ni Realtime. Solo se añadieron dos
  lectores delgados (`obtenerDatosEmpresaAccion`, `obtenerCuentasBancariasAccion`)
  que reutilizan servicios existentes.
- **Datos históricos:** los snapshots de costeo y las propuestas ya calculadas
  conservan su tarifa.
- **Enlaces:** `?pestana=tarifas`, `areas`, `catalogos`, `catalogos-base`,
  `usuarios`, `permisos`, `operadores`, `empresa` y `cuentas` funcionan.

---

## 4. Pruebas ejecutadas (evidencia real)

### 4.1 Suite focalizada de tarifas y aceptación

```text
> vitest run tarifas-c32 configuracion-tarifario-ruteo configuracion-tarifas-desplegables
  tarifa-estacion costeo-ruteo-c33 cotizador-tarifas propuestas-ruteo-proceso

Test Files  7 passed (7)
Tests       52 passed (52)
Duration    15.48s
```

```text
> vitest run propuestas-costeo-fabricacion propuestas-validacion-contenido tarifa-estacion

Test Files  3 passed (3)
Tests       62 passed (62)
Duration    19.93s
```

### 4.2 Suite unitaria completa

```text
UI-04 (base consolidada): 300 archivos, 2552/2552 pruebas ✅
UI-05 (main af32992):     297 archivos OK, 5 timeouts ajenos (RFQ/cotizador)
Al repetir los 3 archivos afectados:
Test Files  3 passed (3)
Tests       31 passed (31)
```

Los 5 fallos de la corrida de UI-05 son timeouts bajo carga en pruebas de RFQ y
cotizador, no relacionadas con Configuración; pasan de forma aislada y no se
modificaron para ocultarlos.

### 4.3 Integración, E2E y concurrencia

El job `e2e-local` de GitHub Actions (run `42758740447`, PR #171) ejecutó sobre
el head real de UI-05:

- `pnpm test:integracion` ✅
- `pnpm test:e2e` ✅ (incluye `catalogos-base.spec.ts`, `propuestas-flujo.spec.ts`,
  `configuracion-flujo.spec.ts`, `continuidad-folios-*.spec.ts`,
  `operadores-gestion.spec.ts`, `permisos-usuarios-admin.spec.ts`,
  `taller-taxonomia.spec.ts`, `tesoreria-flujo.spec.ts`).
- `pnpm test:concurrencia` ✅

### 4.4 Gates técnicos

- `tsc --noEmit` ✅
- `eslint` ✅
- `next build --webpack` ✅ (exit 0)
- Vercel deployment `af32992`: **success**
- `https://erp-cc-flame.vercel.app/configuracion` → `307 /iniciar-sesion`
- `https://erp-cc-flame.vercel.app/es/docs` → `200` con la navegación nueva

---

## 5. Riesgos y pendientes reales

1. ~~Capturas del manual desactualizadas~~ — **resuelto en el cierre**: se regeneraron
   las 20 capturas con la interfaz de seis secciones, Supabase local y datos de
   demostración. No se usaron datos reales.
2. ~~Etiquetas residuales “Tarifas / TC” y “Catálogos base”~~ — **resuelto en el
   cierre**: se unificaron los textos visibles del tarifario, Propuestas y RFQ.
3. **Pruebas unitarias sensibles a carga.** RFQ y cotizador presentan timeouts
   esporádicos en la suite completa; pasan de forma aislada. No se modificaron
   para ocultar el problema.
4. **E2E local en el equipo del agente.** La corrida E2E oficial se realizó en CI
   con Supabase local provisionado. Para las capturas se levantó un stack local
   y un servidor Next en `127.0.0.1:3100` con el fixture E2E.

---

## 6. Conclusión

La reestructuración está integrada en `main` (`af32992`) y desplegada en
producción. Los **10 criterios de aceptación de tarifas y equipos** cuentan con
implementación verificable en SQL, UI y pruebas automatizadas, y los permisos,
contratos y datos históricos se conservaron.

## 7. Cierre final — validación funcional y manual

- Se levantó Supabase local, se aplicaron las migraciones pendientes
  (`supabase migration up --local --include-all`) y se provisionó el fixture
  E2E con un administrador de demostración.
- Se compiló y ejecutó la aplicación real en `127.0.0.1:3100`, se inició sesión
  y se recorrieron las seis secciones, los apartados Comerciales/Operativos y
  los diálogos de alta de área, grupo, equipo, proceso, próxima acción y canal.
- Se regeneraron las **20 capturas** de `public/manual/capturas/` contra esa
  interfaz y se actualizaron las páginas del manual que las referencian.
- Se corrigieron las etiquetas visibles que aún decían “Tarifas / TC” o
  “Catálogos base” en el tarifario, Propuestas y RFQ.
- No se modificaron permisos, RPC, Server Actions, cálculos, migraciones ni
  datos de producción.
