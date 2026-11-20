-- C31/A2: una operación bloqueada sin sesión tiene salida auditada.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000c31a2001', 'c31a2-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a2002', 'c31a2-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a2003', 'c31a2-vendedor@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a200e', 'c31a2-gerente@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin A2'
WHERE id = '00000000-0000-4000-8000-0000c31a2001';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador A2'
WHERE id = '00000000-0000-4000-8000-0000c31a2002';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor A2'
WHERE id = '00000000-0000-4000-8000-0000c31a2003';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente A2'
WHERE id = '00000000-0000-4000-8000-0000c31a200e';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000c31a2004', 'Cliente C31A2 SA', 'C31A2', 'activo');
INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000c31a2005', 'C31A2ACERO', 'Acero C31A2');
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES
  ('00000000-0000-4000-8000-0000c31a2006', 'C31A2-LASER-1', 'Láser A2 1', 'taller', true),
  ('00000000-0000-4000-8000-0000c31a2007', 'C31A2-LASER-2', 'Láser A2 2', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES
  ('00000000-0000-4000-8000-0000c31a2006', 'matutino', 8),
  ('00000000-0000-4000-8000-0000c31a2007', 'matutino', 8);
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000c31a2008', 'OP-993211', '00000000-0000-4000-8000-0000c31a2004', 'pausada', current_date + 10);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, catalogo_material_id, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000c31a2009', '00000000-0000-4000-8000-0000c31a2008',
  'C31A2-P1', 'Pieza bloqueada', 5, 'pieza', ARRAY['LASER_FIBRA'],
  '00000000-0000-4000-8000-0000c31a2005', '00000000-0000-4000-8000-0000c31a2002');
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a2008',
   '00000000-0000-4000-8000-0000c31a2009', '00000000-0000-4000-8000-0000c31a2006',
   1, 'bloqueada', current_date, 'matutino', 4,
   (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a2009' ORDER BY secuencia LIMIT 1)),
  ('00000000-0000-4000-8000-0000c31a200b', '00000000-0000-4000-8000-0000c31a2008',
   '00000000-0000-4000-8000-0000c31a2009', '00000000-0000-4000-8000-0000c31a2007',
   2, 'bloqueada', current_date, 'matutino', 4, NULL);
INSERT INTO public.reclamos_proceso_operador (
  id, orden_id, partida_id, meta_proceso_id, programacion_id, operador_id,
  fecha, turno, horas_estimadas, estado
) VALUES (
  '00000000-0000-4000-8000-0000c31a200c', '00000000-0000-4000-8000-0000c31a2008',
  '00000000-0000-4000-8000-0000c31a2009',
  (SELECT id FROM public.metas_proceso_partida WHERE partida_id = '00000000-0000-4000-8000-0000c31a2009' ORDER BY secuencia LIMIT 1),
  '00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a2002',
  current_date, 'matutino', 4, 'activo');

-- 1-2. Grants.
SELECT ok(has_function_privilege('service_role',
  'public.reabrir_operacion_bloqueada(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role puede reabrir la operación');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.reabrir_operacion_bloqueada(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no puede invocar la RPC directamente');

CREATE TEMP TABLE resultado_a2 AS
SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a2001',
  '00000000-0000-4000-8000-0000c31a2c01'::uuid) AS json;

-- 3-8. Primera reapertura.
SELECT is((SELECT json->>'estado_planeacion' FROM resultado_a2), 'programada',
  'La operación bloqueada vuelve a programada');
SELECT is((SELECT estado FROM public.reclamos_proceso_operador
  WHERE id = '00000000-0000-4000-8000-0000c31a200c'), 'liberado',
  'Se cierra el reclamo activo');
SELECT is((SELECT operador_asignado_id FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000c31a2009'), NULL,
  'Se limpia la asignación si ya no hay reclamos activos');
SELECT is((SELECT json->>'reabierta_por_nombre' FROM resultado_a2), 'Admin A2',
  'El resultado nombra al actor real');
SELECT ok(EXISTS(
  SELECT 1 FROM public.orden_eventos_cambio
  WHERE orden_id = '00000000-0000-4000-8000-0000c31a2008'
    AND tipo = 'reapertura_operacion_bloqueada'
), 'La reapertura deja auditoría con su propio tipo');
SELECT is((SELECT json->>'reclamos_liberados' FROM resultado_a2), '1',
  'El mensaje sabe cuántos reclamos se cerraron');

-- 9-11. Replay con el mismo correlation.
CREATE TEMP TABLE resultado_replay AS
SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a2001',
  '00000000-0000-4000-8000-0000c31a2c01'::uuid) AS json;
SELECT is((SELECT json->>'ya_aplicado' FROM resultado_replay), 'true',
  'El replay se identifica como ya aplicado');
SELECT is((SELECT count(*)::int FROM public.orden_eventos_cambio
  WHERE orden_id = '00000000-0000-4000-8000-0000c31a2008'
    AND tipo = 'reapertura_operacion_bloqueada'), 1,
  'El replay no duplica la auditoría');
SELECT throws_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a2001',
  NULL::uuid)$$, '23514', 'operacion_no_bloqueada',
  'Una operación ya programada no se reapertura sin correlation');

