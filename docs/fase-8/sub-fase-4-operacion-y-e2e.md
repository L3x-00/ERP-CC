# Sub-fase 8.4 — Operación de cartera y validación E2E

Fecha: 2026-08-14

## Resultado

La ruta privada `/cobranza` muestra aging, cartera filtrable, registro de pago, aplicación de saldo a favor y recibo imprimible. La interfaz es funcional y secundaria al motor financiero.

## Sincronización sin refresco

`SincronizadorCobranzaRealtime` escucha únicamente las tablas transaccionales publicadas: `cuentas_por_cobrar`, `pagos_ar` y `movimientos_saldo_favor`. Al recibir una señal, invalida la consulta de cartera y la vuelve a leer mediante RLS; nunca usa el payload del evento como dato de interfaz.

El E2E remoto usa un usuario, cliente, OP, partida y AR temporales. Verifica pago parcial, sobrepago, folios REC, bitácora, crédito en monedero y actualización de una segunda sesión. Al finalizar limpia exactamente los registros creados.

## Datos ficticios persistentes

La semilla `SIM-AR` es idempotente y conserva tres cuentas de demostración (pendiente, parcial y pagada), dos pagos y un crédito por sobrepago. Se ejecuta con `pnpm datos:ficticios:cobranza` y se comprueba con `pnpm verificar:ficticios:cobranza`.
