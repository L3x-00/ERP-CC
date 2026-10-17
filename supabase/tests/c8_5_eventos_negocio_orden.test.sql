-- C8.5 — Eventos de negocio de la Orden (O-13 «Sí»)
-- Migración: 20261017120000_c8_5_eventos_negocio_orden.sql.
-- El trigger de estado emite el evento SOLO cuando estado_sii cambia; un
-- UPDATE con la misma columna y el mismo valor no emite nada (guarda
-- IS DISTINCT FROM). «Entregada» se emite por nota (parcial/total).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(20);

-- -----------------------------------------------------------------------------
-- 0. Actor con permiso de entrega y orden demostrativa
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c85a1', 'c85-actor@prueba.local');
UPDATE public.usuarios SET rol = 'contador', activo = true, nombre_completo = 'Actor C85'
WHERE id = '00000000-0000-4000-8000-0000000c85a1';
INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('entrega_generar', 'entregas', 'Generar notas de entrega')
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('contador', 'entrega_generar')
  ON CONFLICT (rol, permiso) DO NOTHING;

INSERT INTO public.ordenes_produccion (
  folio, folio_sii, cliente_id, estado, estado_sii, prioridad,
  fecha_compromiso, fecha_compromiso_comercial, es_interna
) VALUES (
  'O-1026_91', 'O-1026_91',
  (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
  'borrador', 'CONFIRMADA', 'normal', now() + interval '10 days', '2099-01-01', false
);

INSERT INTO public.partidas_orden_produccion (
  orden_id, codigo_pieza, codigo_item, descripcion,
  cantidad_solicitada, cantidad_producida, unidad_medida
)
SELECT orden.id, datos.codigo_pieza, datos.codigo_item, datos.descripcion,
       datos.solicitada, datos.producida, 'pieza'
FROM (VALUES
  ('O-1026_91', 'P-C85-1', 'IT01', 'Partida C85 1', 10, 10),
  ('O-1026_91', 'P-C85-2', 'IT02', 'Partida C85 2', 10, 10)
) AS datos(folio, codigo_pieza, codigo_item, descripcion, solicitada, producida)
JOIN public.ordenes_produccion AS orden ON orden.folio = datos.folio;

-- -----------------------------------------------------------------------------
-- 1. Transición CONFIRMADA → PLANIFICADA emite una sola vez
-- -----------------------------------------------------------------------------
UPDATE public.ordenes_produccion SET estado_sii = 'PLANIFICADA'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_planificada'),
  1, 'El estado PLANIFICADA deja su evento de negocio'
);
SELECT is(
  (SELECT detalle ->> 'estado_anterior' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_planificada'),
  'CONFIRMADA', 'El evento planificada conserva el estado anterior'
);

-- UPDATE con la misma columna y el mismo valor: sin evento nuevo.
UPDATE public.ordenes_produccion SET estado_sii = 'PLANIFICADA'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_planificada'),
  1, 'Repetir el estado no duplica el evento (guarda IS DISTINCT FROM)'
);

-- LISTA: la RPC liberar_orden ya emite orden_liberada; aquí no se duplica.
UPDATE public.ordenes_produccion SET estado_sii = 'LISTA'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo IN ('orden_planificada', 'produccion_iniciada', 'produccion_completada', 'orden_cancelada')),
  1, 'LISTA entra sin evento nuevo: lo emite la liberación'
);

-- -----------------------------------------------------------------------------
-- 2. EN_PRODUCCION y PRODUCCION_COMPLETADA
-- -----------------------------------------------------------------------------
UPDATE public.ordenes_produccion SET estado_sii = 'EN_PRODUCCION'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'produccion_iniciada'),
  1, 'La primera sesión en el camino real deja un evento produccion_iniciada'
);
SELECT is(
  (SELECT detalle ->> 'estado_anterior' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'produccion_iniciada'),
  'LISTA', 'El evento iniciada conserva el estado anterior'
);

UPDATE public.ordenes_produccion SET estado_sii = 'PRODUCCION_COMPLETADA'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'produccion_completada'),
  1, 'El cumplimiento de las metas deja un evento produccion_completada'
);

-- -----------------------------------------------------------------------------
-- 3. «Entregada» por nota: parcial y total
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, %L, %L)',
    (SELECT id::text FROM public.ordenes_produccion WHERE folio = 'O-1026_91'),
    format('[{"partida_id":"%s","cantidad_entregada":4}]',
      (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-C85-1')),
    'Quien recibe', '22222222-2222-4222-8222-0000000c85a1',
    '00000000-0000-4000-8000-0000000c85a1'),
  'La entrega parcial se registra con el estado completada'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'),
  1, 'La nota parcial deja su evento entregada'
);
SELECT is(
  (SELECT detalle ->> 'es_parcial' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'),
  'true', 'La nota parcial queda marcada en el detalle del evento'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'
     AND detalle ->> 'es_parcial' <> 'false'),
  1, 'Exactamente una nota quedó marcada parcial en sus eventos'
);
SELECT is(
  (SELECT motivo FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'
     AND detalle ->> 'es_parcial' <> 'false'),
  'Entrega parcial', 'La nota parcial se rotula «Entrega parcial»'
);

SELECT lives_ok(
  format(
    $sql$SELECT public.registrar_entrega(
      %L,
      %L,
      'Quien recibe', NULL, NULL, NULL, %L)$sql$,
    (SELECT id::text FROM public.ordenes_produccion WHERE folio = 'O-1026_91'),
    format('[{"partida_id":"%s","cantidad_entregada":6},{"partida_id":"%s","cantidad_entregada":10}]',
      (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-C85-1'),
      (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-C85-2')),
    '00000000-0000-4000-8000-0000000c85a1'
  ),
  'Con el 100 % cubierto, la entrega total también emite su evento'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'),
  2, 'La segunda nota deja su propio evento entregada'
);
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'
     AND detalle ->> 'es_parcial' = 'false'),
  1, 'La nota que cubre el 100 % queda marcada como entrega total en sus eventos'
);
SELECT is(
  (SELECT motivo FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_entregada'
     AND detalle ->> 'es_parcial' = 'false'),
  'Entrega total', 'La nota del 100 % se rotula «Entrega total»'
);

-- -----------------------------------------------------------------------------
-- 4. Cancelada con motivo, una sola vez
-- -----------------------------------------------------------------------------
UPDATE public.ordenes_produccion SET estado_sii = 'CANCELADA', motivo_cancelacion = 'Cliente cancelo'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_cancelada'),
  1, 'La cancelación emite su evento'
);
SELECT is(
  (SELECT motivo FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_cancelada'),
  'Cliente cancelo', 'El evento cancelada conserva el motivo de la orden'
);
UPDATE public.ordenes_produccion SET estado_sii = 'CANCELADA', motivo_cancelacion = 'Cliente cancelo'
WHERE folio = 'O-1026_91';
SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo = 'orden_cancelada'),
  1, 'Repetir la cancelación no duplica el evento'
);

SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_91')
     AND tipo IN ('orden_planificada', 'produccion_iniciada', 'produccion_completada', 'orden_entregada', 'orden_cancelada')),
  6, 'El ciclo completo deja exactamente 6 eventos de negocio (1+1+1+2+1)'
);

ROLLBACK;
