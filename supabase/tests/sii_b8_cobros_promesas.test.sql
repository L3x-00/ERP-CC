-- SII-B8 F3 — Aplicaciones many-to-many, reverso por aplicaciones y promesas
-- de pago con recordatorios. Verifica folio RP-MMYY_0000-YY, excedente al
-- monedero, idempotencia, validaciones, promesa CUMPLIDA automática y avisos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000b811', 'sii-b8-f3-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000b812', 'sii-b8-f3-vend@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B8 F3'
WHERE id = '00000000-0000-4000-8000-00000000b811';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B8 F3'
WHERE id = '00000000-0000-4000-8000-00000000b812';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, condiciones_pago) VALUES
  ('00000000-0000-4000-8000-00000000b815', 'Cliente F3', 'Cliente F3 SA de CV', 'activo', 'contado'),
  ('00000000-0000-4000-8000-00000000b816', 'Otro F3', 'Otro F3 SA de CV', 'activo', 'contado');

INSERT INTO public.ordenes_produccion (id, folio, folio_sii, cliente_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000b821', 'OP-995811', 'O-9999_81', '00000000-0000-4000-8000-00000000b815', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b822', 'OP-995812', 'O-9999_82', '00000000-0000-4000-8000-00000000b815', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b823', 'OP-995813', 'O-9999_83', '00000000-0000-4000-8000-00000000b815', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b824', 'OP-995814', 'O-9999_84', '00000000-0000-4000-8000-00000000b815', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b825', 'OP-995815', 'O-9999_85', '00000000-0000-4000-8000-00000000b816', 'completada', now() + interval '30 days');

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado, cobrable_desde, fecha_vencimiento)
VALUES
  ('00000000-0000-4000-8000-00000000b831', '00000000-0000-4000-8000-00000000b821', '00000000-0000-4000-8000-00000000b815', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b832', '00000000-0000-4000-8000-00000000b822', '00000000-0000-4000-8000-00000000b815', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b833', '00000000-0000-4000-8000-00000000b823', '00000000-0000-4000-8000-00000000b815', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b834', '00000000-0000-4000-8000-00000000b824', '00000000-0000-4000-8000-00000000b815', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b835', '00000000-0000-4000-8000-00000000b825', '00000000-0000-4000-8000-00000000b816', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days');

CREATE TEMP TABLE f3 (clave text PRIMARY KEY, valor jsonb);
CREATE TEMP TABLE f3_ids AS SELECT gen_random_uuid() AS sol_a, gen_random_uuid() AS sol_b, gen_random_uuid() AS sol_legacy;

SELECT plan(27);

-- 1-5. Cobro repartido A: 120 pagados = 60+40 aplicados + 20 al monedero.
INSERT INTO f3 (clave, valor)
SELECT 'pago_a', to_jsonb(pago.*) FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 120, 'MXN', 1, 'transferencia', 'F3-A', NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b831', 'monto', 60),
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b832', 'monto', 40)
  ),
  '00000000-0000-4000-8000-00000000b811', (SELECT sol_a FROM f3_ids)) AS pago;
SELECT ok((SELECT (valor ->> 'folio_recibo') ~ '^RP-[0-9]{4}_0000-01$' FROM f3 WHERE clave = 'pago_a'),
  'El recibo repartido usa RP-MMYY_0000-01');
SELECT is((SELECT (valor ->> 'aplicaciones')::integer FROM f3 WHERE clave = 'pago_a'), 2,
  'El recibo aplica a dos facturas');
SELECT ok((SELECT pagos.ar_id IS NULL FROM public.pagos_ar AS pagos
  WHERE pagos.id = (SELECT (f3.valor ->> 'pago_id')::uuid FROM f3 WHERE f3.clave = 'pago_a')),
  'El pago repartido no tiene AR única');
SELECT is((SELECT round(saldo_pendiente, 2) FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b831'), 40::numeric,
  'La primera AR queda parcial (40)');
SELECT is((SELECT round(saldo_pendiente, 2) FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b832'), 60::numeric,
  'La segunda AR queda parcial (60)');
SELECT is((SELECT (valor ->> 'saldo_a_favor_mxn')::numeric FROM f3 WHERE clave = 'pago_a'), 20::numeric,
  'El excedente se acreditó al monedero (20)');

-- 6-9. Cobro repartido B: 250 pagados = 40+60 aplicados + 150 al monedero.
INSERT INTO f3 (clave, valor)
SELECT 'pago_b', to_jsonb(pago.*) FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 250, 'MXN', 1, 'transferencia', 'F3-B', NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b831', 'monto', 40),
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b832', 'monto', 60)
  ),
  '00000000-0000-4000-8000-00000000b811', (SELECT sol_b FROM f3_ids)) AS pago;
