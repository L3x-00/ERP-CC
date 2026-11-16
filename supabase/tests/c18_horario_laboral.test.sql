-- C18 - Horario laboral de la empresa.
-- Lunes a viernes 08:00-17:00 (9 h), sabado 08:00-12:00 (4 h), domingo cerrado.
-- Turnos acotados: matutino 5 h (4 h el sabado) y vespertino 4 h (cerrado el
-- sabado). La jornada de horas extra/auto-pausa es la del dia completo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(28);

-- -----------------------------------------------------------------------------
-- Fixtures. Se usa el lunes de la semana actual para que las pruebas no
-- dependan del dia en que corre el CI (nunca domingo).
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE c18 (clave text PRIMARY KEY, valor text);
INSERT INTO c18 (clave, valor)
SELECT 'lunes', (date_trunc('week', current_date)::date)::text;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-0000000c1801', 'c18-operador@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c1801';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c1802', 'Cliente C18', 'Cliente C18 SA de CV');

INSERT INTO public.grupos_equipo (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c1811', 'C18G1', 'Grupo C18 uno'),
  ('00000000-0000-4000-8000-0000000c1812', 'C18G2', 'Grupo C18 dos'),
  ('00000000-0000-4000-8000-0000000c1813', 'C18G3', 'Grupo C18 tres');

INSERT INTO public.recursos_planeacion (
  id, codigo, nombre, area, activo, cantidad_equipos, grupo_equipo_id
) VALUES
  ('00000000-0000-4000-8000-0000000c1821', 'C18R1', 'Recurso C18 uno', 'taller', true, 2,
   '00000000-0000-4000-8000-0000000c1811'),
  ('00000000-0000-4000-8000-0000000c1822', 'C18R2', 'Recurso C18 dos', 'taller', true, 1,
   '00000000-0000-4000-8000-0000000c1812'),
  -- Compatibilidad: un recurso histórico con 8 h de matutino conserva su
  -- capacidad; la jornada del día (9 h) sigue siendo el tope.
  ('00000000-0000-4000-8000-0000000c1823', 'C18R3', 'Recurso C18 tres', 'taller', true, 1,
   '00000000-0000-4000-8000-0000000c1813');

INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c1821', 'matutino', 5),
  ('00000000-0000-4000-8000-0000000c1821', 'vespertino', 4),
  ('00000000-0000-4000-8000-0000000c1822', 'matutino', 5),
  ('00000000-0000-4000-8000-0000000c1823', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c1823', 'vespertino', 4);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c1830', 'OP-993318',
  '00000000-0000-4000-8000-0000000c1802', 'programada', current_date + 30);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES
  ('00000000-0000-4000-8000-0000000c1841', '00000000-0000-4000-8000-0000000c1830',
   'C18-P1', 10, 'pza', ARRAY['Corte'], 300),
  ('00000000-0000-4000-8000-0000000c1842', '00000000-0000-4000-8000-0000000c1830',
   'C18-P2', 10, 'pza', ARRAY['Corte'], 300),
  ('00000000-0000-4000-8000-0000000c1843', '00000000-0000-4000-8000-0000000c1830',
   'C18-P3', 8, 'pza', ARRAY['Corte'], 240),
  ('00000000-0000-4000-8000-0000000c1844', '00000000-0000-4000-8000-0000000c1830',
   'C18-P4', 10, 'pza', ARRAY['Corte'], 300),
  ('00000000-0000-4000-8000-0000000c1845', '00000000-0000-4000-8000-0000000c1830',
   'C18-P5', 10, 'pza', ARRAY['Corte'], 300);

-- -----------------------------------------------------------------------------
-- 1-8. Horario: jornada del dia y horas por turno.
-- -----------------------------------------------------------------------------
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes')),
  9::numeric, 'La jornada de lunes a viernes es de 9 h');
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5),
  4::numeric, 'La jornada del sabado es de 4 h');
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6),
  0::numeric, 'El domingo no tiene jornada');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  5::numeric, 'El matutino cubre 5 h de lunes a viernes');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'vespertino'),
  4::numeric, 'El vespertino cubre 4 h de lunes a viernes');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'nocturno'),
  0::numeric, 'El nocturno queda sin capacidad');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino'),
  4::numeric, 'El sabado solo trabaja el matutino, con 4 h');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'vespertino'),
  0::numeric, 'El sabado no tiene vespertino');

-- -----------------------------------------------------------------------------
-- 9-11. Capacidad efectiva = equipos x horas del turno, con tope del horario.
-- -----------------------------------------------------------------------------
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  10::numeric, 'Dos equipos en matutino suman 10 h de lunes a viernes');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino'),
  8::numeric, 'Dos equipos el sabado suman 8 h');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'vespertino'),
  0::numeric, 'El sabado por la tarde no hay capacidad');

-- -----------------------------------------------------------------------------
-- 12-15. Compatibilidad: la capacidad histórica de 8 h se conserva y el
-- resto de la jornada queda para el vespertino.
-- -----------------------------------------------------------------------------
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1823',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  8::numeric, 'Un equipo con 8 h de matutino conserva su capacidad histórica');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1823',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'vespertino'),
  1::numeric, 'El vespertino solo recibe la hora restante de la jornada');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1823',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino'),
  4::numeric, 'El sabado la capacidad se acota a la jornada de 4 h');
SELECT is((
  SELECT sum(horas_capacidad)::numeric FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'),
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'))
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1823'
), 9::numeric, 'La suma de los turnos nunca rebasa las 9 h de la jornada');

