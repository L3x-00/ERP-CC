# Handoff técnico a Codex — Cobertura funcional ORCA MFG ERP

**Rama:** `codex/cobertura-funcional` (16 commits adelante de `main`, 0 detrás → fast-forward limpio).
**Autor del trabajo:** Claude Code (Opus 4.8), como desarrollador delegado.
**Integración a producción:** corresponde a Codex (integrador único, ver `CLAUDE.md`). Este documento
es el paquete para esa integración.
**Fecha:** 2026-09-16.

> Regla respetada: la configuración local apunta a **producción** (`.env.local` = remoto). No se
> ejecutaron pruebas mutantes, migraciones remotas ni despliegues. Las migraciones las **aplicó el PO**
> en Supabase; Claude nunca tocó el remoto. La verificación ejecutable se hizo en **PGlite aislado**.

---

## 1. Encargo original y cómo se abordó

El encargo: continuar y completar la implementación funcional apuntando a los **164 requisitos** del
catálogo (`docs/auditoria-funcional-2026-09-13/fuentes/catalogo.csv`, separador `;`), con prioridad
inicial en **tarifas centrales** y **adjuntos/recuperación de planos del cotizador**, y luego los
pendientes comerciales, órdenes, planeación, producción, documentos, cobranza, gastos, dashboard y
configuración. Sin rehacer capacidades terminadas, preservando permisos, RLS, atomicidad, concurrencia,
cálculos históricos, diseño y compatibilidad. Verificar antes de declarar completo.

Se trabajó en **bloques verificables**, cada uno con typecheck/lint/test/build y (para las piezas SQL)
verificación en runtime aislado. La matriz operativa de los 164 vive en
`.ai-shared/coordination/COBERTURA_IMPLEMENTACION_ACTUAL.csv` (gitignored; en esta estación).

---

## 2. Estado global de cobertura (2026-09-16)

**47 completo · 74 parcial · 42 ausente · 1 no_verificable_estático (ACC-08) = 164.**

Es un **inventario de código estático + verificación en aislado de las piezas SQL**, no una
certificación de aceptación E2E en navegador (ver §5, límite honesto). "No confundir inventario con
cobertura verificada."

---

## 3. Implementado y verificado (por bloque, con commits)

| Bloque | Commit(s) | Estado |
|---|---|---|
| Cotizaciones: guardado atómico + control de concurrencia | `f5a636c` | ✅ |
| Historial de clientes + filtros comerciales | `8fe5e0d` | ✅ |
| Historial de cobranza + selección bancaria protegida en pagos | `8b0e586` | ✅ |
| Cotizador técnico + cálculos por partida | `3a6cd4e` | ✅ |
| **Tarifas centrales**, **adjuntos/recuperación de planos**, Clientes CLI-03/04/05, tarjetas de dashboard | `d2340f9` | ✅ (prioridad 1 del encargo) |
| Órdenes internas (TI): DAS-01 + RFQ-09 (mig 000002) | `ed4c873` | ✅ |
| Matriz de cobertura 164/164 consolidada | `f460a60` | ✅ |
| Verificación en runtime aislado (PGlite) de los entregables SQL | `ed7e46c` | ✅ |
| Badge "TI" en la tabla de `/ordenes` | `75aeed4` | ✅ |
| Comercial: búsqueda/filtros/resumen del pipeline (RFQ-12/13/14) | `619e944` | ✅ |
| Comercial app-only RFQ-11/12/18 + migraciones 🟡 000003/000004 | `f27f778` | ✅ |
| Migraciones 000003/000004 marcadas como aplicadas | `4fab633` | ✅ |
| RFQ-01 captura de cabecera + RFQ-14 orden vinculada por fila | `5bca653` | ✅ |

### Detalle de las capacidades comerciales del cierre reciente
- **RFQ-11** (moneda e impuesto): IVA opcional en la vista + equivalente MXN para USD (`equivalenteMxn`,
  `obtener-tipo-cambio.ts`). **completo.**
- **RFQ-12** (etiquetas múltiples): CRUD por oportunidad (`gestor-etiquetas.tsx`,
  `actualizar-etiquetas.ts`) + visibles + filtrables. **completo.**
