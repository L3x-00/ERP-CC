-- C9.3 / P-03 B — las horas reales reducen el saldo reservado sin reescribir
-- el estimado histórico; el exceso queda visible y una pausa conserva capacidad
-- hasta que Producción registra la liberación formal del recurso.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(19);

SELECT has_function(
  'public', 'obtener_carga_capacidad_diaria', ARRAY['date', 'date'],
  'La RPC de capacidad conserva su firma pública'
);
SELECT ok(
  (SELECT p.prosecdef FROM pg_proc AS p
   WHERE p.oid = 'public.obtener_carga_capacidad_diaria(date,date)'::regprocedure),
  'La RPC de capacidad es SECURITY DEFINER'
);
SELECT ok(
  (SELECT 'search_path=' = ANY (
     array(SELECT left(opcion, 12) FROM unnest(p.proconfig) AS opcion)
   )
   FROM pg_proc AS p
   WHERE p.oid = 'public.obtener_carga_capacidad_diaria(date,date)'::regprocedure),
  'La RPC fija un search_path vacío'
);
SELECT ok(
  has_function_privilege(
    'service_role', 'public.obtener_carga_capacidad_diaria(date,date)', 'EXECUTE'
  ),
  'service_role conserva EXECUTE sobre la RPC'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c9301', 'c93-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c9301';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c9310', 'Cliente C93', 'Cliente C93 SA de CV');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c9320', 'OP-993300',
  '00000000-0000-4000-8000-0000000c9310', 'en_proceso', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-0000000c9331', '00000000-0000-4000-8000-0000000c9320', 'C93-A', 1, 'pieza', '00000000-0000-4000-8000-0000000c9301'),
  ('00000000-0000-4000-8000-0000000c9332', '00000000-0000-4000-8000-0000000c9320', 'C93-B', 1, 'pieza', '00000000-0000-4000-8000-0000000c9301'),
  ('00000000-0000-4000-8000-0000000c9333', '00000000-0000-4000-8000-0000000c9320', 'C93-C', 1, 'pieza', '00000000-0000-4000-8000-0000000c9301'),
  ('00000000-0000-4000-8000-0000000c9334', '00000000-0000-4000-8000-0000000c9320', 'C93-D', 1, 'pieza', '00000000-0000-4000-8000-0000000c9301');

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo) VALUES
  ('00000000-0000-4000-8000-0000000c9341', 'C93-R1', 'taller', 'Recurso C93 1', true),
  ('00000000-0000-4000-8000-0000000c9342', 'C93-R2', 'taller', 'Recurso C93 2', true),
  ('00000000-0000-4000-8000-0000000c9343', 'C93-R3', 'taller', 'Recurso C93 3', true),
  ('00000000-0000-4000-8000-0000000c9344', 'C93-R4', 'taller', 'Recurso C93 4', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c9341', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9342', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9343', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9344', 'matutino', 8);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-0000000c9351', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9331', '00000000-0000-4000-8000-0000000c9341', 1, 'en_proceso', current_date, 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9352', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9332', '00000000-0000-4000-8000-0000000c9342', 1, 'completada', current_date + 1, 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9353', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9333', '00000000-0000-4000-8000-0000000c9343', 1, 'completada', current_date + 2, 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c9354', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9334', '00000000-0000-4000-8000-0000000c9344', 1, 'bloqueada', current_date + 3, 'matutino', 8);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_brutas, horas_netas, piezas_producidas, recurso_liberado
) VALUES
  ('00000000-0000-4000-8000-0000000c9361', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9331', '00000000-0000-4000-8000-0000000c9351', '00000000-0000-4000-8000-0000000c9301', 'finalizada', now() - interval '4 hours', now() - interval '1 hour', 3, 3, 1, false),
  ('00000000-0000-4000-8000-0000000c9362', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9332', '00000000-0000-4000-8000-0000000c9352', '00000000-0000-4000-8000-0000000c9301', 'finalizada', now() - interval '4 hours', now() - interval '1 hour', 3, 3, 1, false),
  ('00000000-0000-4000-8000-0000000c9363', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9333', '00000000-0000-4000-8000-0000000c9353', '00000000-0000-4000-8000-0000000c9301', 'finalizada', now() - interval '11 hours', now() - interval '1 hour', 10, 10, 1, false),
  ('00000000-0000-4000-8000-0000000c9364', '00000000-0000-4000-8000-0000000c9320', '00000000-0000-4000-8000-0000000c9334', '00000000-0000-4000-8000-0000000c9354', '00000000-0000-4000-8000-0000000c9301', 'pausada', now() - interval '3 hours', now() - interval '1 hour', 2, 2, 0, false);

SET LOCAL ROLE service_role;

SELECT lives_ok($$SELECT * FROM public.obtener_carga_capacidad_diaria(current_date, current_date + 3)$$,
  'service_role puede consultar la capacidad C9.3');
SELECT is((SELECT horas_programadas FROM public.obtener_carga_capacidad_diaria(current_date, current_date) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9341'), 5::numeric,
  'Las 3 horas reales descuentan el saldo ocupado de 8 a 5');
SELECT is((SELECT horas_reales FROM public.obtener_carga_capacidad_diaria(current_date, current_date) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9341'), 3::numeric,
  'La carga expone las horas reales');
SELECT is((SELECT horas_exceso FROM public.obtener_carga_capacidad_diaria(current_date, current_date) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9341'), 0::numeric,
  'Sin rebasar el estimado no hay exceso');
SELECT is((SELECT horas_estimadas FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000c9351'), 8::numeric,
  'El estimado histórico permanece intacto');
SELECT is((SELECT horas_programadas FROM public.obtener_carga_capacidad_diaria(current_date + 1, current_date + 1) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9342'), 0::numeric,
  'Una programación completada ya no ocupa capacidad');
SELECT is((SELECT horas_reales FROM public.obtener_carga_capacidad_diaria(current_date + 1, current_date + 1) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9342'), 3::numeric,
  'La programación completada conserva sus horas reales');
SELECT is((SELECT horas_exceso FROM public.obtener_carga_capacidad_diaria(current_date + 2, current_date + 2) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9343'), 2::numeric,
  'El trabajo por encima del estimado se expone como exceso');
SELECT is((SELECT horas_estimadas FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000c9353'), 8::numeric,
  'El exceso tampoco reescribe el estimado');
SELECT is((SELECT horas_programadas FROM public.obtener_carga_capacidad_diaria(current_date + 3, current_date + 3) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9344'), 6::numeric,
  'Una pausa no liberada conserva el saldo ocupado');

RESET ROLE;
UPDATE public.sesiones_trabajo SET recurso_liberado = true
WHERE id = '00000000-0000-4000-8000-0000000c9364';
SET LOCAL ROLE service_role;

SELECT is((SELECT horas_programadas FROM public.obtener_carga_capacidad_diaria(current_date + 3, current_date + 3) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9344'), 0::numeric,
  'La liberación formal elimina el saldo ocupado durante el bloqueo');
SELECT is((SELECT horas_reales FROM public.obtener_carga_capacidad_diaria(current_date + 3, current_date + 3) WHERE recurso_id = '00000000-0000-4000-8000-0000000c9344'), 2::numeric,
  'Liberar el recurso no borra las horas reales');
SELECT ok(NOT has_function_privilege('authenticated', 'public.obtener_carga_capacidad_diaria(date,date)', 'EXECUTE'),
  'authenticated no ejecuta la función privilegiada');
SELECT ok(NOT has_function_privilege('anon', 'public.obtener_carga_capacidad_diaria(date,date)', 'EXECUTE'),
  'anon no ejecuta la función privilegiada');
SELECT is((SELECT count(*)::integer FROM public.obtener_carga_capacidad_diaria(current_date, current_date + 3) WHERE horas_exceso > 0), 1,
  'El rango informa exactamente una programación con exceso');

SELECT * FROM finish();
ROLLBACK;
