# Sub-fase 9.1 — Esquema de Gastos y tarifas históricas

## Resultado

Se preparó el modelo transaccional de Gastos/CxP para el ERP ORCA MFG. La
migración `20260909224637_fase_9_gastos_base.sql` crea `public.gastos`, el folio
atómico `GTO-NNNNNN` y la instantánea de tarifa interna que necesita el costeo
por orden.

## Modelo de datos

- `gastos` conserva orden y proveedor opcionales, categoría, descripción,
  subtotal, IVA, total, moneda, tipo de cambio MXN por unidad, estado de pago,
  fechas con zona horaria, comprobante, datos OCR validados, método de pago,
  notas y usuario creador.
- Las restricciones de PostgreSQL rechazan importes negativos, valores no
  finitos, totales que no coinciden con subtotal + IVA, tipos de cambio
  inválidos, vencimientos anteriores y comprobantes que no usen HTTP(S).
- `orden_id` y `proveedor_id` usan claves foráneas restrictivas para impedir
  gastos huérfanos.
- `recursos_planeacion.costo_hora_interno` representa la tarifa vigente. Un
  trigger copia la tarifa al crear `sesiones_trabajo`, de modo que una tarifa
  futura no reescribe el costo histórico.

## Seguridad y concurrencia

- `gastos` tiene RLS activa y solo permite `SELECT` a usuarios autenticados con
  `ver_finanzas`; no existe escritura directa desde el navegador.
- La secuencia y la función de folio revocan `EXECUTE`/uso a `PUBLIC`, `anon` y
  `authenticated`; únicamente `service_role` puede consumirlas.
- Se agregan índices por orden, proveedor, estado y fecha, además de la
  publicación Realtime de `gastos`.

Las fechas de gasto y vencimiento se almacenan como `timestamptz`; la interfaz
permite capturar un día ISO y el servicio convierte los filtros finales en un
rango inclusivo de ese día.

## Estado de despliegue

El archivo está versionado localmente junto con las migraciones posteriores de
Fase 9. La aplicación y la validación SQL remotas quedan pendientes: el CLI de
Supabase devuelve HTTP 403 por privilegios insuficientes para la cuenta
vinculada al proyecto.
