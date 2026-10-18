-- C10.1/F11 — todo costo de gasto se calcula sobre monto_subtotal (sin IVA):
-- tarjeta (rentabilidad), desglose, Dashboard ejecutivo y costo de TI.
-- Un gasto de 5,000 + IVA 800 (total 5,800) debe costar 5,000 en las cuatro RPC.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(18);

-- Fixtures -------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f1101', 'f11@prueba.local',
   '{"nombre_completo":"Prueba F11"}'::jsonb);

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000f1102', 'Cliente F11', 'Cliente F11 SA', 'activo');

-- Orden interna: alimenta la tarjeta y el costo de TI del mismo periodo.
INSERT INTO public.ordenes_produccion
  (id, folio, cliente_id, estado, es_interna, fecha_compromiso, creado_en)
VALUES
  ('00000000-0000-4000-8000-0000000f1130', 'OP-991101',
   '00000000-0000-4000-8000-0000000f1102', 'completada', true,
   '2001-01-20T00:00:00Z', '2001-01-05T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000f1131', 'OP-991102',
   '00000000-0000-4000-8000-0000000f1102', 'completada', false,
   '2001-01-20T00:00:00Z', '2001-01-05T00:00:00Z');

-- Gasto directo con IVA: subtotal 5,000, IVA 800, total 5,800 (periodo 2001-01).
INSERT INTO public.gastos (folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago,
  fecha_gasto, creado_por)
VALUES ('GTO-991101', '00000000-0000-4000-8000-0000000f1130', 'maquila_externa',
  'Tratamiento térmico', 5000, 800, 5800, 'MXN', 1, 'pendiente',
  '2001-01-15T00:00:00Z', '00000000-0000-4000-8000-0000000f1101');

-- Gasto sin Orden en otro periodo: no debe cambiar el costo de ninguna Orden.
INSERT INTO public.gastos (folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago,
  fecha_gasto, creado_por)
VALUES ('GTO-991102', NULL, 'servicios_generales', 'Energía eléctrica',
  1000, 160, 1160, 'MXN', 1, 'pendiente',
  '2002-01-15T00:00:00Z', '00000000-0000-4000-8000-0000000f1101');

-- 1-2. Tarjeta de rentabilidad: costo directo y total sin IVA. ----------------
SELECT is(
  (SELECT r.costo_gastos_directos_mxn
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000f1130') AS r),
  5000::numeric,
  'Rentabilidad: el gasto 5,000 + IVA 800 cuesta 5,000 (subtotal)'
);

SELECT is(
  (SELECT r.costo_total_mxn
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000f1130') AS r),
  5000::numeric,
  'Rentabilidad: el costo total usa el subtotal, no el total con IVA'
);

-- 3-4. Desglose por rubro: la fila de gasto suma subtotal. --------------------
SELECT results_eq(
  $$SELECT importe FROM public.obtener_desglose_rentabilidad_orden(
      '00000000-0000-4000-8000-0000000f1130') WHERE rubro = 'gasto'$$,
  $$VALUES (5000::numeric)$$,
  'Desglose: la categoría de gasto suma 5,000 sin IVA'
);

SELECT is(
  (SELECT count(*) FROM public.obtener_desglose_rentabilidad_orden(
     '00000000-0000-4000-8000-0000000f1130') WHERE rubro = 'gasto'),
  1::bigint,
  'Desglose: una sola fila de gasto para la orden'
);

-- 5-7. Dashboard ejecutivo: costo reconocido y gasto del periodo sin IVA. ----
SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'costosReconocidosMxn')::numeric),
  5000::numeric,
  'Dashboard: el costo reconocido del gasto es 5,000 (sin IVA)'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'gastosTotal')::numeric),
  5000::numeric,
  'Dashboard: el gasto del periodo se informa sin IVA (F-08)'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'utilidadNetaAcumulada')::numeric),
  (-5000)::numeric,
  'Dashboard: sin venta la utilidad es el costo neto, no el importe con IVA'
);

-- 8-10. Costo de TI (órdenes internas) también sin IVA. -----------------------
SELECT is(
  ((public.obtener_costo_ti_periodo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' ->> 'costoGastosMxn')::numeric),
  5000::numeric,
  'Costo TI: los gastos de la orden interna suman 5,000 sin IVA'
);

SELECT is(
  ((public.obtener_costo_ti_periodo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' ->> 'costoTotalMxn')::numeric),
  5000::numeric,
  'Costo TI: el costo total usa el subtotal del gasto'
);

SELECT is(
  (SELECT r.costo_total_mxn
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000f1131') AS r),
  0::numeric,
  'Un gasto sin Orden no cambia el costo de ninguna Orden'
);

-- 11-14. Privilegios de las RPC modificadas. ---------------------------------
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.obtener_rentabilidad_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.obtener_rentabilidad_orden(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role',
    'public.obtener_rentabilidad_orden(uuid)', 'EXECUTE'),
  'Rentabilidad: solo el servidor ejecuta la RPC'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.obtener_desglose_rentabilidad_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.obtener_desglose_rentabilidad_orden(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role',
    'public.obtener_desglose_rentabilidad_orden(uuid)', 'EXECUTE'),
  'Desglose: solo el servidor ejecuta la RPC'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.obtener_metricas_dashboard_ejecutivo(timestamptz,timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.obtener_metricas_dashboard_ejecutivo(timestamptz,timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role',
    'public.obtener_metricas_dashboard_ejecutivo(timestamptz,timestamptz)', 'EXECUTE'),
  'Dashboard: solo el servidor ejecuta la RPC'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.obtener_costo_ti_periodo(timestamptz,timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.obtener_costo_ti_periodo(timestamptz,timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role',
    'public.obtener_costo_ti_periodo(timestamptz,timestamptz)', 'EXECUTE'),
  'Costo TI: solo el servidor ejecuta la RPC'
);

-- 15-16. Las funciones privadas conservan el candado de ejecución. -----------
SELECT ok(
  NOT has_function_privilege('authenticated',
    'privado.metricas_ejecutivas_rango(timestamptz,timestamptz,timestamptz)', 'EXECUTE'),
  'El JWT no ejecuta la métrica ejecutiva privada'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'privado.costo_ti_rango(timestamptz,timestamptz)', 'EXECUTE'),
  'El JWT no ejecuta el costo TI privado'
);

-- 17-18. Un gasto cancelado sigue fuera del costo. ---------------------------
UPDATE public.gastos SET estado_pago = 'cancelado' WHERE folio = 'GTO-991101';
SELECT is(
  (SELECT r.costo_gastos_directos_mxn
     FROM public.obtener_rentabilidad_orden('00000000-0000-4000-8000-0000000f1130') AS r),
  0::numeric,
  'Un gasto cancelado no suma al costo de la Orden'
);

SELECT is(
  ((public.obtener_metricas_dashboard_ejecutivo(
      '2001-01-01T00:00:00Z', '2001-02-01T00:00:00Z'
    ) -> 'actual' -> 'finanzas' ->> 'costosReconocidosMxn')::numeric),
  0::numeric,
  'Un gasto cancelado tampoco suma al costo del Dashboard'
);

SELECT * FROM finish();
ROLLBACK;
