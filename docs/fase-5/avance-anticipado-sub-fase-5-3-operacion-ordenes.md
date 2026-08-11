# Fase 5 · Avance anticipado de Sub-fase 5.3 — Operación transaccional de Órdenes

## Resultado

Este avance se implementó antes de fijar el desglose oficial de la Fase 5. No
corresponde al consumo de materiales de la Sub-fase 5.2: es base reutilizable
de la Sub-fase 5.3, que todavía debe completar el registro de consumo y tiempo,
la tienda Zustand de taller y sus pruebas de seguridad.

El núcleo operativo de Órdenes de Producción no confía en
mutaciones encadenadas desde el navegador ni en conteos de filas. La aprobación
de una oportunidad y la creación de su OP ocurren dentro de una transacción de
PostgreSQL; las Server Actions solo autentican, validan, autorizan y auditan.

## Flujo entregado

```text
Oportunidad en negociación + fecha de compromiso
  → validar sesión y permiso aprobar_ordenes
  → promover/ubicar cliente
  → bloquear oportunidad en PostgreSQL
  → crear OP y partidas desde la cotización
  → marcar oportunidad como ganada
  → registrar auditoría
```

Una segunda solicitud concurrente sobre la misma oportunidad devuelve la OP ya
creada. El índice único parcial de `cotizacion_id` es una defensa adicional
contra duplicados.

## Base de datos

La migración `20260812010000_fase_5_operacion_ordenes.sql` incorpora:

- `motivo_cancelacion` persistente en la cabecera de la orden.
- Índice único para impedir más de una OP por cotización de Pipeline.
- `crear_orden_manual(...)`: crea cabecera y partidas en una única transacción.
- `aprobar_oportunidad_y_crear_orden(...)`: bloquea la oportunidad con
  `FOR UPDATE`, crea la OP y actualiza la etapa como una única unidad.
- `cambiar_estado_orden(...)`: aplica compare-and-set mediante `estadoActual`,
  bloquea la fila y controla fechas de inicio/fin y motivo de cancelación.

Las RPC anteriores son `SECURITY DEFINER`, usan ruta de búsqueda vacía, no son
ejecutables por `PUBLIC`, `anon` ni `authenticated`, y solo `service_role`
puede invocarlas. La protección de columnas controladas de Pipeline ya no usa
una variable de sesión configurable: distingue el rol efectivo del propietario
de la RPC o `service_role`.

## Reglas operativas

| Origen | Destinos permitidos |
| --- | --- |
| `borrador` | `programada`, `cancelada` |
| `programada` | `en_proceso`, `cancelada` |
| `en_proceso` | `pausada`, `completada`, `cancelada` |
| `pausada` | `en_proceso`, `cancelada` |
| `completada`, `cancelada` | Ninguno; son terminales |

- Todas las mutaciones exigen `aprobar_ordenes`.
- Cancelar desde `en_proceso` exige además
  `cancelar_ordenes_en_proceso` y un motivo de al menos tres caracteres.
- Una orden manual no acepta `cotizacionId`; una automática hereda las líneas
  de la cotización de Pipeline.
- La UI de transición a `ganada` exige la fecha de compromiso, por lo que no se
  generan OP sin promesa de entrega.

## Contratos de aplicación

- `src/modulos/ordenes/servicios/ordenes-servicio.ts` concentra las RPC y
  convierte los errores de PostgreSQL en códigos estables.
- `src/modulos/ordenes/acciones/` contiene las acciones manuales y de cambio de
  estado; ambas validan Zod v4, comprueban permisos y emiten auditoría.
- `marcarGanadaAccion` dejó de actualizar Pipeline de forma directa: usa el
  servicio transaccional y retorna `clienteId`, `ordenId` y `folioOrden`.
- `Orden` incorpora `motivoCancelacion`, y sus valores enumerados se comparten
  entre mappers, validaciones y reglas de transición.

## Verificación local

- TypeScript estricto y 151 pruebas unitarias correctas.
- Flujo SQL en transacción validado: aprobación idempotente, una partida
  derivada, programación, inicio y cancelación con motivo; la transacción se
  revierte al finalizar la prueba.
- Ocho solicitudes manuales simultáneas generaron ocho folios
  `OP-NNNNNN` únicos.
- Un rol `authenticated` no logró cambiar la etapa de Pipeline aun fijando la
  variable de sesión usada por la protección histórica.
- `supabase migration list --local` confirmó entonces las migraciones 5.1 y de
  operación inicial sin divergencia local.

## Riesgo conocido

Pipeline conserva un folio comercial histórico `OP-XXXX`; una Orden de
Producción real usa la nueva serie `OP-NNNNNN`. Mientras ambos nombres existan,
las búsquedas y pantallas deben indicar la entidad, no solo el texto del folio.
