# Sub-fase 10.4 — UI funcional y gate E2E

La ruta protegida `/dashboard` compone componentes funcionales:

- `FiltroPeriodoGlobal` para hoy, semana, mes, año y rango personalizado;
- `WidgetMetricaKPI` con valor, variación y señal textual accesible;
- `SeccionFinanciera` con CxC/CxP, utilidad, margen y aging de contador;
- `SeccionVentasPipeline` propio o de equipo;
- `SeccionProduccionAlertas` para aprobaciones pendientes, activas, atrasadas,
  en riesgo y completadas.

`/tablero` queda como redirección de compatibilidad. El panel de operador no
recibe datos financieros y aterriza en `/produccion`.

`tests/e2e/dashboard-roles.spec.ts` cubre vendedor, contador, administrador y
operador con credenciales explícitas `E2E_DASHBOARD_*`. La suite es opt-in y no
crea datos ficticios ni toca el remoto por defecto.
