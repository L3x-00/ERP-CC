-- A13-A14: la firma de compatibilidad también aplica el gate de crédito y
-- ninguna firma expone aprobación directa a clientes de la Data API.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(9);

SELECT ok(to_regprocedure('public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz)') IS NOT NULL,
  'Existe la firma compatible de tres argumentos');
SELECT ok(to_regprocedure('public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz,boolean,uuid)') IS NOT NULL,
  'Existe la firma nueva con autorización de actor');
SELECT ok(has_function_privilege('service_role',
  'public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz,boolean,uuid)', 'EXECUTE'),
  'Solo el servidor puede usar la firma nueva');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz,boolean,uuid)', 'EXECUTE'),
  'Authenticated no puede invocar la firma nueva');
SELECT ok(NOT has_function_privilege('anon',
  'public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz,boolean,uuid)', 'EXECUTE'),
  'Anon no puede invocar la firma nueva');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.aprobar_oportunidad_y_crear_orden(uuid,uuid,timestamptz)', 'EXECUTE'),
  'Authenticated tampoco puede invocar la firma compatible');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a1301', 'a13@prueba.local', '{}'::jsonb);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, limite_credito)
VALUES
  ('00000000-0000-4000-8000-0000000a1302', 'Cliente A13', 'Cliente A13', 'activo', 100),
  ('00000000-0000-4000-8000-0000000a1303', 'Cliente A14', 'Cliente A14', 'activo', 0);
INSERT INTO public.pipeline (id, folio_op, etapa, nombre_contacto, empresa, cliente_id,
  vendedor_id, moneda, iva_porcentaje)
VALUES
  ('00000000-0000-4000-8000-0000000a1310', 'OP-A13-01', 'negociacion', 'Contacto', 'Cliente A13',
   '00000000-0000-4000-8000-0000000a1302', '00000000-0000-4000-8000-0000000a1301', 'MXN', 0),
  ('00000000-0000-4000-8000-0000000a1311', 'OP-A13-02', 'negociacion', 'Contacto', 'Cliente A13',
   '00000000-0000-4000-8000-0000000a1302', '00000000-0000-4000-8000-0000000a1301', 'MXN', 0);
INSERT INTO public.cotizacion_lineas (pipeline_id, descripcion, cantidad, precio_unitario, orden)
VALUES
  ('00000000-0000-4000-8000-0000000a1310', 'Pieza A', 1, 80, 0),
  ('00000000-0000-4000-8000-0000000a1311', 'Pieza B', 1, 80, 0);

SELECT public.aprobar_oportunidad_y_crear_orden(
  '00000000-0000-4000-8000-0000000a1310'::uuid,
  '00000000-0000-4000-8000-0000000a1302'::uuid,
  now() + interval '20 days'
);

SELECT throws_ok($$
  SELECT public.aprobar_oportunidad_y_crear_orden(
    '00000000-0000-4000-8000-0000000a1311'::uuid,
    '00000000-0000-4000-8000-0000000a1302'::uuid,
    now() + interval '20 days'
  )
$$, '23514', 'credito_limite_excedido',
  'La firma antigua no permite superar el crédito con otra oportunidad');

SELECT is(
  (SELECT sum(saldo_pendiente) FROM public.cuentas_por_cobrar
   WHERE cliente_id = '00000000-0000-4000-8000-0000000a1302'),
  80::numeric,
  'El saldo queda en 80 después del rechazo');

SELECT throws_ok($$
  SELECT public.aprobar_oportunidad_y_crear_orden(
    '00000000-0000-4000-8000-0000000a1311'::uuid,
    '00000000-0000-4000-8000-0000000a1303'::uuid,
    now() + interval '20 days'
  )
$$, '23514', 'cliente_no_corresponde_oportunidad',
  'La firma antigua tampoco sustituye al cliente seleccionado');

SELECT * FROM finish();
ROLLBACK;
