# Sub-fase 8.2 — Motor de pagos, monedero y aging

Fecha: 2026-08-14

## Resultado

Las RPCs `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` concentran las operaciones financieras en PostgreSQL. `abrir_cuenta_por_cobrar` valida la elegibilidad de la OP dentro de la misma base.

## Garantías transaccionales

- Los pagos calculan la equivalencia, el saldo aplicado, el sobrepago, el crédito MXN y el estado de la cuenta en una sola transacción.
- Los bloqueos siguen un orden estable: cuenta AR → usuario → cliente. La apertura de AR bloquea partidas → orden → cliente para no cruzarse con Producción.
- `solicitud_id` es único. Un reintento devuelve el recibo existente; dos envíos concurrentes usan `ON CONFLICT` y no duplican el cobro.
- Los montos no aceptan valores no finitos. Las conversiones y el monedero trabajan con cuatro decimales.
- El aging se calcula como proyección pura por cliente en MXN, sin modificar datos ni confiar en la pantalla.

## Evolución de migraciones

Las migraciones `20260814144105` y `20260814144257` reparan las funciones aplicadas inicialmente. `20260814150757` alinea el saldo a favor a `numeric(14,4)` y `20260814151257` refuerza las funciones remotas ante doble envío concurrente. Todas están aplicadas y alineadas con Supabase remoto.