SELECT ok((SELECT (valor ->> 'folio_recibo') ~ '^RP-[0-9]{4}_0000-02$' FROM f3 WHERE clave = 'pago_b'),
  'El consecutivo global del periodo avanza (-02)');
SELECT is((SELECT round(saldo_pendiente, 2) FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b831'), 0::numeric,
  'La primera AR queda pagada');
SELECT is((SELECT count(*) FROM public.aplicaciones_pago
  WHERE pago_id = (SELECT (f3.valor ->> 'pago_id')::uuid FROM f3 WHERE f3.clave = 'pago_b')), 2::bigint,
  'Las dos aplicaciones del recibo quedan registradas');
SELECT is((SELECT (valor ->> 'saldo_a_favor_mxn')::numeric FROM f3 WHERE clave = 'pago_b'), 170::numeric,
  'El monedero acumula 170 tras el segundo cobro');

-- 10. Idempotencia por solicitud.
SELECT ok((SELECT (valor ->> 'idempotente')::boolean FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 250, 'MXN', 1, 'transferencia', 'F3-B', NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b831', 'monto', 40),
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b832', 'monto', 60)
  ),
  '00000000-0000-4000-8000-00000000b811', (SELECT sol_b FROM f3_ids)) AS pago
  CROSS JOIN LATERAL (SELECT to_jsonb(pago.*) AS valor) AS x LIMIT 1),
  'Reintentar la misma solicitud no duplica el recibo');

-- 11-14. Validaciones.
SELECT throws_ok($$SELECT * FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 100, 'MXN', 1, 'transferencia', NULL, NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b833', 'monto', 30),
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b833', 'monto', 30)
  ), '00000000-0000-4000-8000-00000000b811', gen_random_uuid())$$,
  '23514', 'aplicacion_duplicada', 'No se repite una cuenta en el mismo recibo');
SELECT throws_ok($$SELECT * FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 100, 'MXN', 1, 'transferencia', NULL, NULL, NULL,
  jsonb_build_array(jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b833', 'monto', 150)),
  '00000000-0000-4000-8000-00000000b811', gen_random_uuid())$$,
  '23514', 'monto_excede_saldo', 'Una aplicación no excede el saldo de su AR');
SELECT throws_ok($$SELECT * FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 50, 'MXN', 1, 'transferencia', NULL, NULL, NULL,
  jsonb_build_array(
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b833', 'monto', 30),
    jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b834', 'monto', 30)
  ), '00000000-0000-4000-8000-00000000b811', gen_random_uuid())$$,
  '23514', 'aplicaciones_exceden_pago', 'Lo aplicado no puede exceder lo pagado');
SELECT throws_ok($$SELECT * FROM public.registrar_cobro_multiple(
  '00000000-0000-4000-8000-00000000b815', 100, 'MXN', 1, 'transferencia', NULL, NULL, NULL,
  jsonb_build_array(jsonb_build_object('cuenta_id', '00000000-0000-4000-8000-00000000b835', 'monto', 50)),
  '00000000-0000-4000-8000-00000000b811', gen_random_uuid())$$,
  '23514', 'cuenta_no_corresponde_cliente', 'Solo se aplican AR del cliente del recibo');

-- 15-17. Reverso del recibo repartido.
UPDATE f3 SET valor = valor || to_jsonb(reverso.*)
FROM public.reversar_pago_ar(
  (SELECT (valor ->> 'pago_id')::uuid FROM f3 WHERE clave = 'pago_b'),
  'Cancelación del pago repartido', '00000000-0000-4000-8000-00000000b811') AS reverso
WHERE f3.clave = 'pago_b';
SELECT is((SELECT (valor ->> 'monedero_revertido_mxn')::numeric FROM f3 WHERE clave = 'pago_b'), 150::numeric,
  'El reverso devuelve el crédito exacto (150)');
