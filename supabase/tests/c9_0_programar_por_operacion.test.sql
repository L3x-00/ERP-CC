-- C9.0 / P-01 B — programar por operación del ruteo.
-- RED previo: meta_proceso_id, los índices parciales y el nuevo default de
-- cierre no existen antes de 20261017130000.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(25);

-- Operador (cierre de sesión) y planeador admin (wrapper auditado).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000c9a01', 'c90-operador@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c9a02', 'c90-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c9a01';
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c9a02';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c9a10', 'Cliente C90', 'Cliente C90 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c9a20', 'OP-993120',
  '00000000-0000-4000-8000-0000000c9a10', 'en_proceso', now() + interval '10 days');

-- La partida A tiene ruteo de dos operaciones; la B una sola (para la meta ajena).
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c9a30', '00000000-0000-4000-8000-0000000c9a20',
   'C90-P1', 10, 'pieza', ARRAY['Corte', 'Doblado'], '00000000-0000-4000-8000-0000000c9a01'),
  ('00000000-0000-4000-8000-0000000c9a31', '00000000-0000-4000-8000-0000000c9a20',
   'C90-P2', 4, 'pieza', ARRAY['Corte'], '00000000-0000-4000-8000-0000000c9a01');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c9a41', 'C90-R1', 'taller', 'Recurso C90 1', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c9a41', 'matutino', 8);

-- 1. La columna de operación existe.
SELECT has_column('public', 'programacion_areas', 'meta_proceso_id',
  'La programación registra la operación del ruteo');

-- 2. Sanidad del fixture: el ruteo autogenera una operación por proceso.
SELECT is((
  SELECT count(*)::integer FROM public.metas_proceso_partida AS meta
  WHERE meta.partida_id = '00000000-0000-4000-8000-0000000c9a30'
), 2, 'El ruteo de la partida crea una operación por proceso');

-- 3-4. Programar por operación: secuencia nula, derivada de la meta.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 3, 1,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1))$$,
  'Programar por operación acepta secuencia nula y deriva la de la meta');
SELECT is((
  SELECT programacion.secuencia::integer FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.meta_proceso_id = (
      SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1)
), 1, 'La secuencia de la fila se deriva de la operación');

-- 5. Duplicado de la misma operación.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 3, 1,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1))$$,
  '23505', 'programacion_duplicada', 'Una operación no se programa dos veces');

-- 6-7. Dos operaciones de la misma partida SÍ pueden usar el mismo recurso.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 2, 1,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 2))$$,
  'Dos operaciones de la misma partida pueden usar el mismo recurso');
SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.recurso_id = '00000000-0000-4000-8000-0000000c9a41'
), 2, 'Ambas operaciones quedan registradas en el mismo recurso');

-- 8. Meta de otra partida.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 1, 1,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a31'))$$,
  '23514', 'meta_proceso_no_corresponde', 'Una operación ajena a la partida se rechaza');

-- 9. Con operación no se captura secuencia manual.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', 2::smallint, current_date, 'matutino', 1, 1,
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 2))$$,
  '23514', 'programacion_invalida', 'Con operación la secuencia manual se rechaza');

-- 10. Sin operación la secuencia manual sigue siendo obligatoria.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 1, 1,
  NULL::uuid)$$,
  '23514', 'programacion_invalida', 'Sin operación la secuencia manual es obligatoria');

-- 11-12. Las filas heredadas conservan sus dos reglas y conviven con operaciones.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', 1::smallint, current_date, 'matutino', 1, 1)$$,
  'Las filas heredadas conservan la captura manual de secuencia');
SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.secuencia = 1
), 2, 'La fila heredada y la operación con la misma secuencia conviven');

-- 13. La regla heredada partida×recurso sigue vigente.
SELECT throws_ok($$SELECT * FROM public.programar_partida_recurso(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a30',
  '00000000-0000-4000-8000-0000000c9a41', 2::smallint, current_date, 'matutino', 1, 1)$$,
  '23505', 'programacion_duplicada', 'La regla heredada partida×recurso sigue vigente');

-- 14. La carga suma operaciones y heredadas sin cambiar la fórmula (3+2+1).
SELECT is((
  SELECT carga.horas_programadas FROM public.obtener_carga_capacidad_diaria(current_date, current_date) AS carga
  WHERE carga.recurso_id = '00000000-0000-4000-8000-0000000c9a41'
    AND carga.fecha_programada = current_date
    AND carga.turno = 'matutino'
), 6::numeric, 'La carga suma operaciones y heredadas sin cambiar la fórmula');

