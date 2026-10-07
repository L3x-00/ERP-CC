-- A16/AR-04 + decisión D4-B: la entrega real activa AR con el plazo del cliente.
-- `credito` usa los días configurados en `clientes.dias_credito`; si no están,
-- la operación falla y exige completar la condición.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000a1651', 'a16@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a1651';

WITH casos (n, condicion, credito, dias) AS (VALUES
  (1, 'contado'::text, false, NULL::integer),
  (2, '15_dias', false, NULL),
  (3, '30_dias', false, NULL),
  (4, 'credito', true, 60),
  (5, NULL, false, NULL),
  (6, 'credito', true, 60),
  (7, 'credito', false, NULL),
  (8, 'credito', false, NULL)
)
INSERT INTO public.clientes
  (id, nombre_comercial, razon_social, estado, condiciones_pago, credito_habilitado, dias_credito)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad(n::text, 2, '0'))::uuid,
  'Cliente A16 ' || n, 'Cliente A16 ' || n, 'activo', condicion, credito, dias
FROM casos;

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad((n + 10)::text, 2, '0'))::uuid,
  'OP-99' || lpad(n::text, 4, '0'),
  ('00000000-0000-4000-8000-0000000a16' || lpad(n::text, 2, '0'))::uuid,
  'completada', now() + interval '10 days'
FROM generate_series(1, 8) AS n;

INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, cantidad_solicitada, cantidad_producida, unidad_medida)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad((n + 20)::text, 2, '0'))::uuid,
  ('00000000-0000-4000-8000-0000000a16' || lpad((n + 10)::text, 2, '0'))::uuid,
  'A16-PIEZA-' || n, CASE WHEN n IN (7, 8) THEN 2 ELSE 1 END,
  CASE WHEN n IN (7, 8) THEN 2 ELSE 1 END, 'pieza'
FROM generate_series(1, 8) AS n;

INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
   tipo_cambio_origen, estado, cobrable_desde, fecha_vencimiento)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad((n + 30)::text, 2, '0'))::uuid,
  ('00000000-0000-4000-8000-0000000a16' || lpad((n + 10)::text, 2, '0'))::uuid,
  ('00000000-0000-4000-8000-0000000a16' || lpad(n::text, 2, '0'))::uuid,
  100, 100, 'MXN', 1, 'pendiente',
  CASE WHEN n = 6 THEN '2026-01-01 00:00:00+00'::timestamptz ELSE NULL END,
  CASE WHEN n = 6 THEN '2026-02-15 00:00:00+00'::timestamptz ELSE NULL END
FROM generate_series(1, 8) AS n;

INSERT INTO public.notas_entrega
  (id, folio, orden_id, es_parcial, recibido_por, creado_por)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad((n + 40)::text, 2, '0'))::uuid,
  'NE-99' || lpad(n::text, 4, '0'),
  ('00000000-0000-4000-8000-0000000a16' || lpad((n + 10)::text, 2, '0'))::uuid,
  n IN (7, 8), 'Receptor A16', '00000000-0000-4000-8000-0000000a1651'::uuid
FROM generate_series(1, 8) AS n;

-- Inserción real de renglones: el trigger de entrega activa las AR completas.
INSERT INTO public.partidas_nota_entrega
  (nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada)
SELECT ('00000000-0000-4000-8000-0000000a16' || lpad((n + 40)::text, 2, '0'))::uuid,
  ('00000000-0000-4000-8000-0000000a16' || lpad((n + 20)::text, 2, '0'))::uuid,
  CASE WHEN n IN (7, 8) THEN 2 ELSE 1 END, 1
FROM generate_series(1, 7) AS n;

SELECT is((SELECT fecha_vencimiento - cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1631'), interval '0 days',
  'Contado vence al activarse');
SELECT is((SELECT fecha_vencimiento - cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1632'), interval '15 days',
  'Quince días conserva su plazo');
SELECT is((SELECT fecha_vencimiento - cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1633'), interval '30 days',
  'Treinta días conserva su plazo');
SELECT is((SELECT fecha_vencimiento - cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1634'), interval '60 days',
  'Crédito usa los días configurados del cliente (60)');
SELECT is((SELECT fecha_vencimiento - cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1635'), interval '30 days',
  'Sin condición conserva fallback de 30 días');
SELECT is((SELECT cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1636'),
  '2026-01-01 00:00:00+00'::timestamptz,
  'Cuenta cobrable histórica conserva inicio');
SELECT is((SELECT fecha_vencimiento FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1636'),
  '2026-02-15 00:00:00+00'::timestamptz,
  'Cuenta cobrable histórica conserva vencimiento');
SELECT is((SELECT cobrable_desde FROM public.cuentas_por_cobrar
  WHERE id = '00000000-0000-4000-8000-0000000a1637'),
  NULL::timestamptz, 'Entrega parcial no activa la AR');
SELECT is((SELECT archivada_en FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000a1617'),
  NULL::timestamptz, 'Entrega parcial no archiva la orden');

-- D4-B: entrega total con crédito sin días configurados se rechaza.
SELECT throws_ok($$
  INSERT INTO public.partidas_nota_entrega
    (nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada)
  VALUES ('00000000-0000-4000-8000-0000000a1648',
    '00000000-0000-4000-8000-0000000a1628', 2, 2)
$$, '23514', 'cliente_credito_sin_dias',
  'Crédito sin días configurados no activa la AR');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.archivar_orden_al_entregar()', 'EXECUTE'),
  'La función privilegiada no se expone a authenticated');
SELECT ok(has_function_privilege('service_role',
  'public.archivar_orden_al_entregar()', 'EXECUTE'),
  'La función privilegiada sigue utilizable por service_role');

SELECT * FROM finish();
ROLLBACK;