SELECT is((SELECT round(saldo_pendiente, 2) FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-00000000b831'), 40::numeric,
  'La primera AR recupera su saldo tras el reverso');
SELECT throws_ok($$SELECT * FROM public.reversar_pago_ar(
  (SELECT (valor ->> 'pago_id')::uuid FROM f3 WHERE clave = 'pago_b'),
  'Segundo intento', '00000000-0000-4000-8000-00000000b811')$$,
  '23505', 'pago_ya_reversado', 'Un recibo no se reversa dos veces');

-- 18-20. Pago 1-AR: folio espejo, aplicación y promesa previa.
INSERT INTO f3 (clave, valor)
SELECT 'prom_c', to_jsonb(promesa.*) FROM public.crear_promesa_pago(
  '00000000-0000-4000-8000-00000000b834', current_date + 1, 100,
  '00000000-0000-4000-8000-00000000b811') AS promesa;
SELECT is((SELECT valor ->> 'estado' FROM f3 WHERE clave = 'prom_c'), 'VIGENTE',
  'La promesa nace VIGENTE');
SELECT throws_ok($$SELECT * FROM public.crear_promesa_pago(
  '00000000-0000-4000-8000-00000000b834', current_date + 2, 100,
  '00000000-0000-4000-8000-00000000b811')$$,
  '23514', 'promesa_ya_existe', 'Una AR no tiene dos promesas activas');
INSERT INTO f3 (clave, valor)
SELECT 'pago_c', to_jsonb(pago.*) FROM public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-00000000b833', 100, 'MXN', 1, 'efectivo', NULL,
  '00000000-0000-4000-8000-00000000b811', gen_random_uuid()) AS pago;
SELECT is((SELECT valor ->> 'folio_recibo' FROM f3 WHERE clave = 'pago_c'), 'RP-9999_83-01',
  'El pago de una orden SII conserva el folio RP espejo del NE');
SELECT is((SELECT count(*) FROM public.aplicaciones_pago
  WHERE pago_id = (SELECT (valor ->> 'pago_id')::uuid FROM f3 WHERE clave = 'pago_c')), 1::bigint,
  'El flujo 1-AR también registra su aplicación');

-- 21-22. Cumplida automática al pagarse la AR prometida.
INSERT INTO f3 (clave, valor)
SELECT 'pago_d', to_jsonb(pago.*) FROM public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-00000000b834', 100, 'MXN', 1, 'efectivo', NULL,
  '00000000-0000-4000-8000-00000000b811', gen_random_uuid()) AS pago;
SELECT is((SELECT estado FROM public.promesas_pago
  WHERE id = (SELECT (valor ->> 'id')::uuid FROM f3 WHERE clave = 'prom_c')), 'CUMPLIDA',
  'La promesa pasa a CUMPLIDA al pagarse la AR');

-- 23-25. Recordatorio previo idempotente (2 días antes) para la promesa de b831.
INSERT INTO f3 (clave, valor)
SELECT 'prom_e', to_jsonb(promesa.*) FROM public.crear_promesa_pago(
  '00000000-0000-4000-8000-00000000b831', current_date + 1, 40,
  '00000000-0000-4000-8000-00000000b811') AS promesa;
SELECT * FROM public.procesar_recordatorios_promesas('00000000-0000-4000-8000-00000000b811');
SELECT is((SELECT count(*) FROM public.notificaciones_usuario
  WHERE usuario_id = '00000000-0000-4000-8000-00000000b811'
    AND tipo = 'alerta_sistema'
    AND mensaje LIKE '%00000000-0000-4000-8000-00000000b831%'), 1::bigint,
  'Se genera un recordatorio interno 2 días antes');
SELECT * FROM public.procesar_recordatorios_promesas('00000000-0000-4000-8000-00000000b811');
SELECT is((SELECT count(*) FROM public.notificaciones_usuario
  WHERE usuario_id = '00000000-0000-4000-8000-00000000b811'
    AND tipo = 'alerta_sistema'
    AND mensaje LIKE '%00000000-0000-4000-8000-00000000b831%'), 1::bigint,
  'Reprocesar no duplica el recordatorio');

-- 26. Promesa vencida notificada una sola vez.
INSERT INTO public.promesas_pago (cuenta_id, fecha_prometida, monto, estado, creado_por)
VALUES ('00000000-0000-4000-8000-00000000b832', current_date - 1, 60, 'VIGENTE', '00000000-0000-4000-8000-00000000b811');
SELECT * FROM public.procesar_recordatorios_promesas('00000000-0000-4000-8000-00000000b811');
SELECT is(
  (SELECT count(*) FROM public.promesas_pago
   WHERE cuenta_id = '00000000-0000-4000-8000-00000000b832'
     AND estado = 'VENCIDA' AND recordatorio_vencida_en IS NOT NULL),
  1::bigint, 'La promesa vencida se marca y notifica una sola vez');

-- 27. Privilegios: authenticated no ejecuta los motores nuevos.
SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_cobro_multiple(uuid,numeric,text,numeric,text,text,uuid,text,jsonb,uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
  'public.procesar_recordatorios_promesas(uuid)', 'EXECUTE'),
  'authenticated no ejecuta cobro múltiple ni recordatorios');

SELECT * FROM finish();
ROLLBACK;