- **RFQ-13** (búsqueda/filtros): `filtrar-oportunidades.ts` + `controles-pipeline.tsx`. **completo.**
- **RFQ-14** (resumen de pipeline): total/ganadas/perdidas/conversión + importe por etapa/pendiente/
  enviado **separado por moneda** (nunca suma MXN+USD) + estado de la orden vinculada por fila.
  **completo.**
- **RFQ-18** (retiro sin orden): `retirar-oportunidad.ts` (rechaza si ganada o hay orden;
  `cotizacion_lineas` CASCADE) + confirmación. **completo.**
- **RFQ-01** (cotización multilínea): captura de cabecera cableada (PO/fecha_requerida/horas/notas) al
  alta y en edición (`gestor-datos-solicitud.tsx`, `actualizar-datos-oportunidad.ts`). **parcial** —
  falta la selección/alta de cliente al cotizar (RFQ-02/03).

---

## 4. Migraciones (serie 20260916*) — TODAS APLICADAS por el PO

| Migración | Contenido | Estado |
|---|---|---|
| `20260916000001_dashboard_respuesta_gastos.sql` | RPC ejecutivo: tiempo de respuesta, %≤24h, gastosTotal, distribución de gasto por categoría (DAS-05/02/06) | Aplicada |
| `20260916000002_ordenes_internas_ti.sql` | `pipeline.es_orden_interna`, `ordenes_produccion.es_interna`; herencia en aprobación; AR rechaza órdenes internas; dashboard `ordenes.internas` (DAS-01/RFQ-09) | Aplicada |
| `20260916000003_pipeline_captura_rfq01.sql` | `pipeline`: `po_cliente`, `fecha_requerida`, `horas_estimadas`, `notas` (RFQ-01) | Aplicada |
| `20260916000004_lineas_area_externo_rfq0506.sql` | `cotizacion_lineas` y `partidas_orden_produccion`: `area_trabajo_codigo`, `es_externo`, `proveedor_externo`, `es_descuento`/`procesos` (RFQ-05/06 + descuento RFQ-03) | Aplicada |

Todas aditivas e idempotentes (`ADD COLUMN IF NOT EXISTS`, default constante → sin reescritura de tabla;
sin cambios de RLS/grants — las columnas nuevas heredan las políticas de fila). Sin regresión: los write
paths (`guardar_cotizacion_atomica` y el INSERT de partidas) usan **lista de columnas explícita** → las
columnas nuevas toman su default.

---

## 5. Verificación

- **Gates por bloque** (último estado): typecheck 0, lint 0, **566 unitarias** (68 archivos), build 17
  rutas.
- **Runtime aislado (PGlite / Postgres-WASM), sin tocar producción** — `.ai-shared/qa/cobertura/*.mjs`:
  - `verificar-dashboard-ti.mjs` (7/7): DAS-05/02/06/01 + grants.
  - `verificar-ti-aprobacion-ar.mjs` (5/5): herencia TI en aprobación, AR rechaza interna, control comercial abre AR.
  - `verificar-comercial-rfq.mjs` (3/3): subtotal embebido (RFQ-14), CASCADE de líneas (RFQ-18), FK SET NULL de orden.
  - `verificar-migraciones-rfq.mjs`: 000003/000004 aplican + idempotencia + defaults.
- **Límite honesto:** no hay aceptación **E2E de navegador** de los 164. Requiere un stack aislado
  (Supabase local/Docker) contra el cual correr `tests/e2e/*.spec.ts`; en esta estación Docker no
  responde y el remoto es producción (excluido). Queda como provisión de entorno para Codex/PO.

---

## 6. PENDIENTE PARA CODEX

### 6.1 Wiring de las columnas 🟡 ya aplicadas (requiere RPC / arquitectura v2)
- **RFQ-05/06 — captura y propagación.** Persistir `area_trabajo_codigo/es_externo/proveedor_externo/
  es_descuento` a nivel línea exige **extender el RPC `guardar_cotizacion_atomica`** (path atómico
  sensible: concurrencia + snapshot técnico). Luego **propagar línea→partida** en el RPC de creación de
  orden (`aprobar_oportunidad_y_crear_orden` / `crear_orden_produccion`) y **excluir las líneas de
  descuento** de las partidas fabricables. Las columnas destino ya existen en ambas tablas.
