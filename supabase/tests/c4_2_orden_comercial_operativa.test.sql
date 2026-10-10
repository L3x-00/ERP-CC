-- C4.2 / DC-10 — alcance comercial inmutable y operación reprogramable.
-- RED previo: las fechas explícitas, las guardas y los eventos anterior/nuevo
-- no existen antes de 20261009193327.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(25);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c4201', 'c42-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c4202', 'c42-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C42'
WHERE id = '00000000-0000-4000-8000-0000000c4201';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor C42'
WHERE id = '00000000-0000-4000-8000-0000000c4202';

INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('C42MAT', 'Acero C42');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('C42LAS', 'Láser C42', 'CLBX', false);
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c4220', 'C42 Cliente', 'C42 Cliente SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000c4230', 'OP-C42-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C42', 'C42 Empresa', '00000000-0000-4000-8000-0000000c4220',
  '00000000-0000-4000-8000-0000000c4202', 'MXN'
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad, material_id)
SELECT '00000000-0000-4000-8000-0000000c4231', '00000000-0000-4000-8000-0000000c4230', 1, 'IT01',
  'Placa C42', 5, id FROM public.catalogo_materiales WHERE codigo = 'C42MAT';
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT '00000000-0000-4000-8000-0000000c4231', id, 1
FROM public.catalogo_procesos WHERE codigo = 'C42LAS';

CREATE TEMP TABLE c42 ON COMMIT DROP AS
SELECT
  (public.crear_propuesta(
    '00000000-0000-4000-8000-0000000c4230',
    '00000000-0000-4000-8000-0000000c4201'
  )->>'revisionId')::uuid AS revision_id,
  (current_date + 30)::date AS compromiso,
  (current_date + 35)::date AS operativa_nueva;
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_items SET precio_unitario = 100
WHERE revision_id = (SELECT revision_id FROM c42);
UPDATE public.propuesta_revisiones SET estado = 'SENT'
WHERE id = (SELECT revision_id FROM c42);
SELECT public.aceptar_revision(
  (SELECT revision_id FROM c42),
  jsonb_build_object(
    'actualizado_en', (SELECT actualizado_en FROM public.propuesta_revisiones
                       WHERE id = (SELECT revision_id FROM c42)),
    'fecha_compromiso_comercial', (SELECT compromiso FROM c42)
  ),
  '00000000-0000-4000-8000-0000000c4201'
);
SELECT public.procesar_solicitud_orden(
  (SELECT revision_id FROM c42),
  '00000000-0000-4000-8000-0000000c4201'
);
ALTER TABLE c42 ADD COLUMN orden_id uuid;
UPDATE c42 SET orden_id = (
  SELECT id FROM public.ordenes_produccion
  WHERE propuesta_revision_id = c42.revision_id
);

-- 1-3. Contrato explícito de fechas.
SELECT has_column('public', 'ordenes_produccion', 'fecha_compromiso_comercial',
  'la Orden conserva la fecha compromiso comercial');
SELECT has_column('public', 'ordenes_produccion', 'fecha_operativa',
  'la Orden tiene fecha operativa separada');
SELECT col_not_null('public', 'ordenes_produccion', 'fecha_operativa',
  'la fecha operativa siempre está definida');

-- 4-7. La solicitud aceptada alimenta Orden y snapshot sin derivar desde RFQ.
SELECT is(
  (SELECT fecha_compromiso_comercial FROM public.ordenes_produccion
   WHERE id = (SELECT orden_id FROM c42)),
  (SELECT compromiso FROM c42), 'copia el compromiso exacto de la solicitud');
SELECT is(
  (SELECT fecha_operativa::date FROM public.ordenes_produccion
   WHERE id = (SELECT orden_id FROM c42)),
  (SELECT compromiso FROM c42), 'la fecha operativa inicia en el compromiso');
SELECT is(
  (SELECT snapshot_json->>'fecha_compromiso_comercial' FROM public.ordenes_produccion
   WHERE id = (SELECT orden_id FROM c42)),
  (SELECT compromiso::text FROM c42), 'el snapshot congela el compromiso original');
SELECT is(
  (SELECT snapshot_json#>>'{origen,revision_id}' FROM public.ordenes_produccion
   WHERE id = (SELECT orden_id FROM c42)),
  (SELECT revision_id::text FROM c42), 'el snapshot conserva la revisión aceptada exacta');

-- 8-11. Defensa en profundidad del alcance comercial.
SELECT throws_ok(format(
  'UPDATE public.ordenes_produccion SET fecha_compromiso_comercial = current_date + 60 WHERE id = %L',
  (SELECT orden_id FROM c42)), '23514', 'alcance_comercial_inmutable',
  'no permite cambiar el compromiso comercial');
SELECT throws_ok(format(
  $$UPDATE public.ordenes_produccion SET snapshot_json = '{"alterado":true}' WHERE id = %L$$,
  (SELECT orden_id FROM c42)), '23514', 'alcance_comercial_inmutable',
  'no permite sustituir el snapshot comercial');
SELECT throws_ok(format(
  $$UPDATE public.ordenes_produccion SET prioridad = 'urgente' WHERE id = %L$$,
  (SELECT orden_id FROM c42)), '23514', 'cambio_operativo_sin_evento',
  'un cambio operativo directo exige el RPC auditado');
SELECT throws_ok(format(
  'UPDATE public.partidas_orden_produccion SET cantidad_solicitada = 9 WHERE orden_id = %L',
  (SELECT orden_id FROM c42)), '23514', 'alcance_comercial_inmutable',
  'la cantidad aceptada de cada partida queda congelada');

