# Decisiones para el cliente y backlog de desarrollo restante

## Decisiones del cliente (segunda ronda)

**Resueltas:**

1. **D-02 · Capacidad — RESUELTA (ajuste) e IMPLEMENTADA:** se separan **jornada laboral** (8 h) y **capacidad
   instalada**. La capacidad instalada es la multiplicación de equipos por jornada: p. ej. 3 CNC
   router × 8 h = **24 h de capacidad por jornada**. ✅ implementado (bloque D-02, 21-sep): migración
   `20260919000007` (`cantidad_equipos` + override de jornada), motor de capacidad `equipos × jornada`
   y panel “Capacidad instalada” en Planeación.
2. **D-04 · Exigibilidad de cobranza — RESUELTA (ajuste) e IMPLEMENTADA:** la AR **puede nacer desde la aprobación**
   (visible), pero **no es cobrable hasta la entrega** de la orden; se admiten **anticipos** según
   términos y condiciones con el cliente. ✅ implementado (bloque D-04, 21-sep): migración
   `20260919000005` con `cobrable_desde`, activación al entregar con plazo del cliente y anticipos
   sobre la AR no cobrable; rentabilidad/dashboard solo reconocen cuentas cobrables.
3. **OBS-21 · Entregables de producción — RESUELTA (ajuste):** al completar producción se añaden a
   los entregables las **confirmaciones de las entregas** (nota de entrega con su confirmación; enlaza
   con OBS-13 imprimible).
4. **OBS-27 · Estado de cuenta — RESUELTA (ajuste):** mostrar **solo órdenes abiertas**; para clientes
   a **crédito**, indicar los **días de cartera vencida**. ✅ aplicado sobre la implementación del
   bloque 6a (filtro de abiertas + línea de cartera vencida).
5. **OBS-28 · Selector de orden en gastos:** **ambos** (folio y cliente). ✅ implementado en 6b.
6. **OBS-02/03 · Comercial — IMPLEMENTADA (21-sep):** contactos adicionales por cliente (con principal
   único) en la ficha, y en el seguimiento **responsable** (vendedor asignado) + **siguiente acción
   concreta** obligatoria con aviso de atraso. El cliente había pedido un ejemplo; se entregó y se
   implementó el flujo completo.
7. **TI · Conteos operativos — RESUELTA (ajuste) e IMPLEMENTADA:** se incluyen en lo operativo; además se pide, si es
   posible, **obtener el costo de producción de las TI** (no generan precio de venta ni AR). ✅ implementado
   (21-sep): la tarjeta de rentabilidad informa “Costo de producción” del TI (materiales, mano de obra y
   gastos directos) sin exigir venta, con E2E propio.
8. **Prioridad:** el cliente **solicitó un ejemplo** de priorización del backlog restante.

**Pendientes de respuesta:** ninguno de fondo; 6 y 8 esperan que enviemos los ejemplos.

## Backlog de desarrollo restante (orden propuesto)

1. **Flujo neto por cuenta** (OBS-24): agregación de `pagos_ar` vs `gastos` por `cuenta_bancaria_id`
   a MXN, como sección de Cobranza/Dashboard. Sin migración.
2. **Detalle de orden + Orden de Servicio imprimible** (DOC-01/03 + ORD-03): modal de detalle con
   partidas, horas y totales desde la cotización, documento imprimible y reimpresión. App-only.
3. **Estado de cuenta consolidado por cliente** (OBS-27): vista imprimible con AR, pagos, saldos y
   días de atraso, permiso `ver_finanzas`.
4. **Tiers y categorías editables** (CFG-08/09): catálogos por configuración JSONB (valores actuales
   como default); categorías exige relajar el CHECK y validar contra catálogo. **Requiere migración.**
5. **Edición de órdenes** (ORD-05): solo en `borrador`, RPC `SECURITY DEFINER` con `FOR UPDATE` y
   token de concurrencia; auditoría completa. **Requiere migración.**
