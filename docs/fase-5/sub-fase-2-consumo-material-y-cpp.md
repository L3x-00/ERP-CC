# Fase 5 · Sub-fase 5.2 — Consumo de materiales y CPP

## Resultado

Se implementó el motor transaccional de consumo de materiales por partida de
Orden de Producción. Cada registro descuenta inventario, genera su salida de
kardex y conserva el costo promedio ponderado (CPP) vigente dentro de una sola
transacción PostgreSQL.

La implementación fue aplicada y comprobada tanto en la base local como en el
proyecto Supabase remoto `pwnecbcynnqnvfwmvrnn`.

## Migración y concurrencia

La migración `20260812020000_fase_5_consumo_material.sql` se ubica después de
la ya aplicada `20260812010000_fase_5_operacion_ordenes.sql`. No se insertó el
timestamp solicitado originalmente (`20260812000001`), ya que alterar el orden
de una historia de migraciones aplicada provocaría drift.

Incluye:

- `registros_consumo_material`: partida, material, usado, scrap, CPP histórico
  y fecha de creación.
- Índices por partida, material y fecha para las consultas de taller y reportes.
- `registrar_consumo_material_op(...)`, una RPC `SECURITY DEFINER` con
  `search_path` vacío. Bloquea el material con `FOR UPDATE`, valida existencia,
  correspondencia con la partida y stock suficiente antes de generar kardex.
- La salida usa `registrar_movimiento_inventario(...)`; si cualquier paso falla,
  PostgreSQL revierte el consumo, el movimiento y el descuento como una unidad.
- El CPP se captura antes de la salida. Las salidas no recalculan CPP porque no
  modifican el costo promedio; el cálculo ponderado se conserva para entradas.
- La columna histórica `movimientos_inventario.cantidad_compra` ahora acepta
  nulo para salidas de producción. La función existente ya lo enviaba como
  nulo, pero la restricción previa impedía una salida legítima.

## Seguridad

- RLS está activa en `registros_consumo_material`.
- `authenticated` solo tiene lectura; no hay políticas de escritura directa.
- La ejecución de `registrar_consumo_material_op` está revocada a `PUBLIC`,
  `anon` y `authenticated`; únicamente `service_role` puede invocarla.
- La futura Server Action será la frontera que valide Zod, permisos y auditoría
  antes de usar ese cliente privilegiado en la Sub-fase 5.3.

## Contratos de aplicación

- `src/modulos/ordenes/tipos/ordenes.ts` incorpora el mapper puro de consumo.
- `src/modulos/ordenes/validaciones/ordenes.ts` valida UUID, cantidades no
  negativas y exige que usado + scrap sea mayor que cero.
- `src/modulos/ordenes/servicios/ordenes-servicio.ts` consulta partidas y
  consumos, e integra la RPC sin emular transacciones en TypeScript.
- `src/modulos/ordenes/servicios/calculo-cpp-servicio.ts` contiene cálculos
  puros de CPP, merma acumulada, costo real y desviación contra el estimado.

## Verificación local

- `pnpm typecheck`: correcto.
- `pnpm test`: 21 archivos y 175 pruebas correctas.
- `pnpm test:integracion`: 4 archivos y 10 pruebas correctas.
- Lint focalizado de los archivos modificados y `pnpm build`: correctos.
- `pnpm supabase migration list --local`: historia local alineada hasta
  `20260812020000`.
- `pnpm supabase db lint --local --fail-on error`: sin errores de esquema.
- Prueba SQL transaccional: consumo de 6 + scrap de 1 desde stock 10 dejó stock
  3, creó un registro de consumo y una salida de kardex con CPP 25. Un segundo
  consumo insuficiente fue rechazado y no alteró esas cantidades. La prueba se
  ejecutó dentro de `ROLLBACK`, sin datos de prueba persistentes.
