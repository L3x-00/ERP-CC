-- C31/A1 - Reclamar un recurso liberado cierra el reclamo, limpia la asignación
-- huérfana y deja traza del actor para que el operador vea qué administración
-- actuó y cuándo. Además respeta el orden de locks de C10 y no rompe C22.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(22);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000c31a0101', 'c31a1-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a0102', 'c31a1-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a0103', 'c31a1-gerente2@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a0104', 'c31a1-operador2@prueba.local');
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente A1'
WHERE id = '00000000-0000-4000-8000-0000c31a0101';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente A1 Segundo'
WHERE id = '00000000-0000-4000-8000-0000c31a0103';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador A1'
WHERE id = '00000000-0000-4000-8000-0000c31a0102';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador A1 Segundo'
WHERE id = '00000000-0000-4000-8000-0000c31a0104';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000c31a0105', 'Cliente C31A1 SA de CV', 'C31A1', 'activo');

INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000c31a0106', 'C31A1ACERO', 'Acero C31A1');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES
  ('00000000-0000-4000-8000-0000c31a0107', 'C31A1-LASER-1', 'Láser C31A1 1', 'taller', true),
  ('00000000-0000-4000-8000-0000c31a0108', 'C31A1-LASER-2', 'Láser C31A1 2', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES
  ('00000000-0000-4000-8000-0000c31a0107', 'matutino', 8),
  ('00000000-0000-4000-8000-0000c31a0108', 'matutino', 8);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-0000c31a0109', 'OP-993201', '00000000-0000-4000-8000-0000c31a0105', 'pausada', current_date + 10),
  ('00000000-0000-4000-8000-0000c31a010a', 'OP-993202', '00000000-0000-4000-8000-0000c31a0105', 'pausada', current_date + 11);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, catalogo_material_id, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000c31a010b', '00000000-0000-4000-8000-0000c31a0109',
   'C31A1-P1', 'Pieza con un reclamo', 5, 'pieza', ARRAY['LASER_FIBRA'],
   '00000000-0000-4000-8000-0000c31a0106', '00000000-0000-4000-8000-0000c31a0102'),
  ('00000000-0000-4000-8000-0000c31a010c', '00000000-0000-4000-8000-0000c31a010a',
   'C31A1-P2', 'Pieza con otro reclamo vigente', 5, 'pieza', ARRAY['LASER_FIBRA', 'DOBLADO'],
   '00000000-0000-4000-8000-0000c31a0106', '00000000-0000-4000-8000-0000c31a0104');

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000c31a0110', '00000000-0000-4000-8000-0000c31a0109',
   '00000000-0000-4000-8000-0000c31a010b', '00000000-0000-4000-8000-0000c31a0107',
   1, 'bloqueada', current_date, 'matutino', 4, (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a010b' ORDER BY secuencia LIMIT 1)),
  ('00000000-0000-4000-8000-0000c31a0111', '00000000-0000-4000-8000-0000c31a010a',
   '00000000-0000-4000-8000-0000c31a010c', '00000000-0000-4000-8000-0000c31a0108',
   1, 'bloqueada', current_date, 'matutino', 4, (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a010c' ORDER BY secuencia LIMIT 1));

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  estado_sesion, motivo_pausa, motivo_pausa_codigo, piezas_producidas, horas_netas
) VALUES
  ('00000000-0000-4000-8000-0000c31a0112', '00000000-0000-4000-8000-0000c31a0109',
   '00000000-0000-4000-8000-0000c31a010b', '00000000-0000-4000-8000-0000c31a0110',
   '00000000-0000-4000-8000-0000c31a0102', now() - interval '2 hours', now() - interval '61 minutes',
   'pausada', 'material_pendiente', 'MATERIAL', 1, 0.98),
  ('00000000-0000-4000-8000-0000c31a0113', '00000000-0000-4000-8000-0000c31a010a',
   '00000000-0000-4000-8000-0000c31a010c', '00000000-0000-4000-8000-0000c31a0111',
   '00000000-0000-4000-8000-0000c31a0104', now() - interval '2 hours', now() - interval '61 minutes',
   'pausada', 'material_pendiente', 'MATERIAL', 1, 0.98);

INSERT INTO public.reclamos_proceso_operador (
  id, orden_id, partida_id, meta_proceso_id, programacion_id, operador_id,
  fecha, turno, horas_estimadas, estado
) VALUES
  ('00000000-0000-4000-8000-0000c31a0114', '00000000-0000-4000-8000-0000c31a0109',
   '00000000-0000-4000-8000-0000c31a010b', (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a010b' ORDER BY secuencia LIMIT 1),
   '00000000-0000-4000-8000-0000c31a0110', '00000000-0000-4000-8000-0000c31a0102',
   current_date, 'matutino', 4, 'activo'),
  ('00000000-0000-4000-8000-0000c31a0115', '00000000-0000-4000-8000-0000c31a010a',
   '00000000-0000-4000-8000-0000c31a010c', (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a010c' ORDER BY secuencia LIMIT 1),
   '00000000-0000-4000-8000-0000c31a0111', '00000000-0000-4000-8000-0000c31a0104',
   current_date, 'matutino', 4, 'activo'),
  ('00000000-0000-4000-8000-0000c31a0116', '00000000-0000-4000-8000-0000c31a010a',
   '00000000-0000-4000-8000-0000c31a010c', (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a010c' ORDER BY secuencia OFFSET 1 LIMIT 1),
   NULL, '00000000-0000-4000-8000-0000c31a0104',
   current_date, 'matutino', 2, 'activo');

-- Tercer escenario: sin reclamo, pero con asignación huérfana en la partida.
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000c31a0125', 'C31A1-LASER-3', 'Láser C31A1 3', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000c31a0125', 'matutino', 8);
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000c31a0121', 'OP-993203', '00000000-0000-4000-8000-0000c31a0105', 'pausada', current_date + 12);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, catalogo_material_id, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000c31a0122', '00000000-0000-4000-8000-0000c31a0121',
  'C31A1-P3', 'Pieza sin reclamo', 5, 'pieza', ARRAY['LASER_FIBRA'],
  '00000000-0000-4000-8000-0000c31a0106', '00000000-0000-4000-8000-0000c31a0102');
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000c31a0123', '00000000-0000-4000-8000-0000c31a0121',
  '00000000-0000-4000-8000-0000c31a0122', '00000000-0000-4000-8000-0000c31a0125',
  1, 'bloqueada', current_date, 'matutino', 4,
  (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a0122' ORDER BY secuencia LIMIT 1));
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  estado_sesion, motivo_pausa, motivo_pausa_codigo, piezas_producidas, horas_netas
) VALUES (
  '00000000-0000-4000-8000-0000c31a0124', '00000000-0000-4000-8000-0000c31a0121',
  '00000000-0000-4000-8000-0000c31a0122', '00000000-0000-4000-8000-0000c31a0123',
  '00000000-0000-4000-8000-0000c31a0102', now() - interval '2 hours', now() - interval '61 minutes',
  'pausada', 'material_pendiente', 'MATERIAL', 1, 0.98);

-- -----------------------------------------------------------------------------
-- 1-8. Primera llamada con reclamo: cierra reclamo, limpia asignación y guarda traza
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE resultado_a1 AS
SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c1'::uuid, '00000000-0000-4000-8000-0000c31a0112') AS json;

SELECT is((SELECT json->>'ya_aplicado' FROM resultado_a1), 'false',
  'La primera llamada no es replay');
SELECT is((SELECT json->>'reclamos_liberados' FROM resultado_a1), '1',
  'Se cerró exactamente un reclamo activo');
SELECT is((SELECT json->>'liberado_por' FROM resultado_a1),
  '00000000-0000-4000-8000-0000c31a0101', 'El JSON devuelve el actor');
SELECT is((SELECT json->>'liberado_por_nombre' FROM resultado_a1), 'Gerente A1',
  'El JSON devuelve el nombre real del actor, no un genérico');
SELECT is((SELECT estado FROM public.reclamos_proceso_operador
  WHERE id = '00000000-0000-4000-8000-0000c31a0114'), 'liberado',
  'El reclamo activo queda liberado');
SELECT is((SELECT operador_asignado_id FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000c31a010b'), NULL,
  'Se limpia la asignación huérfana cuando ya no hay reclamos activos');
SELECT is((SELECT recurso_liberado_por FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000c31a0112'),
  '00000000-0000-4000-8000-0000c31a0101', 'La sesión conserva quién liberó');
SELECT is((SELECT recurso_liberado_reclamos_count FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000c31a0112'), 1,
  'La sesión conserva cuántos reclamos se cerraron');

-- 9-11. Replay con el mismo correlation: mismo efecto, sin duplicados
CREATE TEMP TABLE resultado_replay AS
SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c1'::uuid, '00000000-0000-4000-8000-0000c31a0112') AS json;
SELECT is((SELECT json->>'ya_aplicado' FROM resultado_replay), 'true',
  'El replay se identifica como ya aplicado');
SELECT is((SELECT json->>'liberado_por_nombre' FROM resultado_replay),
  (SELECT json->>'liberado_por_nombre' FROM resultado_a1),
  'El replay devuelve el mismo actor persistido');
SELECT is((SELECT count(*)::int FROM public.registros_tiempo_operador
  WHERE partida_id = '00000000-0000-4000-8000-0000c31a010b'
    AND notas = 'Recurso liberado por administración'), 1,
  'El replay no duplica el evento de auditoría');

-- 12. Otro correlation sobre la misma pausa ya liberada mantiene el error de C22.
SELECT throws_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c2'::uuid, '00000000-0000-4000-8000-0000c31a0112')$$,
  '23514', 'recurso_ya_reclamado',
  'Otro correlation distinto no se considera el mismo doble clic');

-- 13. Reutilizar el correlation con otro actor es un conflicto explícito.
SELECT throws_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0103',
  '00000000-0000-4000-8000-0000c31a01c1'::uuid, '00000000-0000-4000-8000-0000c31a0112')$$,
  '22023', 'conflicto_idempotencia',
  'El correlation queda ligado al actor original');

-- 14. La llamada heredada sin correlation sigue como en C22.
SELECT throws_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0101',
  NULL::uuid, '00000000-0000-4000-8000-0000c31a0112')$$,
  '23514', 'recurso_ya_reclamado',
  'La caracterización de C22 sin correlation se conserva');

-- 15. Si queda otro reclamo activo en la partida, la asignación se conserva.
SELECT lives_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0108', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c3'::uuid, '00000000-0000-4000-8000-0000c31a0113')$$,
  'Se libera la segunda máquina');
