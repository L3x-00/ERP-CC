# Reporte de entrega — Cobertura funcional (2026-09-16)

**Autor:** Claude Code (Opus 4.8), como desarrollador delegado.
**Rama:** `codex/cobertura-funcional` (descendiente directo de `main`; integra por fast-forward).
**Autorización:** El Product Owner autorizó explícitamente escribir la migración de dashboard
(que **aplica el PO** en Supabase) y commitear/pushear (excepción puntual a la reserva de Git
de Codex en `AGENTS.md`, por orden directa del PO).

> Nota: `.ai-shared/`, `.claude`, `AGENTS.md`, `CLAUDE.md` y `documentos/` están gitignored y
> **no** entran a este commit. Los 3 entregables ajenos (`entregables/*.pdf|.py|.html`) se
> preservan intactos y **se dejan fuera** del commit.

---

## 1. Qué se implementó

Seis bloques de la campaña de cobertura (catálogo de 164 requisitos), todos verificados en
local. Los cinco primeros son app-only (sin SQL); el sexto agrega una migración que **aplica
el PO**.

| # | Bloque | Requisitos | SQL |
|---|--------|-----------|-----|
| 1 | Tarifas centrales del cotizador | CFG-10, OBS-30 | No (JSONB `tarifas_json.estaciones`) |
| 2 | Planos adjuntos por oportunidad | COT-04/05/06, RFQ-19, OBS-06, DOC-04 | No (Storage + RLS existentes) |
| 3 | Clientes: tier, consumo y crédito | CLI-03, CLI-04, CLI-05 | No (surfacing UI) |
| 4 | Dashboard: conversión + pipeline activo | DAS-05 (conversión/meta), DAS-01 (importe) | No (dato ya en RPC) |
| 5 | Dashboard: drill-down de antigüedad | OBS-01 | No (query-param + filtro) |
| 6 | Dashboard: respuesta comercial y gasto | DAS-05 (tiempo/%24h), DAS-02, DAS-06 | **Sí → aplicar `20260916000001`** |

