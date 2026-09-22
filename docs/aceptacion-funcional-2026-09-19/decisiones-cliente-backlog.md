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
13. **OBS menores — estado al 21-sep:** ✅ OBS-17 (hilo de comentarios en Producción), ✅ OBS-20
    (filtro por área ya presente en el calendario de Planeación), ✅ OBS-08 (desglose de partida en
    tarjeta y panel: material/procesos/avance/tiempo con "Por definir" explícito) y ✅ OBS-18/19
    (resumen previo, vistas día/semana/mes, arrastre con confirmación por CAS y propuesta de
    siguiente día hábil con hueco). **Quedan pendientes:** OBS-09/PRD-11 (colas por área), OBS-11
    (enlaces y notas de sesión), OBS-14 (subáreas/procesos), OBS-29 (desglose por estación en UI) y
    OBS-04 (equipo por solicitud).
14. **Costo de TI agregado por periodo** — ⏳ pendiente (opcional): el costo por orden ya se informa en
    la tarjeta de rentabilidad; un total de TI por periodo en el dashboard requiere una RPC nueva.

## Límites de entorno por cerrar

- **OCR (GAS-08)**: el código está probado con proveedor real en producción; en local no hay clave.
  Cerrar con una prueba E2E controlada en un entorno con `OPENROUTER_API_KEY` de sandbox.
- **Concurrencia estricta**: los E2E actuales prueban sincronización multi-vista, no carreras
  simultáneas de RPC; añadir pruebas de dos conexiones sobre aprobación/pago/consumo.
- **CI**: los E2E requieren Supabase local (Docker) + fixture; dejarlos en un job de CI con
  `supabase start` y el script de provisión, o documentar la corrida manual.

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
  local 21/21 (Planeación 2/2); PR para revisión e integración.
- Siguientes: Bloque 2 (OBS-04/11), Bloque 3 (OBS-09/PRD-11 y OBS-14) y Bloque 4 (OBS-29, TI por
  periodo, OCR, concurrencia estricta y CI).