-- 12-13. El RPC legado pierde las mutaciones comerciales.
SELECT throws_ok(format(
  $$SELECT public.ajustar_orden_post_aceptacion(%L, '{"partidas":[]}', 'Cambio inválido', %L, %L)$$,
  (SELECT orden_id FROM c42),
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = (SELECT orden_id FROM c42)),
  '00000000-0000-4000-8000-0000000c4201'),
  '22023', 'campo_invalido', 'ya no admite cambios de partidas');
SELECT throws_ok(format(
  $$SELECT public.ajustar_orden_post_aceptacion(%L, '{"fecha_compromiso":"2099-01-01"}', 'Cambio inválido', %L, %L)$$,
  (SELECT orden_id FROM c42),
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = (SELECT orden_id FROM c42)),
  '00000000-0000-4000-8000-0000000c4201'),
  '22023', 'campo_invalido', 'ya no admite cambiar el compromiso comercial');

-- 14-18. Operación mutable con CAS y evento anterior/nuevo.
SELECT lives_ok(format(
  $$SELECT public.ajustar_orden_post_aceptacion(%L,
    jsonb_build_object('fecha_operativa', %L, 'prioridad', 'urgente', 'notas', 'Turno nocturno'),
    'Reprogramación confirmada', %L, %L)$$,
  (SELECT orden_id FROM c42),
  ((SELECT operativa_nueva FROM c42)::text || 'T18:00:00Z'),
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = (SELECT orden_id FROM c42)),
  '00000000-0000-4000-8000-0000000c4201'),
  'permite ajustar exclusivamente datos operativos');
SELECT is(
  (SELECT fecha_compromiso_comercial FROM public.ordenes_produccion
   WHERE id = (SELECT orden_id FROM c42)),
  (SELECT compromiso FROM c42), 'reprogramar no altera el compromiso comercial');
SELECT results_eq(
  format($$SELECT prioridad, fecha_operativa::date, fecha_compromiso::date, notas
           FROM public.ordenes_produccion WHERE id = %L$$, (SELECT orden_id FROM c42)),
  $$SELECT 'urgente'::text, operativa_nueva, operativa_nueva, 'Turno nocturno'::text FROM c42$$,
  'actualiza operación y mantiene el espejo legacy');
SELECT is(
  (SELECT detalle#>>'{nuevo,prioridad}' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT orden_id FROM c42) AND tipo = 'ajuste_operativo'
   ORDER BY creado_en DESC LIMIT 1),
  'urgente', 'el evento conserva el valor nuevo');
SELECT is(
  (SELECT detalle#>>'{anterior,prioridad}' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT orden_id FROM c42) AND tipo = 'ajuste_operativo'
   ORDER BY creado_en DESC LIMIT 1),
  'normal', 'el evento conserva el valor anterior');

-- 19. CAS: una pantalla obsoleta no pisa otro cambio.
SELECT throws_ok(format(
  $$SELECT public.ajustar_orden_post_aceptacion(%L, '{"prioridad":"alta"}',
    'Pantalla obsoleta', '2000-01-01T00:00:00Z', %L)$$,
  (SELECT orden_id FROM c42), '00000000-0000-4000-8000-0000000c4201'),
  '23514', 'orden_desactualizada', 'el ajuste operativo conserva CAS');

-- 20-22. Reprogramación de recurso con actor, motivo y anterior/nuevo.
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre)
VALUES ('00000000-0000-4000-8000-0000000c4240', 'C42-R1', 'sheet_metal', 'Recurso C42');
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c4240', 'matutino', 8);
SELECT lives_ok(format(
  $$SELECT public.programar_partida_recurso_auditada(%L, %L, %L, 1::smallint, %L, 'matutino', 2::numeric, 1, %L, %L)$$,
  (SELECT orden_id FROM c42),
  (SELECT id FROM public.partidas_orden_produccion WHERE orden_id = (SELECT orden_id FROM c42) LIMIT 1),
  '00000000-0000-4000-8000-0000000c4240',
  (current_date + 31)::text,
  '00000000-0000-4000-8000-0000000c4201',
  '00000000-0000-4000-8000-0000000c42c1'),
  'la programación inicial registra actor y correlación');
SELECT lives_ok(format(
  $$SELECT public.reprogramar_partida_recurso_auditada(%L, %L, %L, 'matutino', 2, 2, %L,
    'Cambio de fecha por capacidad', %L, %L)$$,
  (SELECT id FROM public.programacion_areas WHERE orden_id = (SELECT orden_id FROM c42) LIMIT 1),
  '00000000-0000-4000-8000-0000000c4240',
  (current_date + 32)::text,
  (SELECT actualizado_en FROM public.programacion_areas WHERE orden_id = (SELECT orden_id FROM c42) LIMIT 1),
  '00000000-0000-4000-8000-0000000c4201',
  '00000000-0000-4000-8000-0000000c42c2'),
  'reprogramar exige y registra el motivo');
SELECT is(
  (SELECT detalle#>>'{anterior,fecha_programada}' FROM public.orden_eventos_cambio
   WHERE orden_id = (SELECT orden_id FROM c42) AND tipo = 'reprogramacion_operativa'
   ORDER BY creado_en DESC LIMIT 1),
  (current_date + 31)::text, 'el historial de Planeación conserva anterior/nuevo');

SELECT ok(
  NOT has_function_privilege('service_role',
    'public.programar_partida_recurso(uuid,uuid,uuid,smallint,date,text,numeric,integer)', 'EXECUTE'),
  'service_role no puede saltar el wrapper auditado de programación');
SELECT ok(
  has_function_privilege('service_role',
    'public.programar_partida_recurso_auditada(uuid,uuid,uuid,smallint,date,text,numeric,integer,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta programación auditada');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.reprogramar_partida_recurso_auditada(uuid,uuid,date,text,numeric,integer,timestamptz,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta reprogramación privilegiada');

SELECT * FROM finish();
ROLLBACK;
