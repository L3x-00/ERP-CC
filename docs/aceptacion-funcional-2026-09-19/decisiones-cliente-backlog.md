# Decisiones para el cliente y backlog de desarrollo restante

## Decisiones del cliente (segunda ronda)

**Resueltas:**

1. **D-02 · Capacidad — RESUELTA:** la capacidad ordinaria es **operadores por estación × 8 h**;
   además se agrega una **opción manual opcional** por recurso/turno para ajustes puntuales
   (interpretación propuesta al implementar: default 1 operador = 8 h y campo opcional de override;
   se confirma con el cliente en el arranque del bloque).
2. **D-04 · Exigibilidad de cobranza — RESUELTA:** se mantiene la **regla actual**: la AR nace al
   completar la OP; antes de eso el trabajo no se cobra.
3. **OBS-21 · Archivo — RESUELTA:** los trabajos se archivan **al entregar**, con **bandeja
   separada** de pendientes de entrega (coincide con la propuesta técnica).
4. **OBS-27 · Estado de cuenta — RESUELTA:** de la forma más viable para el negocio: **incluir cada
   orden con su saldo**, descontado según las reglas del proyecto (la AR nace al completar la OP y
   los abonos se aplican por orden), más consolidados del cliente. El envío sigue siendo una acción
   manual autorizada.

**Pendientes de respuesta:**

5. **OBS-28 · Selector de orden en gastos — RESUELTA:** la búsqueda será **por folio y por cliente**.
6. **OBS-02/03 · Comercial — RESUELTA:** sí, se requiere todo: **contactos adicionales** por cliente
   y **responsable + siguiente acción obligatorios** en el seguimiento del prospecto.
7. **TI · Conteos operativos — RESUELTA:** las órdenes internas **siguen sumando** en
   activas/atrasadas/en riesgo además de en “internas”; no se excluyen de lo operativo y deben ser
   **identificables** (badge TI) en todas las vistas donde aparezcan.
8. **Prioridad** de los bloques restantes del backlog: ejecución por valor/riesgo — estado de cuenta
   con órdenes, selector de orden en gastos, TI identificable, archivo al entregar, contactos y
   seguimiento, documentos en piso y capacidad D-02.

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
12. **Documentos en piso** (OBS-06/ORD-09 + OBS-13) — ⏳ pendiente: planos/PDF por partida en la
    terminal de operador y nota de entrega imprimible.
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