6. **Estado de cuenta con órdenes y saldos** (OBS-27 ampliado) — ✅ **implementado (bloque 6a):**
   la vista por cliente suma cada OP con avance, cotizado sin IVA, AR total, abonado, saldo y
   situación (no exigible / por cobrar / vencido / pagado), coherente con D-04; resumen puro con
   unitarias e identificación TI.
7. **Archivo al entregar** (OBS-21) — ✅ **implementado (bloque 6d):** migración
   `20260919000004` (columna `archivada_en` + trigger idempotente al cubrir la entrega total),
   verificado en PGlite 5/5; bandeja **Activas / Archivo** en `/ordenes` con fecha de archivo.
8. **Selector de orden en gastos** (OBS-28) — ✅ **implementado (bloque 6b):** búsqueda por folio y
   cliente con etiqueta legible (`OP-… · Cliente · estado`) y folio visible en la tabla de gastos.
9. **TI identificables** — ✅ **implementado (bloque 6c):** badge TI en tabla de órdenes, kanban de
   Producción, control de piso (cabecera y selector) y estado de cuenta; las internas siguen
   sumando en los conteos operativos como confirmó el cliente.
10. **Capacidad instalada por equipos** (D-02) — ✅ **implementado (bloque D-02, 21-sep):** migración
    `20260919000007` (`cantidad_equipos` + `capacidad_jornada_override_horas`), capacidad por turno =
    equipos × jornada (excepción > override > turno; PGlite 7/7) y panel en Planeación con E2E propio.
11. **Contactos y seguimiento comercial** (OBS-02/03) — ✅ **implementado (bloque OBS-02/03, 21-sep):**
    contactos adicionales por cliente con alta/baja inline en la ficha (migración `20260919000006`,
    PGlite 7/7) y `proximo_paso` obligatorio con fecha de seguimiento (CHECK `NOT VALID` para no tocar
    el histórico).
12. **Documentos en piso** (OBS-06/ORD-09 + OBS-13) — ✅ **implementado (bloque 2, 21-sep):** panel
    “Entregables de producción” en el piso: documentos de la orden listados/abiertos con URL firmada
    de corta vida bajo permiso de Producción, subida de archivos durante la ejecución con límites, y
    nota de entrega imprimible con confirmación (recibido por, acumulados por pieza y firmas).
13. **OBS menores — estado al 21-sep:** ✅ OBS-17, ✅ OBS-20, ✅ OBS-08, ✅ OBS-18/19, ✅ OBS-04,
    ✅ OBS-11, ✅ OBS-09/PRD-11, ✅ OBS-14 y ✅ OBS-29 (desglose por estación/rubro en la tarjeta de
    rentabilidad, con regla anti-duplicado: material y nómina no se suman dos veces). **No quedan
    OBS menores pendientes.**
14. **Costo de TI agregado por periodo** — ✅ implementado 21-sep: RPC
    `obtener_costo_ti_periodo` (materiales, mano de obra y gastos directos de las órdenes internas
    con la misma regla anti-duplicado) y tarjeta "Costo de producción TI" en el dashboard
    ejecutivo (admin) y de contador, con comparativa del periodo anterior.

## Límites de entorno — cerrados

- **OCR (GAS-08)**: ✅ E2E propio (`gastos-ocr.spec.ts`) con proveedor controlado: el arranque E2E
  levanta un stub local de OpenRouter (`tests/e2e/servidor-con-stub-ocr.mjs`) y el cliente acepta
  `OPENROUTER_BASE_URL` solo hacia loopback con `OPENROUTER_PERMITIR_ENDPOINT_LOCAL=si` (en
  producción siempre usa OpenRouter). El gasto guarda además la evidencia cruda
  (`datos_ocr_json`).