-- 12. Correlation ligado al actor.
SELECT throws_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200a', '00000000-0000-4000-8000-0000c31a200e',
  '00000000-0000-4000-8000-0000c31a2c01'::uuid)$$,
  '22023', 'conflicto_idempotencia', 'El correlation no sirve para otro actor');

-- 13. Sesión activa impide reabrir.
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio,
  estado_sesion, horas_netas, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-0000c31a200d', '00000000-0000-4000-8000-0000c31a2008',
  '00000000-0000-4000-8000-0000c31a2009', '00000000-0000-4000-8000-0000c31a200b',
  '00000000-0000-4000-8000-0000c31a2002', now(), 'activa', 0, 0);
SELECT throws_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200b', '00000000-0000-4000-8000-0000c31a2001',
  '00000000-0000-4000-8000-0000c31a2c02'::uuid)$$,
  '23514', 'sesion_pendiente', 'No se reapertura una operación con sesión en curso');

-- 14. Una sesión inválida no bloquea (misma regla del diagnóstico C23).
UPDATE public.sesiones_trabajo SET sesion_invalida = true
WHERE id = '00000000-0000-4000-8000-0000c31a200d';
SELECT lives_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200b', '00000000-0000-4000-8000-0000c31a2001',
  '00000000-0000-4000-8000-0000c31a2c03'::uuid)$$,
  'Una sesión inválida no impide reabrir');

-- 15. Sin permiso.
SELECT throws_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a200b', '00000000-0000-4000-8000-0000c31a2003',
  '00000000-0000-4000-8000-0000c31a2c04'::uuid)$$,
  '42501', 'sin_permiso_reabrir_operacion', 'Un actor sin permiso no reabre');

-- 16. Programación inexistente.
SELECT throws_ok($$SELECT public.reabrir_operacion_bloqueada(
  '00000000-0000-4000-8000-0000c31a2fff', '00000000-0000-4000-8000-0000c31a2001',
  '00000000-0000-4000-8000-0000c31a2c05'::uuid)$$,
  'P0002', 'programacion_inexistente', 'La operación debe existir');

-- 17. El flujo C11 de preparación sigue intacto.
SELECT throws_ok($$SELECT * FROM public.liberar_preparacion_planeacion_auditada(
  '00000000-0000-4000-8000-0000c31a200a',
  (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-0000c31a200a'),
  '00000000-0000-4000-8000-0000c31a2001', NULL::uuid)$$,
  '23514', 'transicion_preparacion_no_permitida',
  'La RPC de preparación de C11 conserva su regla de transición');

SELECT * FROM finish();
ROLLBACK;
