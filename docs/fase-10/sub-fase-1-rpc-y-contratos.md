# Sub-fase 10.1 — Consolidación SQL y contratos del Dashboard

## Objetivo

Consolidar métricas operativas y financieras en PostgreSQL, con rangos
comparables y contratos estrictos para que ningún cálculo sensible dependa del
navegador.

## Implementación

- `20260910001120_fase_10_dashboard_base.sql` agrega `metas_vendedor` con meta
  mensual y comisión auditable, RLS habilitada, lectura limitada al propio
  vendedor/equipo autorizado y escritura exclusiva de `service_role`.
- `obtener_metricas_dashboard_ejecutivo` devuelve ventas, cotizaciones,
  órdenes (incluidas aprobaciones pendientes derivadas de OP en `borrador`) y
  finanzas en MXN para el periodo actual y el periodo anterior.
- `obtener_metricas_vendedor` limita pipeline, seguimiento, meta y comisión al
  vendedor activo indicado.
- `obtener_metricas_pipeline_equipo` permite a gerencia consultar el embudo y
  alertas de OP (incluidas aprobaciones pendientes) sin transportar finanzas.
- `obtener_metricas_contador` separa CxC, aging, CxP y flujo de caja del margen
  ejecutivo.
- Todas las RPC son `SECURITY DEFINER`, fijan `search_path`, validan rangos de
  hasta 366 días y revocan `EXECUTE` a `PUBLIC`, `anon` y `authenticated`.

Las métricas usan intervalos semiabiertos `[inicio, fin)` y `now()` de
PostgreSQL. No se creó una vista materializada: su refresco introduciría
latencia y contradice la sincronización Realtime; las consultas aprovechan los
índices de las tablas transaccionales y los índices de rango añadidos por esta
migración, generando una lectura consistente.

## Contratos

`src/modulos/dashboard/tipos/dashboard.ts` define `MetricasEjecutivas`,
`MetricasVendedor`, `MetricasContador`, pipeline de equipo, filtros y tarjetas.
Los mappers reciben `unknown`, validan números finitos y descartan propiedades
no declaradas antes de que el dato llegue a la UI.

`src/modulos/dashboard/validaciones/dashboard.ts` usa Zod v4 estricto,
`z.iso.datetime({ offset: true })`, enum de cinco periodos y comparación
cronológica del rango.
