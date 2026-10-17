-- C8.4 — registrar_entrega exige PRODUCCION_COMPLETADA (O-08 «No», respuesta 2026-10-15)
--        y atraso/en riesgo contra el compromiso comercial (O-06 A) en el Dashboard.
-- Migración: 20261017100001_c8_4_entrega_completada_y_puntualidad_comercial.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(10);

-- -----------------------------------------------------------------------------
-- 0. Actor con permiso de entrega
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c84a1', 'c84-actor@prueba.local');
UPDATE public.usuarios SET rol = 'contador', activo = true, nombre_completo = 'Actor C84'
WHERE id = '00000000-0000-4000-8000-0000000c84a1';
INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('entrega_generar', 'entregas', 'Generar notas de entrega')
  ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('contador', 'entrega_generar')
  ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Órdenes de prueba (cliente sembrado por el fixture general)
-- -----------------------------------------------------------------------------
INSERT INTO public.ordenes_produccion (
  folio, folio_sii, cliente_id, estado, estado_sii, prioridad,
  fecha_compromiso, fecha_compromiso_comercial, es_interna, creado_en
) VALUES
  -- A: entregable (flujo nuevo) — completa, con compromiso comercial futuro
  ('O-1026_80', 'O-1026_80', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'completada', 'PRODUCCION_COMPLETADA', 'normal',
   now() + interval '10 days', '2099-01-01', false, now() - interval '5 days 12 hours'),
  -- B: en producción → el cliente decidió NO entregar aquí (O-08 «No»)
  ('O-1026_81', 'O-1026_81', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() + interval '10 days', '2099-01-02', false, now() - interval '5 days 12 hours'),
  -- D: interna sin compromiso comercial (no debe contar como atrasada aunque esté vencida)
  ('OI-1026_80', 'OI-1026_80', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'en_proceso', 'EN_PRODUCCION', 'normal', now() - interval '30 days', NULL, true, now() - interval '5 days 12 hours'),
  -- C: comercial atrasada (prometida hace 5 días)
  ('O-1026_82', 'O-1026_82', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'programada', 'LISTA', 'normal', now() - interval '5 days', now() - interval '5 days', false, now() - interval '5 days 12 hours'),
  -- C2: promesa comercial futura, operativa pasada → el atraso NO se mide contra la operativa
  ('O-1026_83', 'O-1026_83', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'programada', 'LISTA', 'normal', now() - interval '1 day', now() + interval '10 days', false, now() - interval '5 days 12 hours'),
  -- F: dentro de la ventana de riesgo (3 días)
  ('O-1026_84', 'O-1026_84', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
   'programada', 'LISTA', 'normal', now() + interval '1 day', now() + interval '1 day', false, now() - interval '5 days 12 hours');

INSERT INTO public.partidas_orden_produccion (
  orden_id, codigo_pieza, codigo_item, descripcion,
  cantidad_solicitada, cantidad_producida, unidad_medida
)
SELECT orden.id, datos.codigo_pieza, datos.codigo_item, datos.descripcion,
       datos.solicitada, datos.producida, 'pieza'
FROM (VALUES (
  'O-1026_80', 'P-80-1', 'IT01', 'Entregable A', 10, 10
), (
  'O-1026_80', 'P-80-2', 'IT02', 'Resto del 100 %', 10, 10
), (
  'O-1026_81', 'P-81-1', 'IT01', 'En producción B', 1, 1
)) AS datos(folio, codigo_pieza, codigo_item, descripcion, solicitada, producida)
JOIN public.ordenes_produccion AS orden ON orden.folio = datos.folio;

-- ---------------------------------------------------------------------------
-- 1b. Ajuste operativo de C2: mueve SOLO la fecha operativa al pasado con el
--     gate del trigger c4_2. La antigua métrica (espejo fecha_compromiso)
--     habría contado esta orden como atrasada; la comercial queda futura.
-- ---------------------------------------------------------------------------
SELECT set_config('sii.c4_2_ajuste_operativo', 'on', true);
UPDATE public.ordenes_produccion
SET fecha_operativa = now() - interval '2 days'
WHERE folio = 'O-1026_83';
SELECT set_config('sii.c4_2_ajuste_operativo', '', true);

-- Filas de pipeline por ventana para el Dashboard de equipo (creado_en ya default en la ventana actual).
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa,
  cliente_id, vendedor_id, moneda, creado_en
) VALUES (
  '00000000-0000-4000-8000-0000000c84b1', 'OP-C84-P1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C84', 'Empresa C84', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
  '00000000-0000-4000-8000-0000000c84a1', 'MXN', now() - interval '5 days 12 hours'
), (
  '00000000-0000-4000-8000-0000000c84b2', 'OP-C84-P2', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C84', 'Empresa C84', (SELECT id FROM public.clientes WHERE razon_social = 'B7 Cliente SA de CV'),
  '00000000-0000-4000-8000-0000000c84a1', 'MXN', now()
);

