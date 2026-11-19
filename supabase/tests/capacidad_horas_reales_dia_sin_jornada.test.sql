-- La carga diaria conserva las horas reales de un recurso liberado en una
-- fecha sin jornada laboral (domingo). Antes la fila desaparecía porque la
-- capacidad del día era 0 y la reserva ya estaba liberada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

-- Domingo de la semana siguiente: siempre una fecha futura sin jornada.
SELECT is(
  privado.jornada_laboral_dia(date_trunc('week', current_date)::date + 13),
  0::numeric,
  'El domingo siguiente no tiene jornada laboral'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000d0101', 'cap-dom-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000d0101';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000d0110', 'Cliente domingo', 'Cliente domingo SA de CV');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000d0120', 'OP-990100',
  '00000000-0000-4000-8000-0000000d0110', 'en_proceso', current_date + 30);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000d0131', '00000000-0000-4000-8000-0000000d0120', 'DOM-1', 1, 'pieza', '00000000-0000-4000-8000-0000000d0101'),
  ('00000000-0000-4000-8000-0000000d0132', '00000000-0000-4000-8000-0000000d0120', 'DOM-2', 1, 'pieza', '00000000-0000-4000-8000-0000000d0101');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo) VALUES
  ('00000000-0000-4000-8000-0000000d0141', 'DOM-R1', 'taller', 'Recurso con trabajo en domingo', true),
  ('00000000-0000-4000-8000-0000000d0142', 'DOM-R2', 'taller', 'Recurso sin trabajo en domingo', true);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000d0151', '00000000-0000-4000-8000-0000000d0120', '00000000-0000-4000-8000-0000000d0131', '00000000-0000-4000-8000-0000000d0141', 1, 'bloqueada', (date_trunc('week', current_date)::date + 13), 'matutino', 8),
  -- Programación fuera del rango consultado: sus horas no deben aparecer ni
  -- sumarse a la fila del domingo.
  ('00000000-0000-4000-8000-0000000d0152', '00000000-0000-4000-8000-0000000d0120', '00000000-0000-4000-8000-0000000d0132', '00000000-0000-4000-8000-0000000d0141', 1, 'programada', current_date + 20, 'matutino', 8);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_brutas, horas_netas, piezas_producidas, recurso_liberado
) VALUES
  ('00000000-0000-4000-8000-0000000d0161', '00000000-0000-4000-8000-0000000d0120', '00000000-0000-4000-8000-0000000d0131', '00000000-0000-4000-8000-0000000d0151', '00000000-0000-4000-8000-0000000d0101', 'finalizada', now() - interval '4 hours', now() - interval '1 hour', 2, 2, 1, true),
  -- Dos sesiones sobre la misma programación se suman (2 + 3 = 5).
  ('00000000-0000-4000-8000-0000000d0162', '00000000-0000-4000-8000-0000000d0120', '00000000-0000-4000-8000-0000000d0131', '00000000-0000-4000-8000-0000000d0151', '00000000-0000-4000-8000-0000000d0101', 'finalizada', now() - interval '1 hour', now(), 3, 3, 1, false),
  -- 100 h fuera del rango: no deben filtrarse a la fila del domingo.
  ('00000000-0000-4000-8000-0000000d0163', '00000000-0000-4000-8000-0000000d0120', '00000000-0000-4000-8000-0000000d0132', '00000000-0000-4000-8000-0000000d0152', '00000000-0000-4000-8000-0000000d0101', 'finalizada', now() - interval '4 hours', now() - interval '1 hour', 100, 100, 1, false);

SET LOCAL ROLE service_role;

SELECT is((
  SELECT horas_reales
  FROM public.obtener_carga_capacidad_diaria(
    (date_trunc('week', current_date)::date + 13),
    (date_trunc('week', current_date)::date + 13)
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0141'
), 5::numeric, 'El domingo conserva las horas reales del recurso liberado (2 + 3 de la misma programación)');

SELECT is((
  SELECT horas_programadas
  FROM public.obtener_carga_capacidad_diaria(
    (date_trunc('week', current_date)::date + 13),
    (date_trunc('week', current_date)::date + 13)
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0141'
), 0::numeric, 'La liberación formal deja el saldo ocupado en 0');

SELECT is((
  SELECT horas_capacidad
  FROM public.obtener_carga_capacidad_diaria(
    (date_trunc('week', current_date)::date + 13),
    (date_trunc('week', current_date)::date + 13)
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0141'
), 0::numeric, 'La fecha sigue sin aportar capacidad');

SELECT is((
  SELECT count(*)::integer
  FROM public.obtener_carga_capacidad_diaria(
    (date_trunc('week', current_date)::date + 13),
    (date_trunc('week', current_date)::date + 13)
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0142'
), 0, 'Un recurso sin trabajo real sigue oculto en un día sin jornada');

SELECT * FROM finish();
ROLLBACK;
