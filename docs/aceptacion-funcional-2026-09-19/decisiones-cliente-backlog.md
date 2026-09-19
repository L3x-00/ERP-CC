# Decisiones para el cliente y backlog de desarrollo restante

## Decisiones que debe responder el cliente (no se inventan)

1. **D-02 · Capacidad**: las "8 horas" ordinarias, ¿son por operador, por estación o la menor de ambas?
   Hoy el sistema bloquea por recurso+turno; el alcance define si además se valida por operador.
2. **D-04 · Exigibilidad de cobranza**: ¿basta la visibilidad del AR al completar la producción
   (regla actual) o el negocio exige que la cuenta nazca exigible desde la aprobación (plazo distinto)?
3. **OBS-21 · Archivo de trabajos terminados**: ¿se archivan al completar producción o al entregar?
   (Propuesta técnica: al entregar, con bandeja separada de pendientes de entrega.)
4. **OBS-27 · Estado de cuenta por cliente**: ¿qué debe incluir (todas las órdenes históricas o solo
   con saldo) y cada cuándo se comparte? El envío real será siempre una acción manual autorizada.
5. **OBS-28 · Selector de orden en gastos**: ¿la búsqueda es por folio, por cliente o por ambos?
6. **OBS-02/03 · Comercial**: ¿se requiere alta de **contactos adicionales** por cliente y un
   **responsable + siguiente acción** obligatorios en el seguimiento del prospecto?
7. **TI · Conteos operativos**: las órdenes internas siguen sumando en activas/atrasadas/en riesgo
   además de en "internas". ¿Se confirma o se excluyen también de lo operativo?
8. **Prioridad** de los bloques 1–5 del backlog siguiente.

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
6. **Brechas parciales OBS** (en la matriz): OBS-02 contacto adicional, OBS-03 acción/responsable,
   OBS-06 planos en taller (ORD-09), OBS-08 desglose en Planeación, OBS-09/PRD-11 colas por área,
   OBS-11 enlaces y notas de sesión, OBS-13 documentos, OBS-14 subáreas/procesos, OBS-17 hilo en
   Producción, OBS-18/19 arrastre y semana/mes, OBS-20 filtro por área, OBS-21 archivo,
   OBS-28 selector legible de orden, OBS-29 desglose por estación en UI.

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
