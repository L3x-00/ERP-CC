-- C11: liberar una preparación atrasada sin sesión iniciada.
--
-- Cubre grants, permiso del actor, CAS, transición permitida y auditoría de la
-- RPC que devuelve a `programada` una operación en `en_preparacion` de días
-- anteriores. No libera trabajo con sesión activa: eso se prueba en el flujo de
-- producción/sesiones.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-0000000c11a1', 'c11lib-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c11a1';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c11b1', 'Cliente C11', 'Cliente C11 SA de CV');

INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, fecha_compromiso
) VALUES (
  '00000000-0000-4000-8000-0000000c11c1', 'OP-991101',
  '00000000-0000-4000-8000-0000000c11b1', 'en_proceso', current_date
);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES (
  '00000000-0000-4000-8000-0000000c11d1', '00000000-0000-4000-8000-0000000c11c1',
  'C11-LIB', 1, 'pieza', ARRAY['Corte'], 60
);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c11e1', 'C11-R1', 'taller', 'Recurso C11', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c11e1', 'matutino', 8);

-- Grants: solo service_role puede invocar la RPC auditada.
SELECT ok(has_function_privilege(
  'service_role',
  'public.liberar_preparacion_planeacion_auditada(uuid,timestamptz,uuid,uuid)',
  'EXECUTE'
), 'service_role puede ejecutar la RPC de liberación');
SELECT ok(NOT has_function_privilege(
  'authenticated',
  'public.liberar_preparacion_planeacion_auditada(uuid,timestamptz,uuid,uuid)',
  'EXECUTE'
), 'authenticated no puede ejecutar la RPC directamente');
SELECT ok((
  SELECT prosecdef AND proconfig::text LIKE '%search_path=%'
  FROM pg_proc
  WHERE proname = 'liberar_preparacion_planeacion_auditada'
), 'La RPC es SECURITY DEFINER con search_path aislado');

SET LOCAL ROLE service_role;

SELECT lives_ok($$SELECT * FROM public.programar_partida_recurso_auditada(
  '00000000-0000-4000-8000-0000000c11c1', '00000000-0000-4000-8000-0000000c11d1',
  '00000000-0000-4000-8000-0000000c11e1', 1::smallint, current_date, 'matutino', 1, 1,
  '00000000-0000-4000-8000-0000000c11a1', NULL::uuid, NULL::uuid)$$,
  'La operación se programa para prepararla');

SELECT lives_ok($$SELECT * FROM public.activar_modo_preparacion(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'))$$,
  'La operación queda en preparación');

SELECT lives_ok($$SELECT * FROM public.liberar_preparacion_planeacion_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  '00000000-0000-4000-8000-0000000c11a1', NULL::uuid)$$,
  'La preparación atrasada se libera');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'
), 'programada', 'La operación vuelve a programada');

SELECT ok(EXISTS(
  SELECT 1 FROM public.orden_eventos_cambio
  WHERE orden_id = '00000000-0000-4000-8000-0000000c11c1'
    AND tipo = 'liberacion_preparacion'
), 'La liberación deja evento de auditoría en la orden');

SELECT throws_ok($$SELECT * FROM public.liberar_preparacion_planeacion_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  now() - interval '1 hour',
  '00000000-0000-4000-8000-0000000c11a1', NULL::uuid)$$,
  '23514', 'programacion_conflicto',
  'Un token de compare-and-set obsoleto no libera la preparación');

SELECT throws_ok($$SELECT * FROM public.liberar_preparacion_planeacion_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  '00000000-0000-4000-8000-0000000c11a9', NULL::uuid)$$,
  '42501', 'sin_permiso_planeacion',
  'Un actor sin permiso no puede liberar la preparación');

SELECT throws_ok($$SELECT * FROM public.liberar_preparacion_planeacion_auditada(
  (SELECT id FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  (SELECT actualizado_en FROM public.programacion_areas
   WHERE partida_id = '00000000-0000-4000-8000-0000000c11d1'),
  '00000000-0000-4000-8000-0000000c11a1', NULL::uuid)$$,
  '23514', 'transicion_preparacion_no_permitida',
  'Solo una operación en preparación puede liberarse');

SELECT * FROM finish();
ROLLBACK;