-- -----------------------------------------------------------------------------
-- 12-14. Carga diaria: turnos abiertos por dia, sin domingo.
-- -----------------------------------------------------------------------------
SELECT is((
  SELECT count(*)::integer FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'),
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'))
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 2, 'De lunes a viernes el calendario ofrece matutino y vespertino');
SELECT is((
  SELECT turno FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5,
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5)
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 'matutino', 'El sabado solo aparece el matutino');
SELECT is((
  SELECT count(*)::integer FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6,
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6)
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 0, 'El domingo no aparece en la carga');

-- -----------------------------------------------------------------------------
-- 15-19. El reclamo del operador respeta la jornada del dia.
-- -----------------------------------------------------------------------------
INSERT INTO c18 (clave, valor)
SELECT 'reclamo_p1', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1830',
  '00000000-0000-4000-8000-0000000c1841',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1841'),
  '00000000-0000-4000-8000-0000000c1801',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino');

SELECT is((
  SELECT horas_estimadas FROM public.reclamos_proceso_operador
  WHERE id = (SELECT valor::uuid FROM c18 WHERE clave = 'reclamo_p1')
), 5::numeric, 'El reclamo de 5 h cabe en la jornada del lunes');

SELECT throws_ok($$
  SELECT public.reclamar_proceso_operador(
    '00000000-0000-4000-8000-0000000c1830',
    '00000000-0000-4000-8000-0000000c1842',
    (SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c1842'),
    '00000000-0000-4000-8000-0000000c1801',
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino')
$$, '23514', 'capacidad_diaria_insuficiente',
  'El operador no rebasa las 9 h del dia con dos reclamos de 5 h');

INSERT INTO c18 (clave, valor)
SELECT 'reclamo_p2', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1830',
  '00000000-0000-4000-8000-0000000c1842',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1842'),
  '00000000-0000-4000-8000-0000000c1801',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 1, 'matutino');

SELECT is((
  SELECT fecha FROM public.reclamos_proceso_operador
  WHERE id = (SELECT valor::uuid FROM c18 WHERE clave = 'reclamo_p2')
), (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 1,
  'El mismo proceso cabe en otro dia habil');

INSERT INTO c18 (clave, valor)
SELECT 'reclamo_p3', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1830',
  '00000000-0000-4000-8000-0000000c1843',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1843'),
  '00000000-0000-4000-8000-0000000c1801',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino');

SELECT is((
  SELECT horas_estimadas FROM public.reclamos_proceso_operador
  WHERE id = (SELECT valor::uuid FROM c18 WHERE clave = 'reclamo_p3')
), 4::numeric, 'El sabado admite un reclamo de 4 h');

SELECT throws_ok($$
  SELECT public.reclamar_proceso_operador(
    '00000000-0000-4000-8000-0000000c1830',
    '00000000-0000-4000-8000-0000000c1844',
    (SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c1844'),
    '00000000-0000-4000-8000-0000000c1801',
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino')
$$, '23514', 'proceso_excede_jornada',
  'El sabado rechaza un proceso de 5 h');

SELECT throws_ok(format($$
  SELECT public.mover_reclamo_operador(
    %L::uuid,
    '00000000-0000-4000-8000-0000000c1801',
    %L::date, 'matutino')
$$,
  (SELECT valor FROM c18 WHERE clave = 'reclamo_p2'),
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5),
  '23514', 'capacidad_diaria_insuficiente',
  'Mover una reserva al sabado respeta las 4 h');

-- -----------------------------------------------------------------------------
-- 20. El CHECK impide guardar reclamos mayores a la jornada completa.
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  INSERT INTO public.reclamos_proceso_operador (
    orden_id, partida_id, operador_id, fecha, turno, horas_estimadas, estado
  ) VALUES (
    '00000000-0000-4000-8000-0000000c1830',
    '00000000-0000-4000-8000-0000000c1844',
    '00000000-0000-4000-8000-0000000c1801',
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino', 10, 'activo')
$$, '23514', NULL, 'Un reclamo de 10 h no se puede guardar');

-- -----------------------------------------------------------------------------
-- 21-24. A3: el respaldo de recurso nunca sale del grupo del equipo.
-- -----------------------------------------------------------------------------
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c1851',
  '00000000-0000-4000-8000-0000000c1830',
  '00000000-0000-4000-8000-0000000c1845',
  '00000000-0000-4000-8000-0000000c1821', 1, 'programada',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 2, 'matutino', 5,
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1845')
);

-- El unico equipo del grupo G1 queda sin capacidad ese dia.
INSERT INTO public.excepciones_capacidad_recurso (
  recurso_id, fecha, turno, horas_capacidad, motivo
) VALUES (
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 2,
  'matutino', 0, 'Mantenimiento de prueba C18'
);

INSERT INTO c18 (clave, valor)
SELECT 'reclamo_p5', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c1830',
  '00000000-0000-4000-8000-0000000c1845',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c1845'),
  '00000000-0000-4000-8000-0000000c1801',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 2, 'matutino');

SELECT throws_ok(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c1801')
$$, (SELECT valor FROM c18 WHERE clave = 'reclamo_p5')),
  '23514', 'sin_recurso_disponible',
  'Sin equipo libre del mismo grupo no se toma otra maquina');

SELECT is((
  SELECT recurso_id FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c1851'
), '00000000-0000-4000-8000-0000000c1821'::uuid,
  'La programacion conserva su recurso original');

SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c1845'
), 1, 'No se duplica la programacion al fallar el respaldo');

SELECT * FROM finish();
ROLLBACK;
