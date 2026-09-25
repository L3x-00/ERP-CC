-- A03/A04: ingreso neto sin IVA con fuente histórica persistida y costos del
-- dashboard alineados con el detalle de la orden (sin duplicar gastos).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

-- Fixtures base -------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '00000000-0000-4000-8000-0000000a0301',
  'a03@prueba.local',
  '{"nombre_completo":"Prueba A03"}'::jsonb
);

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000a0302', 'Cliente A03', 'Cliente A03', 'activo');

UPDATE public.configuracion_sistema SET tipo_cambio_usd = 18.5 WHERE id = 'main';

-- Cuatro cotizaciones: IVA 16, IVA 8 con descuento, IVA 0 y USD con IVA 16.
INSERT INTO public.pipeline (id, folio_op, etapa, nombre_contacto, empresa,
  cliente_id, vendedor_id, moneda, iva_porcentaje)
VALUES
  ('00000000-0000-4000-8000-0000000a0310', 'OP-A03-16', 'negociacion', 'Contacto', 'Empresa A03',
   '00000000-0000-4000-8000-0000000a0302', '00000000-0000-4000-8000-0000000a0301', 'MXN', 16),
  ('00000000-0000-4000-8000-0000000a0311', 'OP-A03-08', 'negociacion', 'Contacto', 'Empresa A03',
   '00000000-0000-4000-8000-0000000a0302', '00000000-0000-4000-8000-0000000a0301', 'MXN', 8),
  ('00000000-0000-4000-8000-0000000a0312', 'OP-A03-00', 'negociacion', 'Contacto', 'Empresa A03',
   '00000000-0000-4000-8000-0000000a0302', '00000000-0000-4000-8000-0000000a0301', 'MXN', 0),
  ('00000000-0000-4000-8000-0000000a0313', 'OP-A03-USD', 'negociacion', 'Contacto', 'Empresa A03',
   '00000000-0000-4000-8000-0000000a0302', '00000000-0000-4000-8000-0000000a0301', 'USD', 16);

INSERT INTO public.cotizacion_lineas (pipeline_id, descripcion, cantidad, precio_unitario, orden)
VALUES
  ('00000000-0000-4000-8000-0000000a0310', 'Pieza maquinada', 1, 1000, 0),
  ('00000000-0000-4000-8000-0000000a0311', 'Pieza maquinada', 1, 1000, 0),
  ('00000000-0000-4000-8000-0000000a0312', 'Pieza maquinada', 1, 1000, 0),
  ('00000000-0000-4000-8000-0000000a0313', 'Pieza maquinada', 1, 1000, 0);

-- RFQ-03: el descuento viene en positivo y se resta de la base gravable.
INSERT INTO public.cotizacion_lineas (pipeline_id, descripcion, cantidad, precio_unitario, orden, es_descuento)
VALUES ('00000000-0000-4000-8000-0000000a0311', 'Descuento comercial', 1, 200, 1, true);

SELECT public.aprobar_oportunidad_y_crear_orden(
  '00000000-0000-4000-8000-0000000a0310'::uuid,
  '00000000-0000-4000-8000-0000000a0302'::uuid,
  now() + interval '20 days'
);
SELECT public.aprobar_oportunidad_y_crear_orden(
  '00000000-0000-4000-8000-0000000a0311'::uuid,
  '00000000-0000-4000-8000-0000000a0302'::uuid,
  now() + interval '20 days'
);
SELECT public.aprobar_oportunidad_y_crear_orden(
  '00000000-0000-4000-8000-0000000a0312'::uuid,
  '00000000-0000-4000-8000-0000000a0302'::uuid,
  now() + interval '20 days'
);
SELECT public.aprobar_oportunidad_y_crear_orden(
  '00000000-0000-4000-8000-0000000a0313'::uuid,
  '00000000-0000-4000-8000-0000000a0302'::uuid,
  now() + interval '20 days'
);

CREATE TEMP VIEW ar_prueba AS
SELECT pipeline.id AS pipeline_id, cuenta.*
FROM public.pipeline AS pipeline
INNER JOIN public.ordenes_produccion AS orden ON orden.cotizacion_id = pipeline.id
INNER JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.orden_id = orden.id;

