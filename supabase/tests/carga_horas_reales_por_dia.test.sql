-- Las horas reales de la carga diaria se atribuyen al día en que se trabajaron,
-- no a la fecha de la programación. Antes dos sesiones de la misma programación
-- (lunes y martes) sumaban 4 h en la columna del martes y 0 en la del lunes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

SELECT is(
  privado.horas_sesion_en_fecha(
    (((date_trunc('week', current_date)::date)::timestamp + interval '14 hours') AT TIME ZONE 'America/Tijuana'),
    (((date_trunc('week', current_date)::date)::timestamp + interval '16 hours') AT TIME ZONE 'America/Tijuana'),
    date_trunc('week', current_date)::date
  ),
  2::numeric,
  'Una sesión de 14 a 16 h locales aporta 2 h a ese día'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000d0201', 'carga-dia-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000d0201';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000d0210', 'Cliente día', 'Cliente día SA de CV');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000d0220', 'OP-990200',
  '00000000-0000-4000-8000-0000000d0210', 'en_proceso', current_date + 30);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000d0231', '00000000-0000-4000-8000-0000000d0220',
  'DIA-1', 1, 'pieza', '00000000-0000-4000-8000-0000000d0201'
);
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000d0241', 'DIA-R1', 'taller', 'Recurso dos días', true);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000d0251', '00000000-0000-4000-8000-0000000d0220',
  '00000000-0000-4000-8000-0000000d0231', '00000000-0000-4000-8000-0000000d0241',
  1, 'bloqueada', date_trunc('week', current_date)::date + 1, 'matutino', 8
);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_brutas, horas_netas, piezas_producidas
) VALUES
  ('00000000-0000-4000-8000-0000000d0261', '00000000-0000-4000-8000-0000000d0220',
   '00000000-0000-4000-8000-0000000d0231', '00000000-0000-4000-8000-0000000d0251',
   '00000000-0000-4000-8000-0000000d0201', 'finalizada',
   (((date_trunc('week', current_date)::date)::timestamp + interval '14 hours') AT TIME ZONE 'America/Tijuana'),
   (((date_trunc('week', current_date)::date)::timestamp + interval '16 hours') AT TIME ZONE 'America/Tijuana'),
   2, 2, 1),
  ('00000000-0000-4000-8000-0000000d0262', '00000000-0000-4000-8000-0000000d0220',
   '00000000-0000-4000-8000-0000000d0231', '00000000-0000-4000-8000-0000000d0251',
   '00000000-0000-4000-8000-0000000d0201', 'finalizada',
   (((date_trunc('week', current_date)::date + 1)::timestamp + interval '9 hours') AT TIME ZONE 'America/Tijuana'),
   (((date_trunc('week', current_date)::date + 1)::timestamp + interval '11 hours') AT TIME ZONE 'America/Tijuana'),
   2, 2, 1);

SET LOCAL ROLE service_role;

SELECT is((
  SELECT horas_reales
  FROM public.obtener_carga_capacidad_diaria(
    date_trunc('week', current_date)::date,
    date_trunc('week', current_date)::date + 1
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0241'
    AND fecha_programada = date_trunc('week', current_date)::date
), 2::numeric, 'El lunes conserva las 2 h trabajadas ese día, aunque la programación sea del martes');

SELECT is((
  SELECT horas_reales
  FROM public.obtener_carga_capacidad_diaria(
    date_trunc('week', current_date)::date,
    date_trunc('week', current_date)::date + 1
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0241'
    AND fecha_programada = date_trunc('week', current_date)::date + 1
), 2::numeric, 'El martes solo registra sus 2 h, no las 4 h de la programación');

SELECT is((
  SELECT horas_programadas
  FROM public.obtener_carga_capacidad_diaria(
    date_trunc('week', current_date)::date,
    date_trunc('week', current_date)::date + 1
  )
  WHERE recurso_id = '00000000-0000-4000-8000-0000000d0241'
    AND fecha_programada = date_trunc('week', current_date)::date + 1
), 4::numeric, 'La reserva pendiente sigue descontando las 4 h trabajadas en total');

SELECT * FROM finish();
ROLLBACK;
