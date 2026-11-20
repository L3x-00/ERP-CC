-- C30 — El consumo de materia prima solo obliga en la primera operación.
-- Cubre O-1126_09: una operación posterior (Doblado) que consume piezas del
-- proceso previo no debe quedar bloqueada pidiendo lámina.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

-- -----------------------------------------------------------------------------
-- Fixtures: partida con dos operaciones y materia prima propia.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000c3001', 'c30-operador@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c3002', 'c30-admin@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c3001';
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c3002';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c3003', 'Cliente C30', 'Cliente C30 SA de CV');

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-0000000c3004', 'C30-CRS16', 'Lámina CRS-16', 'kg', true);

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida) VALUES
  ('C30CORTE', 'Corte C30', 'COR'),
  ('C30DOBLZ', 'Doblado C30', 'DOB');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c3005', 'OP-995501',
  '00000000-0000-4000-8000-0000000c3003', 'en_proceso', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, cantidad_producida,
  unidad_medida, procesos, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000c3006', '00000000-0000-4000-8000-0000000c3005',
  'IT02', 100, 0, 'pieza', ARRAY['Corte C30', 'Doblado C30'],
  '00000000-0000-4000-8000-0000000c3001'
);

-- Material propio: la partida sí mantiene requisito de materia prima.
UPDATE public.partidas_orden_produccion
SET catalogo_material_id = '00000000-0000-4000-8000-0000000c3004'
WHERE id = '00000000-0000-4000-8000-0000000c3006';

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000c3007', 'C30-R1', 'taller', 'Recurso C30', true);

CREATE TEMP TABLE c30_plan (clave text PRIMARY KEY, valor uuid);
INSERT INTO c30_plan (clave, valor)
SELECT 'corte', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3006' AND secuencia = 1;
INSERT INTO c30_plan (clave, valor)
SELECT 'doblado', id FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c3006' AND secuencia = 2;
GRANT SELECT ON c30_plan TO service_role;

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES
  ('00000000-0000-4000-8000-0000000c3008',
   '00000000-0000-4000-8000-0000000c3005',
   '00000000-0000-4000-8000-0000000c3006',
   '00000000-0000-4000-8000-0000000c3007',
   1, 'bloqueada', current_date, 'matutino', 4,
   (SELECT valor FROM c30_plan WHERE clave = 'corte')),
  ('00000000-0000-4000-8000-0000000c3009',
   '00000000-0000-4000-8000-0000000c3005',
   '00000000-0000-4000-8000-0000000c3006',
   '00000000-0000-4000-8000-0000000c3007',
   2, 'en_proceso', current_date, 'matutino', 4,
   (SELECT valor FROM c30_plan WHERE clave = 'doblado'));

-- El corte ya liberó 100 piezas al doblado.
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3001',
  100, 0, (SELECT valor FROM c30_plan WHERE clave = 'corte')
);

-- -----------------------------------------------------------------------------
-- 1. La partida conserva su requisito, pero solo la primera operación lo hereda.
-- -----------------------------------------------------------------------------
SELECT is(
  privado.partida_requiere_consumo_material('00000000-0000-4000-8000-0000000c3006'),
  true,
  'La partida con material propio y sin consumo sigue requiriendo material'
);

SELECT is(
  privado.proceso_consume_piezas_previas((SELECT valor FROM c30_plan WHERE clave = 'corte')),
  false,
  'El corte es la primera operación: no consume piezas previas'
);

SELECT is(
  privado.proceso_consume_piezas_previas((SELECT valor FROM c30_plan WHERE clave = 'doblado')),
  true,
  'El doblado tiene una operación previa: consume piezas, no lámina'
);

SELECT is(
  privado.partida_requiere_consumo_material_en_proceso(
    '00000000-0000-4000-8000-0000000c3006',
    (SELECT valor FROM c30_plan WHERE clave = 'corte')
  ),
  true,
  'La primera operación sí exige materia prima'
);

SELECT is(
  privado.partida_requiere_consumo_material_en_proceso(
    '00000000-0000-4000-8000-0000000c3006',
    (SELECT valor FROM c30_plan WHERE clave = 'doblado')
  ),
  false,
  'La segunda operación no exige materia prima'
);

