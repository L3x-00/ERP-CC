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

**Un solo archivo**, idempotente (`CREATE OR REPLACE`, firma sin cambios → conserva grants):

```
supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql
```

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

## 5. Pendientes

1. **Aplicar** `20260916000001` en Supabase (PO) — único paso remoto.
2. **DAS-01 TI**: requiere columna de esquema + flujo de creación (trabajo aparte).
3. **Mapeo de cobertura**: 8/14 módulos mapeados; consolidar la matriz de 164
   (`COBERTURA_IMPLEMENTACION_ACTUAL.csv`) con los 7 restantes.
4. **Resto del catálogo** por prioridad (módulos aún no cerrados).
