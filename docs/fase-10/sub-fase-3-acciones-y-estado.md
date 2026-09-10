# Sub-fase 10.3 — Server Actions, seguridad y estado

`obtenerMetricasInicioAccion` y la acción dedicada
`cambiarPeriodoDashboard` (en `cambiar-periodo-dashboard.ts`) validan el
filtro, resuelven la sesión activa, aplican `can()` según el rol, llaman al
servicio con `service_role`, registran auditoría y devuelven mensajes
genéricos. El servicio vuelve a filtrar secciones, por lo que una alteración
del cliente no puede solicitar margen o finanzas de un vendedor.

`usarTiendaDashboard` conserva filtro, estados de carga, error, revisión y un
último snapshot visual. TanStack Query sigue siendo la fuente de verdad para
los datos; el snapshot no autoriza ni sustituye una lectura del servidor.

`SincronizadorDashboardRealtime` escucha tablas transaccionales y metas,
agrupa ráfagas e invalida `['dashboard']`. Nunca muestra payloads Realtime ni
usa esos eventos para saltarse RLS.