-- -----------------------------------------------------------------------------
-- 2. El trigger de cierre deja finalizar el doblado sin consumo de lámina.
-- -----------------------------------------------------------------------------
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-0000000c3010',
  '00000000-0000-4000-8000-0000000c3005',
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3009',
  '00000000-0000-4000-8000-0000000c3001',
  'activa', now() - interval '1 hour', 40
);

SELECT lives_ok($$UPDATE public.sesiones_trabajo
  SET estado_sesion = 'finalizada', fecha_fin = now()
  WHERE id = '00000000-0000-4000-8000-0000000c3010'$$,
  'El doblado cierra con piezas y sin consumo de materia prima');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c3010'
), 'finalizada', 'La sesión posterior queda finalizada');

-- -----------------------------------------------------------------------------
-- 3. La primera operación sí sigue bloqueada sin consumo.
-- -----------------------------------------------------------------------------
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-0000000c3011',
  '00000000-0000-4000-8000-0000000c3005',
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3008',
  '00000000-0000-4000-8000-0000000c3001',
  'pausada', now() - interval '2 hours', now() - interval '1 hour', 100
);

SELECT throws_ok($$UPDATE public.sesiones_trabajo
  SET estado_sesion = 'finalizada'
  WHERE id = '00000000-0000-4000-8000-0000000c3011'$$,
  '23514', 'consumo_material_requerido',
  'La primera operación no cierra con piezas y sin consumo');

-- -----------------------------------------------------------------------------
-- 4. actualizar_avance_sesion_pausada aplica el mismo criterio.
--    Primero el corte (sigue en pausa sin consumo) y luego el doblado (finaliza).
-- -----------------------------------------------------------------------------
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, piezas_producidas, pendiente_actualizacion_avance
) VALUES (
  '00000000-0000-4000-8000-0000000c3013',
  '00000000-0000-4000-8000-0000000c3005',
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3008',
  '00000000-0000-4000-8000-0000000c3001',
  'pausada', now() - interval '3 hours', now() - interval '2 hours', 0, true
);

SELECT is((
  SELECT estado_sesion FROM public.actualizar_avance_sesion_pausada(
    '00000000-0000-4000-8000-0000000c3013'::uuid,
    '00000000-0000-4000-8000-0000000c3001'::uuid, 0, 1, 'Corte sin consumo')
), 'pausada',
  'La primera operación completa sigue en pausa si no registra consumo');

-- Material sin cantidades no es consumo asentado: la sesión no debe finalizar.
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, piezas_producidas, pendiente_actualizacion_avance
) VALUES (
  '00000000-0000-4000-8000-0000000c3014',
  '00000000-0000-4000-8000-0000000c3005',
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3008',
  '00000000-0000-4000-8000-0000000c3001',
  'pausada', now() - interval '4 hours', now() - interval '3 hours', 0, true
);

SELECT is((
  SELECT estado_sesion FROM public.actualizar_avance_sesion_pausada(
    '00000000-0000-4000-8000-0000000c3014'::uuid,
    '00000000-0000-4000-8000-0000000c3001'::uuid, 0, 1, 'Corte con material sin cantidades',
    '00000000-0000-4000-8000-0000000c3004'::uuid, 0, 0, 'Sin cantidades')
), 'pausada',
  'Un material sin cantidades no asienta consumo ni cierra la pausa');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, piezas_producidas, pendiente_actualizacion_avance
) VALUES (
  '00000000-0000-4000-8000-0000000c3012',
  '00000000-0000-4000-8000-0000000c3005',
  '00000000-0000-4000-8000-0000000c3006',
  '00000000-0000-4000-8000-0000000c3009',
  '00000000-0000-4000-8000-0000000c3001',
  'pausada', now() - interval '2 hours', now(), 0, true
);

SELECT lives_ok($$SELECT * FROM public.actualizar_avance_sesion_pausada(
  '00000000-0000-4000-8000-0000000c3012'::uuid,
  '00000000-0000-4000-8000-0000000c3001'::uuid, 100, 2, 'Doblado terminado')$$,
  'El avance del doblado no falla por consumo de materia prima');

SELECT is((
  SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c3012'
), 'finalizada', 'El avance completo del doblado cierra la pausa');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c3009'
), 'completada', 'La operación posterior queda completada, no bloqueada');

SELECT * FROM finish();
ROLLBACK;