-- 15-16. Cierre sin meta explícita: el avance es de la operación programada.
UPDATE public.programacion_areas SET estado_planeacion = 'en_proceso'
WHERE id = (
  SELECT programacion.id FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.meta_proceso_id = (
      SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1)
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000c9a61', '00000000-0000-4000-8000-0000000c9a20',
  '00000000-0000-4000-8000-0000000c9a30',
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
     AND meta_proceso_id = (
       SELECT id FROM public.metas_proceso_partida
       WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1)),
  '00000000-0000-4000-8000-0000000c9a01', 'activa', now() - interval '1 hour'
);
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c9a61', '00000000-0000-4000-8000-0000000c9a01',
  4, 'finalizada')$$,
  'Cerrar sin meta explícita cierra la operación programada');
SELECT is((
  SELECT avance.meta_proceso_id FROM public.registros_avance_partida AS avance
  WHERE avance.sesion_trabajo_id = '00000000-0000-4000-8000-0000000c9a61'
), (
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 1
), 'El avance sin meta queda atribuido a la operación programada');

-- 17-18. La fila heredada conserva el respaldo histórico (última meta).
UPDATE public.programacion_areas SET estado_planeacion = 'en_proceso'
WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
  AND secuencia = 1 AND meta_proceso_id IS NULL;
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000c9a62', '00000000-0000-4000-8000-0000000c9a20',
  '00000000-0000-4000-8000-0000000c9a30',
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
     AND secuencia = 1 AND meta_proceso_id IS NULL),
  '00000000-0000-4000-8000-0000000c9a01', 'activa', now() - interval '1 hour'
);
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c9a62', '00000000-0000-4000-8000-0000000c9a01',
  1, 'finalizada')$$,
  'Una fila heredada sigue cerrando con el respaldo de siempre');
SELECT is((
  SELECT avance.meta_proceso_id FROM public.registros_avance_partida AS avance
  WHERE avance.sesion_trabajo_id = '00000000-0000-4000-8000-0000000c9a62'
), (
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
  ORDER BY secuencia DESC LIMIT 1
), 'Sin operación programada el avance cae en la última meta (respaldo)');

-- 19-21. Reprogramar conserva la operación (D-4).
SELECT lives_ok($$SELECT * FROM public.reprogramar_partida_recurso(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
     AND meta_proceso_id = (
       SELECT id FROM public.metas_proceso_partida
       WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 2)),
  '00000000-0000-4000-8000-0000000c9a41', current_date + 1, 'matutino', 2.5, 1,
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30'
     AND meta_proceso_id = (
       SELECT id FROM public.metas_proceso_partida
       WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 2)))$$,
  'Reprogramar mueve fecha y horas sin tocar la operación');
SELECT is((
  SELECT programacion.meta_proceso_id FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.secuencia = 2 AND programacion.fecha_programada = current_date + 1
), (
  SELECT id FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9a30' AND secuencia = 2
), 'La operación se conserva tras reprogramar');
SELECT is((
  SELECT programacion.fecha_programada::text FROM public.programacion_areas AS programacion
  WHERE programacion.partida_id = '00000000-0000-4000-8000-0000000c9a30'
    AND programacion.secuencia = 2 AND programacion.meta_proceso_id IS NOT NULL
), (current_date + 1)::text, 'La fecha reprogramada es la nueva');

-- 22-25. Wrapper auditado: programa por operación y el evento la conserva.
SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c9a20', '00000000-0000-4000-8000-0000000c9a31',
  '00000000-0000-4000-8000-0000000c9a41', NULL::smallint, current_date, 'matutino', 2, 1,
  '00000000-0000-4000-8000-0000000c9a02', '00000000-0000-4000-8000-000000c9ac01',
  (SELECT id FROM public.metas_proceso_partida
   WHERE partida_id = '00000000-0000-4000-8000-0000000c9a31'))$$,
  'El wrapper auditado programa por operación');
SELECT is((
  SELECT evento.detalle#>>'{nuevo,operacion}' FROM public.orden_eventos_cambio AS evento
  WHERE evento.orden_id = '00000000-0000-4000-8000-0000000c9a20'
    AND evento.tipo = 'programacion_inicial'
  ORDER BY evento.creado_en DESC LIMIT 1
), 'Corte', 'El evento de programación conserva el nombre de la operación');
SELECT is((
  SELECT evento.detalle#>>'{nuevo,meta_proceso_id}' FROM public.orden_eventos_cambio AS evento
  WHERE evento.orden_id = '00000000-0000-4000-8000-0000000c9a20'
    AND evento.tipo = 'programacion_inicial'
  ORDER BY evento.creado_en DESC LIMIT 1
), (
  SELECT id::text FROM public.metas_proceso_partida
  WHERE partida_id = '00000000-0000-4000-8000-0000000c9a31'
), 'El evento conserva la operación programada');
SELECT is((
  SELECT evento.detalle#>>'{nuevo,secuencia}' FROM public.orden_eventos_cambio AS evento
  WHERE evento.orden_id = '00000000-0000-4000-8000-0000000c9a20'
    AND evento.tipo = 'programacion_inicial'
  ORDER BY evento.creado_en DESC LIMIT 1
), '1', 'El evento registra la secuencia derivada de la operación');

SELECT * FROM finish();
ROLLBACK;