SELECT is((SELECT operador_asignado_id FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000c31a010c'),
  '00000000-0000-4000-8000-0000c31a0104',
  'La asignación se conserva mientras siga otro reclamo activo en la partida');

-- 16. El trigger limpia la traza si alguien vuelve recurso_liberado a false.
UPDATE public.sesiones_trabajo
SET recurso_liberado = false
WHERE id = '00000000-0000-4000-8000-0000c31a0112';
SELECT is((SELECT count(*)::int FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000c31a0112'
    AND recurso_liberado_por IS NULL
    AND recurso_liberado_en IS NULL
    AND recurso_liberado_correlation_id IS NULL
    AND recurso_liberado_reclamos_count IS NULL), 1,
  'Volver a false limpia los cuatro campos de traza');

-- 17. GRANT por columnas: la UI del operador puede leer la traza.
SELECT ok(has_column_privilege('authenticated', 'public.sesiones_trabajo',
  'recurso_liberado_por', 'SELECT'),
  'authenticated tiene SELECT en la columna nueva (CUELLOS §13)');

-- 18. B2 no se relaja.
SELECT is(privado.partida_requiere_consumo_material(
  '00000000-0000-4000-8000-0000c31a010b'), true,
  'El cierre normal sigue exigiendo consumo de material');

-- 20-21. Sin reclamo, pero con asignación huérfana: se limpia y se registra 0.
SELECT lives_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0125', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c4'::uuid, '00000000-0000-4000-8000-0000c31a0124')$$,
  'Se libera una máquina sin reclamo previo');
SELECT is((SELECT operador_asignado_id FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000c31a0122'), NULL,
  'Se limpia la asignación huérfana aunque no existiera reclamo');

-- 22. Reutilizar la correlación en otro recurso es conflicto, no replay.
SELECT throws_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000c31a0107', '00000000-0000-4000-8000-0000c31a0101',
  '00000000-0000-4000-8000-0000c31a01c3'::uuid, '00000000-0000-4000-8000-0000c31a0112')$$,
  '22023', 'conflicto_idempotencia',
  'La correlación no sirve para liberar otra máquina');

SELECT * FROM finish();
ROLLBACK;
