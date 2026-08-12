# Fase 5 · Sub-fase 5.3 — Acciones seguras y estado de taller

## Resultado

Se completó la frontera server-side para las Órdenes de Producción. Las
mutaciones críticas no son accesibles desde el navegador ni mediante escritura
directa en PostgREST: las Server Actions validan su entrada, autorizan la
operación, llaman a un servicio privilegiado y generan auditoría.

La migración `20260812030349_fase_5_registro_tiempo_operador.sql` fue aplicada
en Supabase remoto junto con la migración de consumo de 5.2. El listado remoto
de migraciones no presenta drift.

## Acciones entregadas

- `crear-orden.ts`: valida `esquemaCrearOrden`, exige `aprobar_ordenes` y crea
  únicamente OP manuales mediante la RPC que genera el folio en Postgres. Una
  cotización conserva el flujo Pipeline → OP para impedir asociaciones
  arbitrarias.
- `cambiar-estado-orden.ts`: usa compare-and-set. Las transiciones regulares
  requieren `aprobar_ordenes`; cancelar desde `en_proceso` requiere
  `cancelar_ordenes_en_proceso` y motivo válido.
- `registrar-consumo.ts`: exige `aprobar_ordenes` y delega el stock, kardex y
  CPP a la RPC atómica de 5.2.
- `registrar-tiempo-operador.ts`: valida una sesión PIN HMAC vigente, contrasta
  su identidad contra un operador activo y rechaza cualquier `operadorId`
  distinto al de la sesión.

Los errores de servicio se registran internamente con códigos estables y se
devuelve un mensaje genérico al usuario. Los errores de formato, sesión y
permiso se rechazan antes de tocar servicios privilegiados.

## Tiempo de operador a prueba de manipulación

La acción ignora `fechaRegistro` aunque el esquema la acepte para compatibilidad
de validación: la fecha real la asigna `now()` en PostgreSQL. La RPC
`registrar_tiempo_operador_op(...)` bloquea la partida y su OP, exige estado
`en_proceso`, verifica que el operador esté activo y solo puede ejecutarse como
`service_role`. Esto evita insertar tiempos en órdenes programadas, terminadas
o canceladas, incluso ante cambios concurrentes de estado.

El modelo vigente no asigna todavía una partida a un operador concreto; por eso
cualquier operador con sesión PIN válida puede marcar una partida operable. Si
la operación requiere asignación individual, se definirá y modelará antes de
imponer ese control en Planeación o Producción.

## Estado de interfaz

`src/estado/uso-tienda-ordenes.ts` expone `usarTiendaOrdenes` con:

- orden activa;
- filtros por máquina y por estado;
- limpieza de filtros sin perder la orden seleccionada;
- `versionActualizacion`, incrementada por `refrescarOrdenes()` para que el
  panel de taller vuelva a consultar datos después de una acción.

No se persiste este estado en el navegador: cada turno inicia sin filtros ni OP
activa heredados.

## Verificación

- `pnpm typecheck`: correcto.
- `pnpm test`: 22 archivos y 193 pruebas correctas.
- `pnpm test:integracion`: 5 archivos y 15 pruebas correctas, incluidas las
  negativas de permisos para cambio de estado, cancelación y consumo.
- `pnpm build`: correcto; permanece una advertencia preexistente sobre migrar
  `middleware` a `proxy`.
- Lint focalizado: correcto.
- `pnpm supabase migration list`: remoto y local alineados hasta
  `20260812030349`.
- `pnpm supabase db lint --linked --fail-on error`: sin errores de esquema.
- Prueba SQL local con `ROLLBACK`: rechazó tiempo en OP programada y cancelada,
  aceptó solo la OP en proceso, asignó la hora de PostgreSQL y confirmó que
  `authenticated` no puede ejecutar la RPC mientras `service_role` sí.