-- -----------------------------------------------------------------------------
-- 2. registrar_entrega: O-08 «No»
-- -----------------------------------------------------------------------------
-- 1) La orden B en EN_PRODUCCION se rechaza.
SELECT throws_ok(
  format('SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT id::text FROM public.ordenes_produccion WHERE folio = 'O-1026_81'),
    format('[{"partida_id":"%s","cantidad_entregada":1}]',
      (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-81-1')),
    'Quien recibe', '00000000-0000-4000-8000-0000000c84a1'),
  '23514', 'orden_no_entregable', 'O-08 «No»: NO se entrega con la orden en producción'
);

-- 2) La orden A en PRODUCCION_COMPLETADA sí registra la parcial.
SELECT is(
  (public.registrar_entrega(
    (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_80'),
    ('[{"partida_id":"' || (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-80-1')
      || '","cantidad_entregada":4}]')::jsonb,
    'Quien recibe', NULL, NULL,
    '11111111-1111-4111-8111-0000000c8401',
    '00000000-0000-4000-8000-0000000c84a1') ->> 'yaExistia'),
  'false', 'O-08: con producción completada la entrega parcial SÍ se registra'
);

SELECT is(
  (SELECT es_parcial FROM public.notas_entrega
   WHERE orden_id = (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_80')),
  true, 'La entrega 4/20 de la partida IT01 se marca es_parcial'
);

-- 3) Idempotencia por solicitud: la misma llamada devuelve la nota ganadora.
SELECT is(
  (public.registrar_entrega(
    (SELECT id FROM public.ordenes_produccion WHERE folio = 'O-1026_80'),
    ('[{"partida_id":"' || (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-80-1')
      || '","cantidad_entregada":4}]')::jsonb,
    'Quien recibe', NULL, NULL,
    '11111111-1111-4111-8111-0000000c8401',
    '00000000-0000-4000-8000-0000000c84a1') ->> 'yaExistia'),
  'true', 'La idempotencia por solicitud reutiliza la nota en la segunda llamada'
);

-- 4) La entrega complementaria (6 más) lleva IT01 e IT02 al 100 %.
SELECT lives_ok(
  format(
    $sql$SELECT public.registrar_entrega(
      %L,
      '[{"partida_id":"%s","cantidad_entregada":6},{"partida_id":"%s","cantidad_entregada":10}]'::jsonb,
      'Quien recibe', NULL, NULL, NULL, %L)$sql$,
    (SELECT id::text FROM public.ordenes_produccion WHERE folio = 'O-1026_80'),
    (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-80-1'),
    (SELECT id::text FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-80-2'),
    (SELECT id::text FROM auth.users WHERE email = 'c84-actor@prueba.local'),
    'Con producción completada también llega la entrega total del 100 %'
  )
);

SELECT is(
  (SELECT sum(cantidad_entregada)::numeric(12,0)::text FROM public.partidas_nota_entrega
   WHERE partida_id = (SELECT id FROM public.partidas_orden_produccion WHERE codigo_pieza = 'P-80-1')),
  '10', 'Las dos entregas acumulan el 100 % de la partida IT01'
);

-- -----------------------------------------------------------------------------
-- 3. Puntualidad contra el compromiso comercial (O-06 A)
--    relevantes: C comercial pasada → atrasada; C2 comercial futura/operativa
--    pasada → NO atrasada; D interna sin comercial → NO atrasada; F → en riesgo.
-- -----------------------------------------------------------------------------
SELECT is(
  ((privado.metricas_ejecutivas_rango(
    now() - interval '10 days', now() + interval '10 days', now()
  ) -> 'ordenes' ->> 'atrasadas')::integer),
  1, 'Sólo la orden con promesa comercial vencida cuenta como atrasada (C2/D quedan fuera)'
);

SELECT is(
  ((privado.metricas_ejecutivas_rango(
    now() - interval '10 days', now() + interval '10 days', now()
  ) -> 'ordenes' ->> 'enRiesgo')::integer),
  1, 'La orden F (promesa dentro de 3 días) cuenta como en riesgo'
);

RESET ROLE;

SELECT is(
  ((public.obtener_metricas_pipeline_equipo(
    (now() - interval '10 days'), (now() - interval '2 days')
  ) -> 'actual' -> 'ordenes' ->> 'atrasadas')::integer),
  1,
  'El dashboard de equipo también cuenta el atraso contra la promesa comercial'
);

SELECT is(
  ((public.obtener_metricas_pipeline_equipo(
    (now() - interval '10 days'), (now() - interval '2 days')
  ) -> 'actual' -> 'ordenes' ->> 'enRiesgo')::integer),
  1,
  'El dashboard de equipo cuenta «en riesgo» dentro de los 3 días de la promesa'
);

ROLLBACK;
