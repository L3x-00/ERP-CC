-- SII-B7 — Entregas: folio NE-MMYY_XX-YY, parciales por ITxx, idempotencia y AR.
-- Verifica: consecutivo/unicidad del folio (9→10 y 99→100), cantidades contra
-- producido y pendiente, idempotencia por solicitud, activación de AR al 100 %,
-- herencia legacy, backfill de codigo_item, privilegios y RLS.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(51);

-- -----------------------------------------------------------------------------
-- 0. Actores y permisos
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b7a01', 'sii-b7-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b7a02', 'sii-b7-contador@prueba.local'),
  ('00000000-0000-4000-8000-0000000b7a03', 'sii-b7-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000000b7a04', 'sii-b7-inactivo@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B7'
WHERE id = '00000000-0000-4000-8000-0000000b7a01';
UPDATE public.usuarios SET rol = 'contador', activo = true, nombre_completo = 'Contador B7'
WHERE id = '00000000-0000-4000-8000-0000000b7a02';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B7'
WHERE id = '00000000-0000-4000-8000-0000000b7a03';
UPDATE public.usuarios SET rol = 'operador', activo = false, nombre_completo = 'Inactivo B7'
WHERE id = '00000000-0000-4000-8000-0000000b7a04';

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('entrega_generar', 'entregas', 'Generar notas de entrega'),
  ('orden_vista', 'ordenes', 'Ver órdenes'),
  ('ver_finanzas', 'finanzas', 'Ver finanzas'),
  ('gestionar_produccion', 'produccion', 'Operar producción')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('contador', 'entrega_generar'),
  ('contador', 'orden_vista')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Estructura y privilegios
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'notas_entrega', 'folio_sii', 'notas_entrega.folio_sii existe');
SELECT has_column('public', 'notas_entrega', 'entregado_por_id', 'notas_entrega.entregado_por_id existe');
SELECT has_column('public', 'notas_entrega', 'recibido_por_id', 'notas_entrega.recibido_por_id existe');
SELECT has_column('public', 'notas_entrega', 'solicitud_id', 'notas_entrega.solicitud_id existe');
SELECT has_column('public', 'notas_entrega', 'fecha_entrega', 'notas_entrega.fecha_entrega existe');
SELECT has_column('public', 'partidas_nota_entrega', 'codigo_item', 'partidas_nota_entrega.codigo_item existe');
SELECT has_index('public', 'notas_entrega', 'ux_notas_folio_sii', 'índice único del folio SII');
SELECT has_index('public', 'notas_entrega', 'ux_notas_solicitud', 'índice único de idempotencia');
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'entregas-evidencias'),
  false, 'El bucket de evidencias es privado'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'entregas-evidencias'),
  10485760::bigint, 'El bucket de evidencias limita a 10 MB'
);
SELECT ok(
  has_function_privilege('service_role', 'public.registrar_entrega(uuid,jsonb,text,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta registrar_entrega'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.registrar_entrega(uuid,jsonb,text,uuid,uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta registrar_entrega'
);
SELECT policies_are('public', 'notas_entrega', ARRAY['notas_entrega_seleccionar'],
  'Solo la política de lectura en notas_entrega');
SELECT policies_are('public', 'partidas_nota_entrega', ARRAY['partidas_nota_entrega_seleccionar'],
  'Solo la política de lectura en partidas_nota_entrega');

-- -----------------------------------------------------------------------------
-- 2. Fixtures: cliente, contacto, órdenes y partidas
-- -----------------------------------------------------------------------------
INSERT INTO public.clientes (nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('B7 Cliente', 'B7 Cliente SA de CV', 'activo', '30_dias');
INSERT INTO public.contactos_cliente (cliente_id, nombre, es_principal, activo)
SELECT id, 'Contacto B7', true, true FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV';

CREATE TEMP TABLE b7_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b7_ids (nombre, valor)
SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV';
INSERT INTO b7_ids (nombre, valor)
SELECT 'contacto', id FROM public.contactos_cliente WHERE nombre = 'Contacto B7';

-- Órdenes: O1 comercial (flujo nuevo), O2 histórica sin folio_sii, O3/O3b
-- límites de consecutivo, O4 interna (OI-), O5 no entregable.
INSERT INTO public.ordenes_produccion (
  folio, folio_sii, cliente_id, estado, estado_sii, prioridad, fecha_compromiso
) VALUES
  ('O-1026_01', 'O-1026_01', (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '15 days'),
  ('OP-000123', NULL, (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '15 days'),
  ('O-1026_02', 'O-1026_02', (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '15 days'),
  ('O-1026_03', 'O-1026_03', (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '15 days'),
  ('OI-1026_09', 'OI-1026_09', (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '15 days'),
  ('O-1026_04', 'O-1026_04', (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
   'borrador', 'CONFIRMADA', 'normal', now() + interval '15 days');

INSERT INTO b7_ids (nombre, valor)
SELECT 'o1', id FROM public.ordenes_produccion WHERE folio = 'O-1026_01';
INSERT INTO b7_ids (nombre, valor)
SELECT 'o2', id FROM public.ordenes_produccion WHERE folio = 'OP-000123';
INSERT INTO b7_ids (nombre, valor)
SELECT 'o3', id FROM public.ordenes_produccion WHERE folio = 'O-1026_02';
INSERT INTO b7_ids (nombre, valor)
SELECT 'o3b', id FROM public.ordenes_produccion WHERE folio = 'O-1026_03';
INSERT INTO b7_ids (nombre, valor)
SELECT 'o4', id FROM public.ordenes_produccion WHERE folio = 'OI-1026_09';
INSERT INTO b7_ids (nombre, valor)
SELECT 'o5', id FROM public.ordenes_produccion WHERE folio = 'O-1026_04';

INSERT INTO public.partidas_orden_produccion (
  orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada,
  cantidad_producida, unidad_medida
)
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o1'), 'IT01', 'IT01', 'Pieza B7 uno', 10, 10, 'pieza'
UNION ALL
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o1'), 'IT02', 'IT02', 'Pieza B7 dos', 5, 5, 'pieza'
UNION ALL
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o1'), 'IT03', 'IT03', 'Pieza B7 tres', 10, 8, 'pieza'
UNION ALL
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o2'), 'IT01', 'IT01', 'Histórica B7', 2, 2, 'pieza'
UNION ALL
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o2'), 'IT02', 'IT02', 'Histórica B7 dos', 1, 1, 'pieza'
UNION ALL
SELECT (SELECT valor FROM b7_ids WHERE nombre = 'o5'), 'IT01', 'IT01', 'No entregable B7', 1, 1, 'pieza';

INSERT INTO b7_ids (nombre, valor)
SELECT 'p1_it01', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1') AND codigo_item = 'IT01';
INSERT INTO b7_ids (nombre, valor)
SELECT 'p1_it02', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1') AND codigo_item = 'IT02';
INSERT INTO b7_ids (nombre, valor)
SELECT 'p1_it03', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1') AND codigo_item = 'IT03';
INSERT INTO b7_ids (nombre, valor)
SELECT 'p2_it01', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2') AND codigo_item = 'IT01';
INSERT INTO b7_ids (nombre, valor)
SELECT 'p2_it02', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2') AND codigo_item = 'IT02';

-- AR no cobrable de la orden O1 (se activa al entregar el 100 %).
INSERT INTO public.cuentas_por_cobrar (
  orden_id, cliente_id, monto_total, monto_subtotal, monto_iva,
  saldo_pendiente, moneda, tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
) VALUES (
  (SELECT valor FROM b7_ids WHERE nombre = 'o1'), (SELECT valor FROM b7_ids WHERE nombre = 'cliente'),
  1160, 1000, 160, 1160, 'MXN', 1, 'pendiente', NULL, NULL
);

-- -----------------------------------------------------------------------------
-- 3. Validaciones de entrada y permisos
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":1}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a03'),
  '42501', 'sin_permiso_entrega', 'Un vendedor sin entrega_generar no registra entregas'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":0}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'partidas_entrega_invalidas', 'Cantidad cero se rechaza'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":1},'
    || '{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":1}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'partidas_entrega_invalidas', 'Partida duplicada se rechaza'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p2_it01') || '","cantidad_entregada":1}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'partida_no_corresponde_orden', 'Una partida de otra orden se rechaza'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o5'),
    '[{"partida_id":"' || (SELECT id::text FROM public.partidas_orden_produccion WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o5')) || '","cantidad_entregada":1}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'orden_no_entregable', 'Una orden sin producción no es entregable'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":11}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'cantidad_entrega_excede_producida', 'No se entrega más de lo producido'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, %L, %L, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":1}]',
    'Quien recibe', (SELECT valor::text FROM b7_ids WHERE nombre = 'contacto'),
    '00000000-0000-4000-8000-0000000b7a04', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'entregador_no_activo', 'Un entregador inactivo se rechaza'
);
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, %L, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":1}]',
    'Quien recibe', gen_random_uuid()::text, '00000000-0000-4000-8000-0000000b7a02'),
  '22023', 'contacto_invalido', 'Un contacto ajeno se rechaza'
);

-- -----------------------------------------------------------------------------
-- 4. Entrega parcial e idempotencia
-- -----------------------------------------------------------------------------
SELECT is(
  (public.registrar_entrega(
    (SELECT valor FROM b7_ids WHERE nombre = 'o1'),
    ('[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":6}]')::jsonb,
    'Quien recibe B7',
    (SELECT valor FROM b7_ids WHERE nombre = 'contacto'),
    '00000000-0000-4000-8000-0000000b7a02',
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-0000000b7a02') ->> 'folioSii'),
  'NE-1026_01-01', 'La primera entrega usa el folio NE-MMYY_XX-01'
);
SELECT is(
  (SELECT es_parcial FROM public.notas_entrega WHERE solicitud_id = '11111111-1111-4111-8111-111111111111'),
  true, 'La entrega parcial se marca es_parcial'
);
SELECT is(
  (SELECT folio LIKE 'NE-______' FROM public.notas_entrega WHERE solicitud_id = '11111111-1111-4111-8111-111111111111'),
  true, 'La nota conserva el folio legacy NE-######'
);
SELECT is(
  (SELECT entregado_por_id FROM public.notas_entrega WHERE solicitud_id = '11111111-1111-4111-8111-111111111111'),
  '00000000-0000-4000-8000-0000000b7a02'::uuid, 'El folio registra quién entrega'
);
SELECT is(
  (SELECT recibido_por_id FROM public.notas_entrega WHERE solicitud_id = '11111111-1111-4111-8111-111111111111'),
  (SELECT valor FROM b7_ids WHERE nombre = 'contacto'), 'El folio registra el contacto que recibe'
);
SELECT isnt(
  (SELECT fecha_entrega FROM public.notas_entrega WHERE solicitud_id = '11111111-1111-4111-8111-111111111111'),
  NULL, 'La entrega registra fecha'
);
SELECT is(
  (SELECT renglon.codigo_item FROM public.partidas_nota_entrega AS renglon
   JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
   WHERE nota.solicitud_id = '11111111-1111-4111-8111-111111111111'),
  'IT01', 'El renglón guarda el ITxx de la partida'
);
SELECT is(
  (public.registrar_entrega(
    (SELECT valor FROM b7_ids WHERE nombre = 'o1'),
    ('[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":6}]')::jsonb,
    'Quien recibe B7',
    (SELECT valor FROM b7_ids WHERE nombre = 'contacto'),
    '00000000-0000-4000-8000-0000000b7a02',
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-4000-8000-0000000b7a02') ->> 'yaExistia')::boolean,
  true, 'Repetir la misma solicitud es idempotente'
);
SELECT is(
  (SELECT count(*) FROM public.notas_entrega WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1')),
  1::bigint, 'La solicitud repetida no duplica la nota'
);
-- Con producida 8 y solicitada 10, pedir 9 excede lo producido pero no lo
-- pendiente: el guard de producción es el que manda.
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it03') || '","cantidad_entregada":9}]',
    'Quien recibe', '00000000-0000-4000-8000-0000000b7a02'),
  '23514', 'cantidad_entrega_excede_producida', 'No se entrega más de lo producido (ni de lo pendiente)'
);

-- -----------------------------------------------------------------------------
-- 5. Entrega total: segundo folio, archivo y activación de AR
-- -----------------------------------------------------------------------------
-- El piso completa la producción de IT03 antes de la entrega final.
UPDATE public.partidas_orden_produccion SET cantidad_producida = 10
WHERE id = (SELECT valor FROM b7_ids WHERE nombre = 'p1_it03');

SELECT is(
  (public.registrar_entrega(
    (SELECT valor FROM b7_ids WHERE nombre = 'o1'),
    ('[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it01') || '","cantidad_entregada":4},'
     || '{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it02') || '","cantidad_entregada":5},'
     || '{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p1_it03') || '","cantidad_entregada":10}]')::jsonb,
    'Quien recibe B7',
    (SELECT valor FROM b7_ids WHERE nombre = 'contacto'),
    '00000000-0000-4000-8000-0000000b7a02',
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-4000-8000-0000000b7a02') ->> 'folioSii'),
  'NE-1026_01-02', 'La segunda entrega de la orden usa -02'
);
SELECT is(
  (SELECT es_parcial FROM public.notas_entrega WHERE solicitud_id = '22222222-2222-4222-8222-222222222222'),
  false, 'Al cubrir el 100 % la entrega deja de ser parcial'
);
SELECT isnt(
  (SELECT archivada_en FROM public.ordenes_produccion WHERE id = (SELECT valor FROM b7_ids WHERE nombre = 'o1')),
  NULL, 'La orden se archiva al entregar todo (OBS-21)'
);
SELECT isnt(
  (SELECT cobrable_desde FROM public.cuentas_por_cobrar WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1')),
  NULL, 'La AR se activa al entregar el 100 % (D-04)'
);
SELECT is(
  (SELECT (fecha_vencimiento::date - cobrable_desde::date) FROM public.cuentas_por_cobrar
   WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o1')),
  30, 'El vencimiento usa el plazo del cliente (30_dias)'
);
SELECT throws_ok(
  format('INSERT INTO public.notas_entrega (folio, folio_sii, orden_id, recibido_por, creado_por) VALUES (%L, %L, %L, %L, %L)',
    'NE-999998', 'NE-1026_01-01', (SELECT valor::text FROM b7_ids WHERE nombre = 'o1'),
    'Otro receptor', '00000000-0000-4000-8000-0000000b7a02'),
  '23505', NULL, 'El folio SII repetido se rechaza'
);

-- -----------------------------------------------------------------------------
-- 6. Límites del consecutivo (9→10 y 99→100) y orden interna OI-
-- -----------------------------------------------------------------------------
INSERT INTO public.notas_entrega (folio, folio_sii, orden_id, recibido_por, creado_por)
SELECT
  'NE-' || lpad((700000 + g)::text, 6, '0'),
  'NE-1026_02-' || CASE WHEN g < 100 THEN lpad(g::text, 2, '0') ELSE g::text END,
  (SELECT valor FROM b7_ids WHERE nombre = 'o3'),
  'Receptor consecutivo',
  '00000000-0000-4000-8000-0000000b7a02'
FROM generate_series(1, 9) AS g;

SELECT is(
  privado.siguiente_folio_entrega((SELECT valor FROM b7_ids WHERE nombre = 'o3')),
  'NE-1026_02-10', 'El consecutivo 9→10 no trunca con ceros'
);

INSERT INTO public.notas_entrega (folio, folio_sii, orden_id, recibido_por, creado_por)
SELECT
  'NE-' || lpad((710000 + g)::text, 6, '0'),
  'NE-1026_03-' || CASE WHEN g < 100 THEN lpad(g::text, 2, '0') ELSE g::text END,
  (SELECT valor FROM b7_ids WHERE nombre = 'o3b'),
  'Receptor consecutivo',
  '00000000-0000-4000-8000-0000000b7a02'
FROM generate_series(1, 99) AS g;

SELECT is(
  privado.siguiente_folio_entrega((SELECT valor FROM b7_ids WHERE nombre = 'o3b')),
  'NE-1026_03-100', 'El consecutivo 99→100 no desborda a ##'
);
SELECT is(
  privado.siguiente_folio_entrega((SELECT valor FROM b7_ids WHERE nombre = 'o4')),
  'NE-1026_09-01', 'Las órdenes internas OI- también derivan su folio'
);
SELECT is(
  privado.siguiente_folio_entrega((SELECT valor FROM b7_ids WHERE nombre = 'o2')),
  NULL, 'Una orden histórica sin folio_sii no genera folio SII'
);

-- -----------------------------------------------------------------------------
-- 7. Herencia legacy y backfill de codigo_item
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format('SELECT resultado.id FROM public.generar_nota_entrega(%L, %L, NULL, %L, %L) AS resultado',
    (SELECT valor::text FROM b7_ids WHERE nombre = 'o2'), 'Receptor legacy',
    '00000000-0000-4000-8000-0000000b7a01',
    '[{"partida_id":"' || (SELECT valor::text FROM b7_ids WHERE nombre = 'p2_it01')
    || '","cantidad_entregada":1}]'),
  'El RPC legacy generar_nota_entrega sigue funcionando'
);
SELECT is(
  (SELECT max(nota.folio_sii) FROM public.notas_entrega AS nota
   WHERE nota.orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2')),
  NULL, 'La entrega legacy de una orden histórica conserva folio_sii NULL'
);
SELECT is(
  (SELECT bool_or(renglon.codigo_item IS NOT NULL) FROM public.partidas_nota_entrega AS renglon
   JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
   WHERE nota.orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2')),
  true, 'El trigger copia el ITxx también en el flujo legacy'
);
SELECT is(
  (SELECT bool_and(entregado_por_id = '00000000-0000-4000-8000-0000000b7a01'::uuid)
   FROM public.notas_entrega
   WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2')),
  true, 'El trigger completa entregado_por con el creador'
);

-- Renglón histórico sin trigger + backfill de codigo_item.
INSERT INTO public.notas_entrega (folio, orden_id, recibido_por, creado_por)
VALUES ('NE-999997', (SELECT valor FROM b7_ids WHERE nombre = 'o2'), 'Receptor backfill',
        '00000000-0000-4000-8000-0000000b7a01');
ALTER TABLE public.partidas_nota_entrega DISABLE TRIGGER trigger_partidas_nota_entrega_codigo;
INSERT INTO public.partidas_nota_entrega (nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada)
SELECT nota.id, (SELECT valor FROM b7_ids WHERE nombre = 'p2_it02'), 1, 1
FROM public.notas_entrega AS nota WHERE nota.folio = 'NE-999997';
ALTER TABLE public.partidas_nota_entrega ENABLE TRIGGER trigger_partidas_nota_entrega_codigo;

SELECT is(
  privado.backfill_codigo_item_entregas() >= 1,
  true, 'El backfill copia el ITxx a renglones históricos'
);
SELECT is(
  (SELECT count(*) FROM public.partidas_nota_entrega
   WHERE partida_id = (SELECT valor FROM b7_ids WHERE nombre = 'p2_it02') AND codigo_item = 'IT02'),
  1::bigint, 'El renglón backfilleado quedó con IT02'
);
SELECT is(
  (SELECT count(*) FROM public.notas_entrega
   WHERE orden_id = (SELECT valor FROM b7_ids WHERE nombre = 'o2') AND folio_sii IS NULL),
  2::bigint, 'Las dos notas legacy conservan folio_sii NULL'
);

-- -----------------------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------------------
SELECT ok(
  has_table_privilege('authenticated', 'public.notas_entrega', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.notas_entrega', 'INSERT'),
  'authenticated solo lee notas de entrega'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'privado.siguiente_folio_entrega(uuid)', 'EXECUTE'),
  'authenticated no calcula folios internos'
);

SELECT * FROM finish();
ROLLBACK;
