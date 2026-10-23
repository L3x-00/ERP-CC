# Punto de control — Finanzas (C10) cerrado localmente

**Estado 2026-10-19:** Finanzas C10 completado en local y en PRs de cierre. C10.1, C10.2, C10.2b y C10.3 están fusionadas; C10.4 (aceptación y registro) está fusionada en PR #82 (merge `77339e6`), sin migración. El PO aplicó en remoto las migraciones de C10.1–C10.3. No hay migraciones pendientes de Finanzas.

## Tandas y PRs

| Tanda | Alcance | PR / merge | Migración |
| --- | --- | --- | --- |
| C10.1 | Costo sin IVA, Compras como fuente, rubro/material | #78 / `578dca2` | `20261018220000`, `20261018230000` (aplicadas) |
| C10.2 | Conciliación estimado/comprometido/real y márgenes | #79 / `d248521` | `20261019090000` (aplicada) |
| C10.2b | Una factura por entrega sobre una CxC | #80 / `83b9e35` | `20261019120000` (aplicada) |
| C10.3 | F-12 guarda con cobros, flujo en Tesorería, reversos, guardarraíles | #81 / `68d94b9` | `20261019150000` (aplicada) |
| C10.4 | Aceptación E2E y registro documental | #82 / `77339e6` | Ninguna |

## Decisiones que mandan

- **F-01 A:** Material real = consumo de Producción; la compra recibida aporta comprometido y costo unitario, no se suma otra vez.
- **F-02:** una compra PAGADA sin recepción no es real; `compras.recibida_en` congela la recepción.
- **F-03 A:** una factura por entrega en el MVP; `facturas.cuenta_id` es el vínculo autoritativo y el puntero de la CxC se recalcula a la última factura EMITIDA.
- **F-04:** margen estimado con la venta de la Propuesta (snapshot) y margen real con la AR, ambos sin IVA.
- **F-12:** no se cancela una factura con cobros aplicados no reversados; un reverso no bloquea.
- **F-13:** «Flujo por cuenta» vive en Tesorería como vista informativa; no es el saldo conciliado.
- **F-14:** al reversar un cobro se conserva el original marcado «Reversado» y se muestra el contra-registro; nunca se borra.
- **F10:** matriz fuente→concepto y columna Fuente aprobadas; el ajuste manual autorizado del costo real queda **diferido** y F10 es **parcial**.
- **F17/F18:** transferencias neutrales; pagos de compra, movimientos y transferencias no alteran conciliación/rentabilidad.

## Contratos con Órdenes y Planeación

- La ficha de Orden sin `ver_finanzas` no recibe costos estimados ni reales.
- Las horas reales son la suma de sesiones pausadas/finalizadas; la prueba de coherencia dedicada con C9.3 queda **pendiente de C9.3** y no se marca.
- Los eventos financieros van a `registrarLog`/actividad, no al diccionario de eventos de Órdenes.
- `orden_ver_totales` controla totales comerciales; **no** cambia el gate de la conciliación, que sigue siendo `ver_finanzas`.

## Marcas y reservas

- Reservadas por el plan para Finanzas: `20261015100000`, `20261015110000`, `20261015120000`.
- Usadas realmente por Finanzas: `20261018220000`, `20261018230000`, `20261019090000`, `20261019120000`, `20261019150000`.
- Reservas de Órdenes: `20261015120000`, `20261015130000`, `20261015140000`; Finanzas no las usó.
- Antes de una migración nueva: `Glob supabase/migrations` + `supabase migration list`; no reutilizar marcas.

## Evidencia de cierre

- C10.4 E2E de aceptación 1/1: estimado `$7,800.00`, comprometido `$4,000.00`, real `$5,650.00`, margen estimado `61.0 %`, real `71.8 %`, fuentes `Compra · Consumo` y `Gasto`.
- Vitest focal 19/19; pgTAP focal 99/99; typecheck/ESLint focales.
- C10.3: `sii_b8_facturacion` 41/41, `f15` 14/14, 230/1878 unitarias, build, pgTAP 78/1819 y E2E 4/4; CI verde run `39195341121`.
- C10.2: `f03` 58/58, regresiones SQL, integración real, E2E gastos 2/2.
- C10.2b: `sii_b8_facturacion` 38/38, E2E facturación 2/2.
- C10.1: f11 18/18, f06/f08 36/36, sii_b8_compras 31/31, E2E compras/gastos/TI 3/3.

## Límites y siguientes pasos

- No hay ajuste manual autorizado del costo real (F10 parcial).
- Una factura por entrega; la consolidación futura queda posible, no implementada.
- El flujo por cuenta es informativo y su fórmula no sustituye el saldo de Tesorería.
- No se borra ni reemplaza historial financiero; reversos y cancelaciones son trazables.
- C10.4 fusionada (#82, merge `77339e6`); la aceptación del cliente/PO y cualquier corrección futura parten de `origin/main` en una rama nueva.
- La auditoría global B1–B9 sigue pausada; no hay encargo Claude activo. Codex conserva Git, remoto y despliegue.