- **Concurrencia estricta**: ✅ `tests/integracion/concurrencia-estricta.test.ts` con dos conexiones
  reales sobre `aprobar_oportunidad_y_crear_orden`, `registrar_pago_ar_atomico` y
  `registrar_consumo_material_op` (una sola orden, un solo pago por solicitud, sin stock negativo).
  Corre solo contra Supabase local (guardia de loopback) con `pnpm test:concurrencia`.
- **CI**: ✅ `.github/workflows/ci.yml` con job `verificacion` (typecheck/lint/unitarias) y job
  `e2e-local` (Supabase CLI fijo, `supabase start` + `db reset`, provisionador portable
  `supabase/semillas/e2e-local.mjs`, Chromium, E2E y concurrencia). Se añadió `supabase/seed.sql`
  para que el reset sea determinista.

## Integración

La campaña verificada (164 requisitos: comercial, TI, dashboard, cobranza, gastos, planeación,
piso, aceptación E2E) se integra a `main` con esta entrega. Los bloques del backlog se
desarrollarán en ramas cortas sobre `main` con PR por bloque, manteniendo los gates
(typecheck, lint, unitarias, E2E local, PGlite para SQL).

## Bloques de cierre en curso

- **Bloque 1 — Planeación (OBS-08, OBS-18/19)** ✅ implementado 21-sep, sin migración: desglose de
  partida en tarjeta y panel ("Por definir" explícito), resumen previo a guardar con capacidad,
  vistas día/semana/mes con navegación, arrastre con confirmación bajo CAS y propuesta del
  siguiente día hábil con hueco. Evidencia: 679 unitarias, typecheck/lint 0, build 17 rutas y E2E
  local 21/21 (Planeación 2/2); integrado en `main` (PR #14).
- **Bloque 2 — Comercial/clientes (OBS-04, OBS-11)** ✅ implementado 21-sep: migración
  `20260921000001` (equipo/estación por línea, validado contra `recursos_planeacion` y heredado a
  `partidas.maquina_asignada`), select de estación en el cotizador, deep-link
  `/pipeline?oportunidad=<id>` y notas de taller automáticas en el historial del cliente.
  Evidencia: 686 unitarias, typecheck/lint 0, build 17 rutas y E2E local 22/22; integrado en
  `main` (PR #15) tras aplicar la migración en remoto.
- **Bloque 3 — Taller (OBS-14, OBS-09/PRD-11)** ✅ implementado 21-sep: migración
  `20260921000002` (jerarquía área/subárea/proceso con mapeo a las áreas macro de Planeación;
  `operadores_areas` N:M y validación de área en asignar operador e iniciar sesión), UI de
  configuración de operadores por área, select agrupado en Comercial, cola/filtro por área en piso
  y tablero, y área/estación/responsable visibles en las tarjetas. Evidencia: 692 unitarias,
  typecheck/lint 0, build 17 rutas y E2E local 23/23 (spec nuevo de taxonomía/colas); integrado en
  `main` (PR #16) tras aplicar la migración en remoto.
- **Bloque 4 — Rentabilidad, dashboard, límites y cierre (OBS-29 + TI)** ✅ implementado 21-sep:
  migración `20260921000003` (rentabilidad con anti-duplicado y contador de gastos incluidos,
  desglose por estación/rubro y costo TI por periodo), tarjeta con desglose expandible, tarjeta de
  costo TI en dashboard, E2E de OCR con stub, pruebas de concurrencia de dos conexiones y CI de
  E2E. Evidencia: 700 unitarias, typecheck/lint 0, build 17 rutas, E2E local 24/24 y concurrencia
  3/3. **Pendiente: el PO aplica `20260921000003` en remoto antes del merge.**
- **Cierre de aceptación**: la demo/revisión visual del cliente recorre los bloques nuevos
  (D-04, OBS-02/03, D-02, documentos en piso, costo TI, comentarios en piso, Planeación,
  Comercial/clientes, Taller y Rentabilidad) con los guiones E2E ya verdes como referencia.
