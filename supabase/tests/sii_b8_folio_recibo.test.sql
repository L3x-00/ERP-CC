-- SII-B8 F1 — Folio de recibo RP-O-MMYY_XX-YY (espejo del NE) y respaldo REC.
-- Verifica: derivación por orden con folio_sii, consecutivo por orden, fallback
-- REC en órdenes históricas/sin orden, formato CHECK, unicidad e idempotencia.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(12);

-- -----------------------------------------------------------------------------
-- Fixture: actor admin, cliente con monedero y órdenes/AR comercial, histórica y sin orden.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-00000000b801', 'sii-b8-pagos@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B8'
WHERE id = '00000000-0000-4000-8000-00000000b801';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, saldo_a_favor)
VALUES ('00000000-0000-4000-8000-00000000b802', 'Cliente B8', 'Cliente B8 SA de CV', 'activo', 10);

INSERT INTO public.ordenes_produccion (id, folio, folio_sii, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-00000000b803', 'OP-993801', 'O-9999_96',
   '00000000-0000-4000-8000-00000000b802', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b804', 'OP-993802', 'OI-9999_97',
   '00000000-0000-4000-8000-00000000b802', 'completada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b805', 'OP-993803', NULL,
   '00000000-0000-4000-8000-00000000b802', 'completada', now() + interval '30 days');

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado, cobrable_desde, fecha_vencimiento)
VALUES
  ('00000000-0000-4000-8000-00000000b806', '00000000-0000-4000-8000-00000000b803',
   '00000000-0000-4000-8000-00000000b802', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b807', '00000000-0000-4000-8000-00000000b805',
   '00000000-0000-4000-8000-00000000b802', 100, 100, 'MXN', 'pendiente', now(), now() + interval '30 days');

-- 1-2. Derivación directa: espejo del NE y fallback NULL.
SELECT is(privado.siguiente_folio_recibo('00000000-0000-4000-8000-00000000b804'),
  'RP-OI-9999_97-01', 'OI- deriva RP con el prefijo del folio de la orden');
SELECT is(privado.siguiente_folio_recibo('00000000-0000-4000-8000-00000000b805'), NULL,
  'Orden histórica sin folio_sii no deriva RP (usa REC)');

-- 3-5. Pagos nuevos: consecutivo por orden, sin reutilizar.
SELECT is((SELECT folio_recibo FROM public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-00000000b806', 10, 'MXN', 1, 'transferencia', NULL,
  '00000000-0000-4000-8000-00000000b801', gen_random_uuid())),
  'RP-O-9999_96-01', 'Primer recibo de la orden usa RP-...-01');
SELECT is((SELECT folio_recibo FROM public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-00000000b806', 10, 'MXN', 1, 'efectivo', NULL,
  '00000000-0000-4000-8000-00000000b801', gen_random_uuid())),
  'RP-O-9999_96-02', 'Segundo recibo de la misma orden usa RP-...-02');
SELECT is((SELECT count(DISTINCT folio_recibo) FROM public.pagos_ar
  WHERE ar_id = '00000000-0000-4000-8000-00000000b806'), 2::bigint,
  'Ningún folio RP se reutiliza');

-- 6. Monedero: la aplicación de saldo también recibe RP.
SELECT is((SELECT folio_recibo FROM public.aplicar_saldo_favor_ar(
  '00000000-0000-4000-8000-00000000b802', '00000000-0000-4000-8000-00000000b806', 10,
  '00000000-0000-4000-8000-00000000b801', gen_random_uuid())),
  'RP-O-9999_96-03', 'La aplicación de monedero continúa el consecutivo de la orden');

-- 7-8. Órdenes históricas conservan REC-######; sin orden no hay RP.
SELECT ok((SELECT folio_recibo FROM public.registrar_pago_ar_atomico(
  '00000000-0000-4000-8000-00000000b807', 10, 'MXN', 1, 'transferencia', NULL,
  '00000000-0000-4000-8000-00000000b801', gen_random_uuid())) ~ '^REC-[0-9]{6}$',
  'Orden histórica sin folio_sii conserva REC-######');
SELECT is(privado.siguiente_folio_recibo(NULL), NULL,
  'Sin orden no se deriva RP (el pago cae a REC)');

-- 9. Idempotencia intacta: reintento devuelve el mismo folio sin duplicar.
INSERT INTO public.pagos_ar (
  ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
  monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, creado_por
) VALUES (
  '00000000-0000-4000-8000-00000000b806', 'RP-O-9999_96-04', '00000000-0000-4000-8000-00000000b809',
  10, 'MXN', 1, 10, 0, 'transferencia', '00000000-0000-4000-8000-00000000b801'
);
SELECT is(
  (SELECT folio_recibo FROM public.registrar_pago_ar_atomico(
    '00000000-0000-4000-8000-00000000b806', 10, 'MXN', 1, 'transferencia', NULL,
    '00000000-0000-4000-8000-00000000b801', '00000000-0000-4000-8000-00000000b809')),
  'RP-O-9999_96-04', 'Reintento con la misma solicitud conserva folio (idempotente)');

-- 10. Tope del formato: el 100 pierde el relleno y no colisiona con 10.
SELECT ok(privado.siguiente_folio_recibo('00000000-0000-4000-8000-00000000b803') ~ '^RP-O-9999_96-[0-9]{2,}$',
  'El consecutivo admite 2+ dígitos');

-- 11-12. CHECK del formato y unicidad.
SELECT throws_ok($$UPDATE public.pagos_ar SET folio_recibo = 'XX-123'
  WHERE folio_recibo = 'RP-O-9999_96-01'$$,
  '23514',
  'new row for relation "pagos_ar" violates check constraint "pagos_ar_folio_recibo_check"',
  'El CHECK rechaza folios fuera de REC/RP');
SELECT throws_ok($$INSERT INTO public.pagos_ar (
    ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
    monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, creado_por
  ) VALUES (
    '00000000-0000-4000-8000-00000000b807', 'RP-O-9999_96-01', gen_random_uuid(),
    1, 'MXN', 1, 1, 0, 'transferencia', '00000000-0000-4000-8000-00000000b801'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "pagos_ar_folio_recibo_key"',
  'El índice único rechaza folios duplicados');

SELECT * FROM finish();
ROLLBACK;
