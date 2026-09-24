BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000a2001', 'a20-operador@prueba.local', '{"nombre_completo":"Operador A20"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a2002', 'a20-otro@prueba.local', '{"nombre_completo":"Otro A20"}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id IN ('00000000-0000-4000-8000-0000000a2001', '00000000-0000-4000-8000-0000000a2002');

INSERT INTO public.areas_trabajo_config (codigo, nombre, tipo, area_planeacion, activo, orden)
VALUES ('A20_AREA', 'Área A20', 'area', 'sheet_metal', true, 920);
INSERT INTO public.operadores_areas (operador_id, area_codigo) VALUES
  ('00000000-0000-4000-8000-0000000a2001', 'A20_AREA');
INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000a2010', 'Cliente A20', 'Cliente A20 SA de CV');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000a2020', 'OP-992001',
        '00000000-0000-4000-8000-0000000a2010', 'pausada', now() + interval '10 days');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, area_trabajo_codigo,
  operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000a2030', '00000000-0000-4000-8000-0000000a2020',
  'A20-PIEZA', 10, 'pieza', 'A20_AREA', '00000000-0000-4000-8000-0000000a2001'
);
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000a2040', 'A20-REC', 'sheet_metal', 'Recurso A20', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000a2040', 'matutino', 8);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000a2050', '00000000-0000-4000-8000-0000000a2020',
  '00000000-0000-4000-8000-0000000a2030', '00000000-0000-4000-8000-0000000a2040',
  1, 'bloqueada', current_date, 'matutino', 4
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_fin,
  horas_brutas, horas_netas, piezas_producidas, motivo_pausa
) VALUES (
  '00000000-0000-4000-8000-0000000a2060', '00000000-0000-4000-8000-0000000a2020',
  '00000000-0000-4000-8000-0000000a2030', '00000000-0000-4000-8000-0000000a2050',
  '00000000-0000-4000-8000-0000000a2001', 'pausada', now(), 1, 1, 2, 'otro'
);

SELECT is((SELECT estado_planeacion FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'), 'bloqueada', 'Cancelar el diálogo no escribe: la programación sigue bloqueada');
SELECT is((SELECT count(*)::integer FROM public.sesiones_trabajo WHERE programacion_id = '00000000-0000-4000-8000-0000000a2050'), 1, 'La pausa conserva solo la sesión histórica');
SELECT throws_ok($$
  SELECT * FROM public.reanudar_sesion_trabajo_a20(
    '00000000-0000-4000-8000-0000000a2020', '00000000-0000-4000-8000-0000000a2030',
    '00000000-0000-4000-8000-0000000a2050', '2000-01-01'::timestamptz,
    '00000000-0000-4000-8000-0000000a2001')
$$, '23514', 'programacion_conflicto', 'Un CAS vencido rechaza la reanudación');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'), 'bloqueada', 'CAS vencido no reserva el recurso');
SELECT throws_ok($$
  SELECT * FROM public.reanudar_sesion_trabajo_a20(
    '00000000-0000-4000-8000-0000000a2020', '00000000-0000-4000-8000-0000000a2030',
    '00000000-0000-4000-8000-0000000a2050',
    (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'),
    '00000000-0000-4000-8000-0000000a2002')
$$, '23514', 'operador_no_asignado_partida', 'Operador ajeno no puede reanudar');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'), 'bloqueada', 'Fallo del segundo paso revierte la reserva del primero');
SELECT ok(NOT has_function_privilege('authenticated', 'public.reanudar_sesion_trabajo_a20(uuid,uuid,uuid,timestamptz,uuid)', 'EXECUTE'), 'El rol autenticado no invoca directamente la función privilegiada');
SELECT ok(NOT has_function_privilege('anon', 'public.reanudar_sesion_trabajo_a20(uuid,uuid,uuid,timestamptz,uuid)', 'EXECUTE'), 'El rol anónimo tampoco la invoca');
UPDATE public.capacidades_recurso_turno SET horas_capacidad = 1
WHERE recurso_id = '00000000-0000-4000-8000-0000000a2040';
SELECT throws_ok($$
  SELECT * FROM public.reanudar_sesion_trabajo_a20(
    '00000000-0000-4000-8000-0000000a2020', '00000000-0000-4000-8000-0000000a2030',
    '00000000-0000-4000-8000-0000000a2050',
    (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'),
    '00000000-0000-4000-8000-0000000a2001')
$$, '23514', 'capacidad_no_disponible', 'Capacidad insuficiente bloquea reanudación');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'), 'bloqueada', 'El fallo de capacidad conserva la pausa');
UPDATE public.capacidades_recurso_turno SET horas_capacidad = 8
WHERE recurso_id = '00000000-0000-4000-8000-0000000a2040';
SELECT lives_ok($$
  SELECT * FROM public.reanudar_sesion_trabajo_a20(
    '00000000-0000-4000-8000-0000000a2020', '00000000-0000-4000-8000-0000000a2030',
    '00000000-0000-4000-8000-0000000a2050',
    (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'),
    '00000000-0000-4000-8000-0000000a2001')
$$, 'El operador asignado reanuda en una transacción');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'), 'en_proceso', 'La programación queda en proceso');
SELECT is((SELECT count(*)::integer FROM public.sesiones_trabajo WHERE programacion_id = '00000000-0000-4000-8000-0000000a2050'), 2, 'Se preserva la pausa y se crea un nuevo intervalo');
SELECT is((SELECT count(*)::integer FROM public.sesiones_trabajo WHERE programacion_id = '00000000-0000-4000-8000-0000000a2050' AND estado_sesion = 'activa'), 1, 'Solo existe una sesión activa');
SELECT throws_ok($$
  SELECT * FROM public.reanudar_sesion_trabajo_a20(
    '00000000-0000-4000-8000-0000000a2020', '00000000-0000-4000-8000-0000000a2030',
    '00000000-0000-4000-8000-0000000a2050',
    (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000000a2050'),
    '00000000-0000-4000-8000-0000000a2001')
$$, '23514', 'programacion_no_bloqueada', 'Una segunda reanudación no duplica la sesión');
SELECT * FROM finish();
ROLLBACK;
