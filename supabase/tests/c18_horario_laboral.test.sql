-- C18/C24 - Horario laboral de la empresa.
-- C24 (regla del PO 2026-11-18): la jornada es continua y de 8 h de lunes a
-- viernes, 4 h el sabado y domingo cerrado. Matutino y vespertino son solo
-- etiquetas visuales: no reparten la capacidad ni limitan las horas.
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
  -- Compatibilidad: un recurso historico con filas de 8 h conserva la jornada
  -- del dia como tope; las filas de `capacidades_recurso_turno` ya no restan.
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
-- 1-8. Horario: jornada continua de 8 h y etiquetas de turno sin reparto.
-- -----------------------------------------------------------------------------
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes')),
  8::numeric, 'La jornada de lunes a viernes es de 8 h');
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5),
  4::numeric, 'La jornada del sabado es de 4 h');
SELECT is(privado.jornada_laboral_dia((SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6),
  0::numeric, 'El domingo no tiene jornada');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  8::numeric, 'El matutino ve la jornada completa de lunes a viernes');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'vespertino'),
  8::numeric, 'El vespertino tambien ve la jornada completa');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'nocturno'),
  0::numeric, 'El nocturno queda sin capacidad');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino'),
  4::numeric, 'El sabado tiene 4 h para la etiqueta matutino');
SELECT is(privado.horas_turno_horario_laboral(
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'vespertino'),
  4::numeric, 'El sabado tambien tiene 4 h para la etiqueta vespertino');

-- -----------------------------------------------------------------------------
-- 9-13. Capacidad efectiva = equipos x jornada del dia; el turno no interviene.
-- -----------------------------------------------------------------------------
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  16::numeric, 'Dos equipos suman 16 h de lunes a viernes');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'vespertino'),
  16::numeric, 'La etiqueta vespertino ya no resta capacidad');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'matutino'),
  8::numeric, 'Dos equipos el sabado suman 8 h');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1821',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5, 'vespertino'),
  8::numeric, 'El sabado por la tarde la etiqueta ve las mismas 8 h');
SELECT is(privado.obtener_capacidad_efectiva_recurso_turno(
  '00000000-0000-4000-8000-0000000c1823',
  (SELECT valor::date FROM c18 WHERE clave = 'lunes'), 'matutino'),
  8::numeric, 'Un equipo con filas historicas de 8 h conserva 8 h de jornada');

-- -----------------------------------------------------------------------------
-- 14-18. Carga diaria: una sola fila por equipo y dia.
-- -----------------------------------------------------------------------------
SELECT is((
  SELECT count(*)::integer FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'),
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'))
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 1, 'La carga diaria devuelve una fila por equipo, no una por turno');
SELECT is((
  SELECT turno FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'),
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'))
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 'jornada', 'La fila diaria se etiqueta como jornada completa');
SELECT is((
  SELECT horas_capacidad FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'),
    (SELECT valor::date FROM c18 WHERE clave = 'lunes'))
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 16::numeric, 'La fila diaria trae la capacidad completa del equipo');
SELECT is((
  SELECT horas_capacidad FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5,
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 5)
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 8::numeric, 'El sabado aparece con la jornada de 4 h por equipo');
SELECT is((
  SELECT count(*)::integer FROM public.obtener_carga_capacidad_diaria(
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6,
    (SELECT valor::date FROM c18 WHERE clave = 'lunes') + 6)
  WHERE recurso_id = '00000000-0000-4000-8000-0000000c1821'
), 0, 'El domingo no aparece en la carga');

-- -----------------------------------------------------------------------------
-- 19-25. El reclamo del operador respeta la jornada continua del dia.
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
  'El operador no rebasa las 8 h del dia con dos reclamos de 5 h');

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
-- 26. El CHECK impide guardar reclamos mayores a la jornada completa.
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
-- 27-29. A3: el respaldo de recurso nunca sale del grupo del equipo.
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

-- C24: el error dice exactamente por que no hay equipo, no un texto generico.
SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c1801')
$$, (SELECT valor FROM c18 WHERE clave = 'reclamo_p5')),
  'recurso_sin_capacidad%',
  'Sin equipo con capacidad se explica la causa exacta');

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
