# Sub-fase 8.1 — Base de Cuentas por Cobrar

Fecha: 2026-08-14

## Resultado

Se incorporó el libro de Cuentas por Cobrar (AR) para órdenes de producción, pagos y monedero de cliente. La migración `20260814143339_fase_8_cobranza_base.sql` crea `cuentas_por_cobrar`, `pagos_ar` y `movimientos_saldo_favor`.

## Decisiones de dominio

- Una cuenta AR se abre explícitamente desde una OP terminada y con todas sus partidas producidas. No se inventan precios ni importes desde Producción.
- Cada cuenta conserva su propia moneda (`USD` o `MXN`) y el tipo de cambio se expresa como MXN por unidad de moneda.
- El monedero del cliente y sus movimientos son exclusivamente MXN. Su saldo usa cuatro decimales para preservar conversiones.
- La secuencia `secuencia_folio_recibo` y `generar_folio_recibo()` producen `REC-NNNNNN` de forma atómica.

## Seguridad

- RLS está activa en las tres tablas. Los usuarios autenticados solo leen si son administradores o poseen `ver_finanzas`.
- No existen políticas directas de escritura desde PostgREST. Las mutaciones pasan por RPCs `SECURITY DEFINER` disponibles únicamente para `service_role`.
- Los contratos TypeScript, mappers puros y Zod v4 validan UUID, moneda, estado, monto finito y precisión de cuatro decimales antes de alcanzar el servicio.
