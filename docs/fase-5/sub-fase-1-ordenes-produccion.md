# Fase 5 · Sub-fase 1 — Órdenes de Producción

## Objetivo

Establecer el contrato persistente y validado de una orden de producción antes de crear acciones de negocio o interfaz. La prioridad es impedir folios duplicados y escrituras directas desde el cliente.

## Datos implementados

- `ordenes_produccion`: cabecera con cliente, referencia opcional a la cotización de `pipeline`, estado, prioridad y fechas operativas.
- `partidas_orden_produccion`: piezas solicitadas, cantidades producidas y scrap, material, tiempos y máquina asignada.
- `registros_tiempo_operador`: eventos `inicio`, `pausa` y `fin` de cada operador por partida.
- Todos los modelos incorporan timestamps; `actualizado_en` se mantiene con el trigger compartido de Postgres.

## Concurrencia y seguridad

- `secuencia_folio_orden` inicia en `1001`; `generar_folio_orden('OP')` produce `OP-001001` y delega la concurrencia a `nextval` de Postgres.
- La función solo acepta el prefijo `OP`, verifica el formato con `OP-[0-9]{6}` y está disponible únicamente para `service_role`. Los roles públicos tampoco pueden consumir la secuencia.
- RLS está activa en las tres tablas. `authenticated` solo tiene `SELECT`; no existen políticas ni privilegios de escritura directa. Las mutaciones se reservaron para Server Actions en la Sub-fase 5.2.
- Las claves foráneas enlazan cliente, oportunidad/cotización, material, operador y partidas sin dejar referencias huérfanas.

## Contratos de aplicación

- Los tipos de dominio y mappers en `src/modulos/ordenes/tipos/ordenes.ts` usan nombres en español y se derivan de `src/compartido/tipos/supabase.ts` generado desde la base local.
- Zod v4 valida UUIDs, fechas ISO, partidas obligatorias y los enums estrictos de estado, prioridad y eventos CNC.
- Las pruebas unitarias cubren casos correctos, cantidades inválidas, UUIDs, enums, fechas, partidas vacías y mappers.

## Verificación local

- Migración aplicada al entorno local y listado de migraciones sin diferencias locales.
- Folios consecutivos comprobados: `OP-001001` y `OP-001002`.
- RLS, políticas y privilegios de función/secuencia comprobados desde Postgres.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` correctos.

## Pendientes para la Sub-fase 5.2

- Crear Server Actions para altas y transiciones autorizadas.
- Definir reglas de transición, bloqueo de eventos de tiempo incompatibles y actualización de tiempos/cantidades reales.
- Resolver la búsqueda de folios con contexto de entidad: el Pipeline mantiene folios comerciales `OP-XXXX`, mientras la orden usa `OP-NNNNNN`.
- Aplicar y verificar la migración en el proyecto remoto cuando se restablezcan los permisos de Supabase.
