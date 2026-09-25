BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000f0001', 'ar08-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000f0001';
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('00000000-0000-4000-8000-0000000f0010', 'Cliente AR-08', 'Cliente AR-08 SA', 'activo', 'contado');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000f0020', 'OP-993200',
  '00000000-0000-4000-8000-0000000f0010', 'en_proceso', now() + interval '5 days');
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, tipo_cambio_origen,
  estado, monto_subtotal, monto_iva
) VALUES (
  '00000000-0000-4000-8000-0000000f0030', '00000000-0000-4000-8000-0000000f0020',
  '00000000-0000-4000-8000-0000000f0010', 1160, 1160, 'MXN', 1,
  'pendiente', 1000, 160
);

SELECT ok(has_table_privilege('authenticated', 'public.reversos_pago_ar', 'SELECT'),
  'El personal autorizado puede leer los reversos bajo RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.reversos_pago_ar', 'INSERT'),
  'Un JWT no inserta reversos directamente');
SELECT ok(NOT has_function_privilege('authenticated', 'public.reversar_pago_ar(uuid,text,uuid)', 'EXECUTE'),
  'Un JWT no ejecuta el reverso');
SELECT ok(has_function_privilege('service_role', 'public.registrar_abono_heredado_ar(uuid,numeric,text,uuid)', 'EXECUTE'),
  'El servidor ejecuta el anticipo heredado');

SELECT is((SELECT (registro.estado || '|' || registro.saldo_pendiente || '|' || registro.abono_heredado)
  FROM public.registrar_abono_heredado_ar(
    '00000000-0000-4000-8000-0000000f0030', 580, 'anticipo del sistema anterior',
    '00000000-0000-4000-8000-0000000f0001') AS registro),
  'parcial|580.0000|580.0000', 'El anticipo heredado ajusta saldo y estado una sola vez');
SELECT throws_ok($$SELECT * FROM public.registrar_abono_heredado_ar(
  '00000000-0000-4000-8000-0000000f0030', 100, NULL, '00000000-0000-4000-8000-0000000f0001')$$,
  '23505', 'abono_heredado_ya_registrado', 'El anticipo heredado no se registra dos veces');
SELECT throws_ok($$SELECT * FROM public.registrar_abono_heredado_ar(
  '00000000-0000-4000-8000-0000000f0030', 0, NULL, '00000000-0000-4000-8000-0000000f0001')$$,
  '23514', 'abono_heredado_invalido', 'Un anticipo heredado en cero se rechaza');

-- El pago estructurado puede convivir con el anticipo heredado.
SELECT lives_ok(format('SELECT * FROM public.registrar_pago_ar_atomico(%L, %s, %L, %s, %L, %L, %L, %L, %L)',
  '00000000-0000-4000-8000-0000000f0030', 1740, 'MXN', 1, 'transferencia', 'REF-1',
  '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000f0040', 'pago final'),
  'El pago estructurado se registra sobre la cuenta con anticipo heredado');
SELECT is((SELECT estado || '|' || saldo_pendiente FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000f0030'), 'pagado|0.0000',
  'El pago final deja la cuenta pagada');
SELECT is((SELECT saldo_a_favor FROM public.clientes
  WHERE id = '00000000-0000-4000-8000-0000000f0010'), 1160.0000,
  'El sobrepago se acredita al monedero del cliente');

SELECT is((SELECT monedero_revertido_mxn FROM public.reversar_pago_ar(
  (SELECT id FROM public.pagos_ar WHERE referencia_bancaria = 'REF-1'),
  'corrección de importe', '00000000-0000-4000-8000-0000000f0001')),
  1160.0000, 'El reverso devuelve el crédito del monedero');
SELECT is((SELECT estado || '|' || saldo_pendiente FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000f0030'), 'parcial|580.0000',
  'El reverso restituye el saldo que cubría el pago');
SELECT is((SELECT saldo_a_favor FROM public.clientes
  WHERE id = '00000000-0000-4000-8000-0000000f0010'), 0.0000,
  'El monedero queda en cero tras revertir');
SELECT is((SELECT count(*)::integer FROM public.movimientos_saldo_favor
  WHERE cliente_id = '00000000-0000-4000-8000-0000000f0010' AND monto < 0), 1,
  'El reverso se representa como ajuste, sin borrar el crédito original');
SELECT throws_ok(format('SELECT * FROM public.reversar_pago_ar(%L, %L, %L)',
  (SELECT id FROM public.pagos_ar WHERE referencia_bancaria = 'REF-1'),
  'segundo intento', '00000000-0000-4000-8000-0000000f0001'),
  '23505', 'pago_ya_reversado', 'Un pago solo se revierte una vez');
SELECT is((SELECT count(*)::integer FROM public.pagos_ar
  WHERE ar_id = '00000000-0000-4000-8000-0000000f0030'), 1,
  'El pago original permanece intacto tras el reverso');
SELECT is((SELECT abono_heredado FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000f0030'), 580.0000,
  'El anticipo heredado no se altera con el reverso');

SELECT * FROM finish();
ROLLBACK;
