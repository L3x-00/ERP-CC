-- C9.4 / P-17 — Producción inicia desde la programación preparada y conserva
-- el recurso asignado a ella; no recaptura recurso, fecha ni turno.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT has_function(
  'public', 'iniciar_sesion_trabajo_operador',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'jsonb', 'uuid'],
  'La sesión conserva el contrato de seis argumentos'
);
SELECT ok(
  (SELECT p.prosecdef
   FROM pg_proc AS p
   WHERE p.oid = 'public.iniciar_sesion_trabajo_operador(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure),
  'La sesión inicia como SECURITY DEFINER'
);
SELECT ok(
  (SELECT 'search_path=' = ANY (
    array(SELECT left(opcion, 12) FROM unnest(p.proconfig) AS opcion)
  )
  FROM pg_proc AS p
  WHERE p.oid = 'public.iniciar_sesion_trabajo_operador(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure),
  'La sesión fija un search_path vacío'
);
SELECT ok(
  has_function_privilege(
    'service_role', 'public.iniciar_sesion_trabajo_operador(uuid,uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE'
  ),
  'service_role conserva EXECUTE sobre el inicio de sesión'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    CROSS JOIN LATERAL unnest(p.proargnames) AS argumento(nombre)
    WHERE p.oid = 'public.iniciar_sesion_trabajo_operador(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure
      AND argumento.nombre IN ('p_recurso_id', 'p_fecha_programada', 'p_turno')
  ),
  'El contrato no permite recapturar recurso, fecha ni turno'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c9401', 'c94-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c9401';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c9410', 'Cliente C94', 'Cliente C94 SA de CV');
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000c9420', 'C94-R1', 'Recurso C94', 'taller', true);
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c9430', 'OP-994000',
  '00000000-0000-4000-8000-0000000c9410', 'programada', current_date + 10);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000c9440', '00000000-0000-4000-8000-0000000c9430',
  'C94-A', 1, 'pieza', ARRAY['LASER_FIBRA'], '00000000-0000-4000-8000-0000000c9401'
);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000c9450', '00000000-0000-4000-8000-0000000c9430',
  '00000000-0000-4000-8000-0000000c9440', '00000000-0000-4000-8000-0000000c9420',
  1, 'en_preparacion', current_date, 'matutino', 1
);

SET LOCAL ROLE service_role;
UPDATE public.programacion_areas SET estado_planeacion = 'programada'
WHERE id = '00000000-0000-4000-8000-0000000c9450';
SELECT throws_ok($$
  SELECT * FROM public.iniciar_sesion_trabajo_operador(
    '00000000-0000-4000-8000-0000000c9430', '00000000-0000-4000-8000-0000000c9440',
    '00000000-0000-4000-8000-0000000c9450', '00000000-0000-4000-8000-0000000c9401',
    jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
      'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo')
  )
$$, '23514', 'programacion_no_preparada', 'No inicia fuera de en_preparacion');

UPDATE public.programacion_areas SET estado_planeacion = 'en_preparacion'
WHERE id = '00000000-0000-4000-8000-0000000c9450';
CREATE TEMP TABLE c94 (clave text PRIMARY KEY, valor jsonb);
INSERT INTO c94 (clave, valor)
SELECT 'sesion', to_jsonb(sesion.*)
FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c9430', '00000000-0000-4000-8000-0000000c9440',
  '00000000-0000-4000-8000-0000000c9450', '00000000-0000-4000-8000-0000000c9401',
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo')
) AS sesion;
SELECT is((SELECT valor->>'estado_sesion' FROM c94 WHERE clave = 'sesion'), 'activa',
  'La sesión inicia activa desde la programación preparada');
SELECT is((SELECT valor->>'programacion_id' FROM c94 WHERE clave = 'sesion'),
  '00000000-0000-4000-8000-0000000c9450', 'La sesión conserva la programación elegida');
SELECT is((
  SELECT programacion.recurso_id
  FROM public.sesiones_trabajo AS sesion
  JOIN public.programacion_areas AS programacion ON programacion.id = sesion.programacion_id
  WHERE sesion.id = (SELECT (valor->>'id')::uuid FROM c94 WHERE clave = 'sesion')
), '00000000-0000-4000-8000-0000000c9420'::uuid,
  'La sesión consume el recurso de su programación sin recapturarlo');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c9450'), 'en_proceso',
  'El inicio avanza la programación elegida a en_proceso');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