- **RFQ-02/03 — cliente en la RFQ.** Alta rápida ("Nuevo cliente") + selector de cliente al cotizar sin
  perder la cotización; heredar condiciones de pago y tier; representar el descuento como línea removible
  que recalcula totales (usa `cotizacion_lineas.es_descuento`). **No requiere migración** (`cliente_id`
  + `clientes.tier/condiciones` ya existen). Cierra el parcial de **RFQ-01**.

### 6.2 Decisiones de arquitectura v2 (reconciliar, NO implementar a ciegas)
Muchas "ausentes/parciales" son diferencias deliberadas de v2 respecto al SPA viejo, no olvidos:
- **RFQ-07** estados de RFQ vs etapas del pipeline.
- **RFQ-10** formato de folio (v2 usa OP-######/CNC-….).
- **RFQ-15** la cuenta por cobrar nace al **completar la OP**, no al aprobar (v1 la abría al aprobar).
- **RFQ-17** editar una RFQ que ya tiene orden + sincronización.
- Cobranza/AR: AR al completar OP, avance por partidas (no global), sin reactivación de OP completada.

### 6.3 Cierre de brechas por prioridad (matriz §2)
42 ausentes / 74 parciales. Clústeres con más brecha: **Cobranza/AR (~8)**, **Configuración (~7)**,
**Órdenes (~7)**, **Producción (~5)**. Triage con Codex antes de implementar (varios son §6.2).
- **RFQ-19**: planos aún no consultables desde Producción (parcial).

### 6.4 Housekeeping técnico
- **Regenerar `src/compartido/tipos/supabase.ts`** con `supabase gen types` (acceso correcto = Codex).
  Se editaron a mano las columnas nuevas de TI (000002) y de RFQ-01 (000003); las de 000004
  (`cotizacion_lineas`/`partidas`) **no** están en los tipos todavía (nadie las lee aún) — regenerar al
  cablear RFQ-05/06. Nota de encoding (CLAUDE.md): generar con `Out-File -Encoding utf8`, nunca `>`.
- **Confirmar la decisión de conteos operativos TI**: las OP internas siguen contando en
  activas/atrasadas/en riesgo además de en `internas` (DAS-01 solo pide separarlas de ventas). Documentado
  para que PO/Codex lo confirmen.
- **Aceptación E2E**: provisionar stack aislado y correr `tests/e2e/*.spec.ts`; ampliar harnesses PGlite
  a más RPC (cobranza/pagos, aging, planeación, producción).

---

## 7. Dónde está todo

- **Código de producto**: commiteado en `codex/cobertura-funcional` (ver §3). Árbol limpio salvo 3
  archivos ajenos en `entregables/` (informe/PDF/HTML del Hito 4), que se **preservan sin tocar**.
- **Migraciones**: `supabase/migrations/20260916000001..000004` (en el repo; aplicadas en remoto).
- **Reporte de entrega detallado**: `docs/reporte-implementacion-cobertura-2026-09-16.md` (secciones
  1–10, incluye SQL, verificación y matriz).
- **Coordinación/QA (gitignored, en esta estación)**: matriz
  `.ai-shared/coordination/COBERTURA_IMPLEMENTACION_ACTUAL.csv`, `CHANGELOG_AI.md`, `PROJECT_STATE.md`,
  harnesses `.ai-shared/qa/cobertura/*.mjs`.

---

## 8. Integración a producción (para Codex)

`codex/cobertura-funcional` es descendiente fast-forward de `main` (16↑ / 0↓). El push a la rama genera
**preview de Vercel**; `main` sigue siendo **producción**. La promoción `main` (merge/PR de la rama →
`main` → deploy de producción) es la **integración que ejecuta Codex** según `CLAUDE.md`. Claude no la
realizó por diseño. Todas las migraciones de la serie ya están en el remoto, así que el merge no requiere
pasos SQL adicionales.
