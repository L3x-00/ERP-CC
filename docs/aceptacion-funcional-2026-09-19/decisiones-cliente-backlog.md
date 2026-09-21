# Decisiones para el cliente y backlog de desarrollo restante

## Decisiones del cliente (segunda ronda)

**Resueltas:**

1. **D-02 · Capacidad — RESUELTA (ajuste):** se separan **jornada laboral** (8 h) y **capacidad
   instalada**. La capacidad instalada es la multiplicación de equipos por jornada: p. ej. 3 CNC
   router × 8 h = **24 h de capacidad por jornada**. Implementación pendiente: número de equipos por
   recurso/estación + override opcional (Planeación, migración).
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
6. **OBS-02/03 · Comercial:** el cliente **solicitó un ejemplo** de contactos adicionales y de
   responsable + siguiente acción antes de decidir.
7. **TI · Conteos operativos — RESUELTA (ajuste):** se incluyen en lo operativo; además se pide, si es
   posible, **obtener el costo de producción de las TI** (no generan precio de venta ni AR).
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
10. **Capacidad por operadores/estación** (D-02) — ⏳ pendiente (Planeación; migración): capacidad =
    operadores × 8 h por turno con override manual opcional.
11. **Contactos y seguimiento comercial** (OBS-02/03) — ⏳ pendiente: contactos adicionales por
    cliente y responsable + siguiente acción obligatorios (migración + UI).
12. **Documentos en piso** (OBS-06/ORD-09 + OBS-13) — ✅ **implementado (bloque 2, 21-sep):** panel
    “Entregables de producción” en el piso: documentos de la orden listados/abiertos con URL firmada
    de corta vida bajo permiso de Producción, subida de archivos durante la ejecución con límites, y
    nota de entrega imprimible con confirmación (recibido por, acumulados por pieza y firmas).
13. **Brechas parciales OBS restantes** (en la matriz): OBS-08 desglose en Planeación, OBS-09/PRD-11
    colas por área, OBS-11 enlaces y notas de sesión, OBS-14 subáreas/procesos, OBS-17 hilo en
    Producción, OBS-18/19 arrastre y semana/mes, OBS-20 filtro por área, OBS-29 desglose por estación
    en UI.

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