-- 1-6. El desglose histórico se persiste al aprobar, con cada tasa. -----------
SELECT results_eq(
  $$SELECT monto_subtotal, monto_iva, monto_total FROM ar_prueba
     WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0310'$$,
  $$VALUES (1000::numeric, 160::numeric, 1160::numeric)$$,
  'IVA 16 %: base 1000, IVA 160, total 1160'
);

SELECT results_eq(
  $$SELECT monto_subtotal, monto_iva, monto_total FROM ar_prueba
     WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0311'$$,
  $$VALUES (800::numeric, 64::numeric, 864::numeric)$$,
  'IVA 8 % con descuento: base 800 (1000 - 200), IVA 64'
);

SELECT results_eq(
  $$SELECT monto_subtotal, monto_iva, monto_total FROM ar_prueba
     WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0312'$$,
  $$VALUES (1000::numeric, 0::numeric, 1000::numeric)$$,
  'IVA 0 %: base igual al total y IVA cero explícito'
);

SELECT is(
  (SELECT moneda FROM ar_prueba WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0313'),
  'USD',
  'La cuenta en USD conserva su moneda'
);

SELECT is(
  (SELECT tipo_cambio_origen FROM ar_prueba WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0313'),
  18.5::numeric,
  'La cuenta en USD congela el tipo de cambio del momento'
);

SELECT results_eq(
  $$SELECT monto_subtotal, monto_iva FROM ar_prueba
     WHERE pipeline_id = '00000000-0000-4000-8000-0000000a0313'$$,
  $$VALUES (1000::numeric, 160::numeric)$$,
  'El desglose en USD se guarda en la moneda de la cuenta, no convertido'
);

-- 7-11. Rentabilidad: el margen se mide sobre la base sin IVA. ---------------
UPDATE public.cuentas_por_cobrar AS cuenta
SET cobrable_desde = now(), fecha_vencimiento = now() + interval '30 days'
FROM public.ordenes_produccion AS orden
WHERE orden.id = cuenta.orden_id
  AND orden.cotizacion_id IN (
    '00000000-0000-4000-8000-0000000a0310',
    '00000000-0000-4000-8000-0000000a0313'
  );

-- Costo directo de la orden con IVA 16 %: un gasto de maquila por 500.
INSERT INTO public.gastos (folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago, creado_por)
SELECT 'GTO-990301', orden.id, 'maquila_externa', 'Tratamiento térmico',
  500, 0, 500, 'MXN', 1, 'pendiente', '00000000-0000-4000-8000-0000000a0301'
FROM public.ordenes_produccion AS orden
WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0310';

SELECT is(
  (SELECT r.monto_venta_mxn FROM public.ordenes_produccion AS orden
     CROSS JOIN LATERAL public.obtener_rentabilidad_orden(orden.id) AS r
    WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0310'),
  1000::numeric,
  'D-11: la venta reconocida es la base sin IVA (1000, no 1160)'
);

SELECT is(
  (SELECT r.monto_venta_facturado_mxn FROM public.ordenes_produccion AS orden
     CROSS JOIN LATERAL public.obtener_rentabilidad_orden(orden.id) AS r
    WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0310'),
  1160::numeric,
  'El importe facturado con IVA sigue disponible como dato aparte'
);

SELECT is(
  (SELECT r.utilidad_bruta_mxn FROM public.ordenes_produccion AS orden
     CROSS JOIN LATERAL public.obtener_rentabilidad_orden(orden.id) AS r
    WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0310'),
  500::numeric,
  'La utilidad ya no incluye el IVA: 1000 - 500 = 500 (antes 660)'
);

SELECT is(
  (SELECT r.margen_porcentaje FROM public.ordenes_produccion AS orden
     CROSS JOIN LATERAL public.obtener_rentabilidad_orden(orden.id) AS r
    WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0310'),
  50::numeric,
  'El margen se calcula sobre la base sin IVA'
);

SELECT is(
  (SELECT r.monto_venta_mxn FROM public.ordenes_produccion AS orden
     CROSS JOIN LATERAL public.obtener_rentabilidad_orden(orden.id) AS r
    WHERE orden.cotizacion_id = '00000000-0000-4000-8000-0000000a0313'),
  18500::numeric,
  'USD: la venta neta usa el TC histórico de la cuenta (1000 × 18.5)'
);

-- 12-14. Cuenta histórica sin desglose: no calculable, nunca estimada. -------
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000a0320', 'OP-990301',
  '00000000-0000-4000-8000-0000000a0302', 'completada', now() + interval '5 days');

INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
  tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
) VALUES (
  '00000000-0000-4000-8000-0000000a0321', '00000000-0000-4000-8000-0000000a0320',
  '00000000-0000-4000-8000-0000000a0302', 1160, 1160, 'MXN', 1, 'pendiente',
  now() + interval '30 days', now()
);

SELECT ok(
  (SELECT r.monto_venta_mxn IS NULL
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000a0320') AS r),
  'Sin desglose histórico la venta neta no se inventa: queda NULL'
);

SELECT ok(
  (SELECT NOT r.venta_desglose_conocido AND r.cuentas_sin_desglose = 1
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000a0320') AS r),
  'La respuesta advierte explícitamente que el desglose falta'
);

SELECT ok(
  (SELECT r.utilidad_bruta_mxn IS NULL AND r.margen_porcentaje IS NULL AND NOT r.margen_calculable
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000a0320') AS r),
  'Sin base gravable no se presenta utilidad ni margen'
);

-- 15-20. Dashboard vs detalle en un periodo aislado. ------------------------
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso, creado_en)
VALUES ('00000000-0000-4000-8000-0000000a0330', 'OP-990302',
  '00000000-0000-4000-8000-0000000a0302', 'completada',
  '1999-01-20T00:00:00Z', '1999-01-05T00:00:00Z');

INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, monto_subtotal, monto_iva, saldo_pendiente,
  moneda, tipo_cambio_origen, estado, fecha_emision, fecha_vencimiento, cobrable_desde
) VALUES (
  '00000000-0000-4000-8000-0000000a0331', '00000000-0000-4000-8000-0000000a0330',
  '00000000-0000-4000-8000-0000000a0302', 1160, 1000, 160, 1160, 'MXN', 1, 'pendiente',
  '1999-01-10T00:00:00Z', '1999-02-10T00:00:00Z', '1999-01-10T00:00:00Z'
);

INSERT INTO public.gastos (folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago,
  fecha_gasto, creado_por)
VALUES
  -- Ya representado por el consumo de material de la orden: no debe duplicar.
  ('GTO-990302', '00000000-0000-4000-8000-0000000a0330', 'materia_prima', 'Placa de aluminio',
   500, 0, 500, 'MXN', 1, 'pendiente', '1999-01-15T00:00:00Z',
   '00000000-0000-4000-8000-0000000a0301'),
  -- Gasto directo de la orden: suma en ambas pantallas.
  ('GTO-990303', '00000000-0000-4000-8000-0000000a0330', 'maquila_externa', 'Rectificado',
   300, 0, 300, 'MXN', 1, 'pendiente', '1999-01-15T00:00:00Z',
   '00000000-0000-4000-8000-0000000a0301'),
  -- Indirecto sin orden: no tiene contrapartida en ningún rubro, se conserva.
  ('GTO-990304', NULL, 'servicios_generales', 'Energía eléctrica',
   100, 0, 100, 'MXN', 1, 'pendiente', '1999-01-15T00:00:00Z',
   '00000000-0000-4000-8000-0000000a0301');

SELECT is(
  (SELECT r.costo_total_mxn
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000a0330') AS r),
  300::numeric,
  'Detalle: el gasto de materia prima no suma al costo de la orden (OBS-29)'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '1999-01-01T00:00:00Z', '1999-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'costosReconocidosMxn')::numeric),
  400::numeric,
  'Dashboard: 300 del gasto directo + 100 del indirecto sin orden; la materia prima no duplica'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '1999-01-01T00:00:00Z', '1999-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'gastosIncluidosEnRubrosMxn')::numeric),
  500::numeric,
  'Dashboard: el importe neutralizado por anti-duplicado queda visible'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '1999-01-01T00:00:00Z', '1999-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'gastosTotal')::numeric),
  900::numeric,
  'Dashboard: el gasto desembolsado del periodo (DAS-02) no cambia'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '1999-01-01T00:00:00Z', '1999-02-01T00:00:00Z'
    ) -> 'actual' -> 'ventas' ->> 'ventaNetaMxn')::numeric),
  1000::numeric,
  'Dashboard: la venta del periodo se reconoce neta de IVA'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '1999-01-01T00:00:00Z', '1999-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'utilidadNetaAcumulada')::numeric),
  600::numeric,
  'Dashboard: utilidad = venta neta 1000 - costo reconocido 400'
);

SELECT * FROM finish();
ROLLBACK;
