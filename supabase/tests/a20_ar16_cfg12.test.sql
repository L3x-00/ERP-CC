BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-000000100001', 'ar16-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000100002', 'ar16-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-000000100001';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-000000100002';
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-000000100010', 'Cliente AR-16', 'Cliente AR-16 SA', 'activo');

-- AR-16: cuenta con un pago activo que luego se revierte.
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-000000100020', 'OP-993300',
  '00000000-0000-4000-8000-000000100010', 'en_proceso', now() + interval '5 days');
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, monto_subtotal, monto_iva, saldo_pendiente,
  moneda, tipo_cambio_origen, estado
) VALUES (
  '00000000-0000-4000-8000-000000100030', '00000000-0000-4000-8000-000000100020',
  '00000000-0000-4000-8000-000000100010', 1160, 1000, 160, 1160, 'MXN', 1, 'pendiente'
);
SELECT public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-000000100030', 200, 'MXN', 1, 'transferencia', 'REF-16',
  '00000000-0000-4000-8000-000000100001', '00000000-0000-4000-8000-000000100090', 'abono'
);

SELECT ok(NOT has_function_privilege('authenticated',
  'public.anular_cuenta_por_cobrar(uuid,timestamptz,text,uuid)', 'EXECUTE'),
  'Un JWT no anula cuentas');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.previsualizar_consolidacion_ar_faltantes()', 'EXECUTE'),
  'Un JWT no consulta la vista previa de consolidación');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.consolidar_ar_faltantes(uuid[],uuid)', 'EXECUTE'),
  'Un JWT no consolida cuentas');
SELECT ok(has_function_privilege('service_role',
  'public.anular_cuenta_por_cobrar(uuid,timestamptz,text,uuid)', 'EXECUTE'),
  'El servidor ejecuta la anulación');

SELECT throws_ok(format('SELECT * FROM public.anular_cuenta_por_cobrar(%L,%L,%L,%L)',
  '00000000-0000-4000-8000-000000100030',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-000000100030'),
  'prueba', '00000000-0000-4000-8000-000000100001'),
  '23514', 'cuenta_con_cobros_vigentes', 'Un cobro vigente bloquea la anulación');

SELECT lives_ok(format('SELECT * FROM public.reversar_pago_ar(%L,%L,%L)',
  (SELECT id FROM public.pagos_ar WHERE referencia_bancaria = 'REF-16'),
  'cobro mal capturado', '00000000-0000-4000-8000-000000100001'),
  'El cobro se revierte antes de anular');

SELECT lives_ok(format('SELECT * FROM public.anular_cuenta_por_cobrar(%L,%L,%L,%L)',
  '00000000-0000-4000-8000-000000100030',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-000000100030'),
  'duplicado administrativo', '00000000-0000-4000-8000-000000100001'),
  'Una cuenta sin cobros vigentes se anula con motivo');
SELECT is((SELECT estado || '|' || saldo_pendiente || '|' || (motivo_anulacion IS NOT NULL)
  || '|' || (anulada_en IS NOT NULL) || '|' || (anulada_por IS NOT NULL)
  FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-000000100030'),
  'cancelado|0.0000|true|true|true', 'La anulación queda trazada con motivo, fecha y actor');
SELECT is((SELECT count(*)::integer FROM public.pagos_ar
  WHERE ar_id = '00000000-0000-4000-8000-000000100030'), 1,
  'El pago original permanece como evidencia');
SELECT is((SELECT count(*)::integer FROM public.reversos_pago_ar
  WHERE ar_id = '00000000-0000-4000-8000-000000100030'), 1,
  'El reverso previo permanece como evidencia');
SELECT throws_ok(format('SELECT * FROM public.anular_cuenta_por_cobrar(%L,%L,%L,%L)',
  '00000000-0000-4000-8000-000000100030',
  (SELECT actualizado_en FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-000000100030'),
  'segundo intento', '00000000-0000-4000-8000-000000100001'),
  '23514', 'cuenta_ya_anulada', 'Una cuenta anulada no se anula dos veces');

-- CFG-12: orden comercial con líneas RFQ y orden TI sin cotización.
INSERT INTO public.pipeline (id, folio_op, etapa, nombre_contacto, empresa, vendedor_id, moneda, iva_porcentaje)
VALUES ('00000000-0000-4000-8000-000000100040', 'RFQ-993301', 'negociacion', 'Contacto',
  'Empresa CFG', '00000000-0000-4000-8000-000000100001', 'MXN', 16);
INSERT INTO public.cotizacion_lineas (
  id, pipeline_id, descripcion, cantidad, procesos, precio_unitario, orden, es_externo, es_descuento
) VALUES (
  '00000000-0000-4000-8000-000000100041', '00000000-0000-4000-8000-000000100040',
  'Pieza consolidable', 10, '{}'::text[], 100, 1, false, false
);
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, cotizacion_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-000000100050', 'OP-993302',
   '00000000-0000-4000-8000-000000100010', '00000000-0000-4000-8000-000000100040',
   'programada', now() + interval '5 days'),
  ('00000000-0000-4000-8000-000000100060', 'OP-993303',
   '00000000-0000-4000-8000-000000100010', NULL, 'programada', now() + interval '5 days');
UPDATE public.ordenes_produccion SET es_interna = true WHERE id = '00000000-0000-4000-8000-000000100060';

SELECT is((SELECT monto_total || '|' || elegible FROM public.previsualizar_consolidacion_ar_faltantes()
  WHERE folio = 'OP-993302'), '1160.00|true',
  'La vista previa sugiere el total comercial de la orden elegible');
SELECT ok((SELECT NOT elegible FROM public.previsualizar_consolidacion_ar_faltantes()
  WHERE folio = 'OP-993303'),
  'El trabajo interno queda fuera de la consolidación');

SELECT is((SELECT creada FROM public.consolidar_ar_faltantes(
  ARRAY['00000000-0000-4000-8000-000000100050','00000000-0000-4000-8000-000000100060']::uuid[],
  '00000000-0000-4000-8000-000000100001') WHERE orden_id = '00000000-0000-4000-8000-000000100050'),
  true, 'La orden elegible recibe su AR borrador');
SELECT is((SELECT creada FROM public.consolidar_ar_faltantes(
  ARRAY['00000000-0000-4000-8000-000000100050']::uuid[],
  '00000000-0000-4000-8000-000000100001')),
  false, 'Repetir la consolidación no duplica la cuenta');
SELECT is((SELECT count(*)::integer FROM public.cuentas_por_cobrar
  WHERE orden_id = '00000000-0000-4000-8000-000000100050'), 1,
  'Existe una sola cuenta para la orden consolidada');
SELECT is((SELECT monto_subtotal || '|' || monto_iva || '|' || monto_total || '|' || (cobrable_desde IS NULL)
  FROM public.cuentas_por_cobrar WHERE orden_id = '00000000-0000-4000-8000-000000100050'),
  '1000.0000|160.0000|1160.0000|true',
  'La AR consolidada conserva desglose y queda no cobrable');

SELECT * FROM finish();
ROLLBACK;