### Bloque 6 — detalle (el que requiere SQL)
La migración `supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql` extiende de
forma **aditiva** el RPC `obtener_metricas_dashboard_ejecutivo` (`CREATE OR REPLACE`, firma
idéntica → conserva permisos; ambas ramas *actual*/*anterior*):

- **DAS-05** — `ventas.tiempoRespuestaHorasPromedio` y `ventas.porcentajeRespondidas24h`
  (sobre `pipeline`: `fecha_envio_cotizacion - creado_en`; CTE `respuesta` **sin** join a
  `cotizacion_lineas` para no distorsionar el promedio).
- **DAS-02** — `finanzas.gastosTotal` del periodo, como clave propia.
- **DAS-06** — `distribucionGastoPorCategoria` (array `{categoria, montoMxn}` sobre
  `gastos.categoria`), a nivel de resumen de periodo.

El consumo en el app es **defensivo**: `dashboard.ts` lee las claves nuevas con
`numeroOpcional`/`distribucionGastoDesde` (default `0`/`[]`). Por eso el dashboard **no se
rompe** con el RPC viejo; al aplicar la migración, se pueblan los datos. Las tarjetas nuevas
mostrarán `0` y la distribución estará vacía hasta que se aplique el SQL.

### DAS-01 (órdenes internas "TI" por separado) — NO implementado, por diseño
El esquema no lo soporta: `ordenes_produccion.folio` tiene CHECK `^OP-[0-9]{6}$` (no hay folio
`TI`) y ni `ordenes_produccion` ni `pipeline` tienen bandera de orden interna. Implementarlo
exigiría una **columna nueva** + ajustar el flujo de creación de OP para poblarla; es trabajo
aparte, no una migración de dashboard. Meterlo ahora sería inventar un dato o una tarjeta
siempre en `0`.

---

## 2. SQL que debe aplicar el Product Owner

Idempotentes (`CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS`, firmas sin cambios → conservan grants):

```
supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql   (APLICADA por el PO)
supabase/migrations/20260916000002_ordenes_internas_ti.sql          (POR APLICAR)
```

> `20260916000002` (órdenes internas TI, sección 6) vuelve a hacer `CREATE OR REPLACE` del
> RPC ejecutivo como **superset** de `20260916000001`; aplicarla después de la primera. Al
> añadir columnas con `DEFAULT false`, Postgres no reescribe la tabla y backfillea filas
> existentes.

Pasos sugeridos:
1. Aplicarlo en Supabase (SQL Editor o `supabase db push` según tu flujo).
2. Si se aplicó por SQL Editor, reconciliar historial:
   `supabase migration repair --status applied 20260916000001 --linked`.
3. Confirmar alineación: `supabase migration list` (remoto == archivos locales).
4. Refrescar el dashboard (rol admin/ejecutivo) y validar que aparecen: "Tiempo de
   respuesta", "Respondidas ≤24 h", "Gastos del periodo" y la sección "Gasto por categoría".

No hay otras migraciones nuevas. El resto de bloques (1–5) no necesita SQL.

---

## 3. Verificación

- **Gates locales:** `typecheck` 0 · `lint` 0 · **`test` 542/542** (66 archivos, solo
  unitarias; suites mutantes de integración excluidas por apuntar a producción) · `build` 17 rutas.
- **Migración (bloque 6):** verificación adversarial en frío con 3 agentes independientes
  contra los DDL reales (corrección de esquema, seguridad/idempotencia, contrato app↔SQL):
  los 3 `ok`, **sin hallazgos bloqueantes**. Se aplicaron 2 endurecimientos sugeridos
  (`EXTRACT(EPOCH …)::numeric` y guard `fecha_envio >= creado_en` también en el denominador).
- **No** se ejecutaron pruebas mutantes ni migraciones remotas ni despliegues (constraint de
  producción respetado).

---

## 4. Archivos de esta entrega (dónde está commiteado)

Commiteado en la rama **`codex/cobertura-funcional`** (el hash exacto de esta entrega se
reporta al PO junto con el push).

**Bloque 6 (dashboard SQL), nuevos/mod. hoy:**
- `supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql` (nuevo)
- `src/modulos/dashboard/tipos/dashboard.ts` (tipos + mappers defensivos)
- `src/modulos/dashboard/servicios/dashboard-servicio.ts` (tarjetas + `distribucionGasto`)
- `src/modulos/dashboard/componentes/seccion-gasto-categoria.tsx` (nuevo, DAS-06)
- `src/modulos/dashboard/componentes/operacion-dashboard.tsx` + `componentes/indice.ts`
- `tests/unitarias/dashboard-tarjetas.test.ts`, `tests/unitarias/dashboard-mappers.test.ts`

**Bloques 1–5 (sesión previa, incluidos en el commit):** cotizador (tarifas), pipeline
(adjuntos), clientes (tier/crédito), dashboard (conversión/pipeline/aging), cobranza (aging),
configuración (tarifas por estación) y sus tests. Ver `git show --stat` del commit de entrega.

---

## 6. Órdenes internas (TI) — DAS-01 + RFQ-09 (entregado 2026-09-16)

Cierra DAS-01 completo. Mecanismo por **bandera booleana** (el folio sigue `OP/CNC`; se
etiqueta "TI"):

- **Migración `20260916000002_ordenes_internas_ti.sql`** (la aplica el PO): añade
  `pipeline.es_orden_interna` y `ordenes_produccion.es_interna`; `aprobar_oportunidad_y_crear_orden`
  hereda el flag a la OP; `abrir_cuenta_por_cobrar` **rechaza** órdenes internas
  (`orden_interna_sin_cobranza`, RFQ-09 "no AR"); el RPC ejecutivo **excluye** las RFQ internas de
  ventas/cotizado/conversión y añade el conteo `ordenes.internas`.
- **App**: toggle "Orden interna (TI)" en el alta de oportunidad y en el editor de cotización
  (acción `actualizar-orden-interna`, solo con la oportunidad abierta, autz dueño/admin/
  `ver_pipeline_equipo`); tarjeta "Órdenes internas (TI)" en el dashboard; badge "TI" en la
  tarjeta de oportunidad **y en la tabla de `/ordenes`** (`ordenes_produccion.es_interna` →
  `Orden.esInterna` → proyección `OrdenTabla`). Tipos generados `supabase.ts` a mano (sin acceso remoto).
- **Decisión de diseño**: las OP internas SÍ siguen contando en los indicadores OPERATIVOS
  (activas/atrasadas/en riesgo) además de en `internas`; DAS-01 pide separarlas de **ventas**,
  no ocultarlas del piso. Si se prefiere excluirlas también de lo operativo, es un `AND NOT
  orden.es_interna` en esos conteos (pendiente de confirmación de Codex/PO).
- **Verificación**: workflow de 3 agentes en frío comparó cada RPC contra su versión vigente —
  fidelidad sin regresión (aprobación y AR), columnas/dashboard/contrato correctos, los 3 `ok`.

## 7. Cobertura consolidada — matriz 164/164 (2026-09-16)

Se completó el mapeo de los 164 requisitos del catálogo. Artefactos (en `.ai-shared/coordination/`,
gitignored por política; no forman parte del commit):

- `COBERTURA_IMPLEMENTACION_ACTUAL.csv` — matriz operativa, 164 filas
  (`ID;Modulo;Capacidad;Estado;Evidencia;Brecha;Prueba`).
- `COBERTURA_MAPEO_COMPLETO_2026-09-16.json` — mismo contenido por módulo.
- `cobertura-mapeo/*.json` — fuentes por dominio (cada agente persistió la suya en vivo).

**Estado global: 43 completo · 77 parcial · 43 ausente · 1 no verificable estático (ACC-08).**
Es un mapeo de **código estático** (no runtime): inventario de cobertura, no certificación de
aceptación. Método: 7 agentes por dominio para los 88 faltantes + 1 refresco de 10 IDs re-tocados
esta sesión (para no dejar obsoletos RFQ-09/CLI/COT/CFG-10).

**Avance comercial (bloque app-only)**: RFQ-13 (búsqueda + filtros del pipeline), RFQ-14 (resumen
por conteo: total/ganadas/conversión) y RFQ-12 (etiquetas visibles y filtrables) pasan de
ausente/parcial a **parcial** — servicios puros testeados + UI aditiva sobre el tablero, sin
migración. Quedan fuera (honesto): filtro por área (depende de RFQ-05), filtro por cliente y
descuento heredado (RFQ-02/03), importe por estado (sumar líneas), y CRUD de etiquetas.

**Brechas mayores (ausentes) por dominio**: RFQ/Pipeline (8), Cobranza (8), Órdenes (7),
Configuración (7), Producción (5), Planeación (3), Documentos (2), más CLI-08, GAS-02, OBS-02/27/28.
Varias ausentes/parciales son **decisiones de arquitectura v2** frente al SPA viejo (p. ej. el AR
nace al completar la OP, no al aprobar; avance por partidas, no global; sin reactivación de OP
completada) — a reconciliar con Codex, no son olvidos.

## 8. Verificación en runtime (entorno aislado)

La matriz (sección 7) es un mapeo de código **estático**. Para elevar los entregables de esta
sesión a **verificación ejecutada** sin tocar producción (el `.env.local` apunta al remoto; el
HANDOFF prohíbe E2E/mutaciones contra él), se corrieron harnesses **PGlite** (Postgres-WASM en
memoria) que cargan las **migraciones reales** y ejecutan los RPC con aserciones deterministas:

- `.ai-shared/qa/cobertura/verificar-dashboard-ti.mjs` — **7/7 APROBADO**. Ejecuta
  `obtener_metricas_dashboard_ejecutivo` tras `20260916000002` y verifica DAS-05 (tiempo de
  respuesta 27 h, 50 % ≤24 h), DAS-02 (gasto 21 000), DAS-06 (distribución ordenada), DAS-01
  (internas = 2; RFQ internas excluidas de cotizado/conversión), grants a solo `service_role`.
- `.ai-shared/qa/cobertura/verificar-ti-aprobacion-ar.mjs` — **5/5 APROBADO**. Con las funciones
  reales `crear_orden_produccion` + `aprobar_oportunidad_y_crear_orden` + `abrir_cuenta_por_cobrar`:
  aprobar una oportunidad interna hereda `es_interna=true` a la OP; abrir AR sobre una OP interna
  es rechazado (`orden_interna_sin_cobranza`); una OP comercial completada sí abre AR.
- Suite unitaria del repo (`pnpm test`): **543/543** (lógica de app: mappers, tarjetas, aging).

**Alcance y límite honesto**: lo runtime-verificado son las piezas SQL de esta sesión
(DAS-01/02/05/06, RFQ-09/bloqueo AR). Los harnesses corren en un Postgres aislado con contorno
mínimo — **no** ejercitan Auth/PostgREST/Realtime, `now()`-dependientes ni concurrencia
multiconexión. La **aceptación end-to-end real** de los 164 (navegador + BD) requiere un **stack
aislado** (Supabase local / Docker) contra el cual correr `tests/e2e/*.spec.ts`; hoy ese entorno
no está disponible aquí (Docker no responde) y el remoto es producción (excluido). Eso queda como
provisión de entorno para el PO/Codex, no como algo ejecutable en esta estación.

## 9. Comercial: 🟢 cerrable + migraciones 🟡 escritas (2026-09-16)

### 9.1 App-only implementado y verificado (sin migración, vivo de inmediato)
- **RFQ-12 — CRUD de etiquetas.** `src/modulos/pipeline/componentes/gestor-etiquetas.tsx`
  (añadir/quitar por oportunidad), acción `acciones/actualizar-etiquetas.ts` (authz
  dueño/admin/`ver_pipeline_equipo`, recorte + dedupe case-insensitive), integrado en
  `editor-cotizacion.tsx` (invalida el listado para reflejar los chips). → **completo**.
- **RFQ-11 — IVA opcional + equivalente MXN.** `ResumenTotales` (en `formulario-cotizacion.tsx`)
  con interruptor "Incluir IVA" (ayuda de vista; no cambia el % persistido) y fila de equivalente
  MXN para cotizaciones USD; helper puro `equivalenteMxn` en `calcular-totales-cotizacion.ts`;
  acción `obtener-tipo-cambio.ts` lee el TC vigente de configuración. → **completo**.
- **RFQ-18 — Retiro de RFQ sin orden.** `acciones/retirar-oportunidad.ts` (rechaza si
  etapa=ganada o si existe orden con `cotizacion_id`; borra vía admin tras authz) +
  `componentes/boton-retirar-oportunidad.tsx` (confirmación en dos pasos, visible salvo ganada).
  `cotizacion_lineas` ON DELETE CASCADE borra las líneas. → **completo**.
- **RFQ-14 — Importe (embebido de líneas).** `obtener-oportunidades.ts` embebe
  `cotizacion_lineas(cantidad, precio_unitario)` para el subtotal por oportunidad;
  `resumen-pipeline.ts` agrega importe por etapa / pendiente / enviado **separado por moneda**
  (nunca suma MXN+USD); importe por fila en la tarjeta y "enviado/pendiente" en la barra de
  controles. → sigue **parcial** (falta el estado de la orden vinculada por fila).

### 9.2 Migraciones 🟡 (APLICADAS por el PO 2026-09-16)
Aditivas, idempotentes (`ADD COLUMN IF NOT EXISTS`, default constante → sin reescritura de tabla),
sin cambios de RLS/grants (las columnas nuevas heredan las políticas de fila vigentes). Ambos write
paths que tocan estas tablas (`guardar_cotizacion_atomica` y el INSERT de partidas al crear la OP)
insertan con **lista de columnas explícita**, así que las columnas nuevas toman su default y no hay
regresión tras aplicar:
- `supabase/migrations/20260916000003_pipeline_captura_rfq01.sql` — **RFQ-01**: `pipeline`
  `po_cliente`, `fecha_requerida`, `horas_estimadas`, `notas`.
- `supabase/migrations/20260916000004_lineas_area_externo_rfq0506.sql` — **RFQ-05/06** (+ línea de
  descuento de **RFQ-03**): `cotizacion_lineas` y `partidas_orden_produccion` con
  `area_trabajo_codigo`, `es_externo`, `proveedor_externo`, `es_descuento` / `procesos`.

El **wiring de app** de estas 🟡 (captura de cabecera RFQ-01, selección/alta rápida de cliente y
herencia de condiciones/tier RFQ-02/03, propagación línea→partida y exclusión de descuento en el
RPC de creación de orden RFQ-05/06) es la **reconciliación de arquitectura v2 = Codex**. RFQ-02/03
**no requieren migración nueva**: `pipeline.cliente_id` ya liga al cliente y `clientes` ya tiene
tier/condiciones (fase 3); solo falta el wiring de app.

### 9.3 Verificación en runtime aislado (PGlite) y gates
- `.ai-shared/qa/cobertura/verificar-comercial-rfq.mjs` — **3/3**: subtotal embebido = suma de
  líneas (RFQ-14); DELETE de `pipeline` cascadea las líneas (RFQ-18); orden asociada ⇒ FK SET NULL
  (motivo de la guarda de la acción).
- `.ai-shared/qa/cobertura/verificar-migraciones-rfq.mjs` — **12 columnas + idempotencia +
  defaults** de `20260916000003`/`20260916000004`.
- Gates: **typecheck 0 · lint 0 · 559 unitarias (67 archivos, +7) · build 17 rutas.**
- Matriz actualizada: **46 completo · 75 parcial · 42 ausente · 1 no_verificable_estatico.**

## 10. Bucket A app-only tras aplicar las migraciones (2026-09-16)

Con las 4 migraciones `20260916*` en producción, se cerró el trabajo app-only que quedó desbloqueado:

- **RFQ-01 — captura de cabecera CABLEADA.** `crear-prospecto.ts` persiste `po_cliente`,
  `fecha_requerida`, `horas_estimadas`, `notas`; `formulario-prospecto.tsx` los captura al alta;
  la acción `actualizar-datos-oportunidad.ts` (authz dueño/admin/`ver_pipeline_equipo`, solo
  oportunidad abierta) + el componente `gestor-datos-solicitud.tsx` los editan desde el editor de
  cotización. `Oportunidad`+`filaAOportunidad` incorporan los 4 campos; `supabase.ts` editado a mano
  (4 columnas en `pipeline`). Sigue **parcial** solo por la selección/alta de cliente al cotizar
  (RFQ-02/03), que es arquitectura v2 = Codex.
- **RFQ-14 → completo.** `obtener-oportunidades.ts` embebe también `ordenes_produccion(folio, estado)`
  por `cotizacion_id`; el estado de la orden vinculada se muestra por fila en la tarjeta y en una
  columna nueva de la tabla. Con el importe por moneda ya entregado, RFQ-14 queda completo.
- **NO app-only puro (queda para Codex):** RFQ-05/06 captura a nivel línea. Persistir
  `area_trabajo_codigo/es_externo/proveedor_externo/es_descuento` exige extender el RPC atómico
  `guardar_cotizacion_atomica` (migración sobre el path de guardado, sensible por concurrencia y
  snapshot técnico) → v2 con la propagación línea→partida.
- Gates: **typecheck 0 · lint 0 · 566 unitarias (68 archivos, +7) · build 17 rutas.**
- Matriz: **47 completo · 74 parcial · 42 ausente · 1 no_verificable_estatico.**

## 5. Pendientes

1. ~~Aplicar `20260916000003` y `20260916000004`~~ **APLICADAS** por el PO (2026-09-16), junto con
   `20260916000001` y `20260916000002`. Las 4 migraciones de esta serie están en producción.
2. **Codex — arquitectura v2**: RFQ-05/06 (captura a nivel línea vía extensión del RPC
   `guardar_cotizacion_atomica` + propagación línea→partida + exclusión de descuento en el RPC de
   orden); RFQ-02/03 (selección/alta de cliente al cotizar + herencia condiciones/tier — cierra el
   parcial de RFQ-01); y los RFQ 🔴 (RFQ-07 estados vs etapas, RFQ-10 folio, RFQ-15 AR en aprobación,
   RFQ-17 editar RFQ con orden).
3. **Confirmar** la decisión de conteos operativos (sección 6): las OP internas siguen sumando
   en activas/atrasadas/en riesgo además de contarse en `internas`.
4. **Cerrar brechas por prioridad** usando la matriz (sección 7): los 42 ausentes y 74 parciales.
   Antes de implementar, reconciliar con Codex las que son diferencias de arquitectura v2.
5. **Aceptación E2E**: provisionar un stack aislado (Supabase local/Docker) para correr
   `tests/e2e/*.spec.ts` sin tocar producción; ampliar harnesses PGlite a más RPC (cobranza,
   planeación, producción) para runtime-verificar más requisitos sin navegador.
