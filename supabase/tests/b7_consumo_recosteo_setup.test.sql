-- B7 — consumo con motivo/sesión, setup identificable y recosteo sin duplicar.
-- Documento de aclaraciones 06/11/2026, secciones 2 y 4.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b701', 'b7-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b702', 'b7-operador@prueba.local'),
  ('00000000-0000-4000-8000-00000000b703', 'b7-otro@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true WHERE id = '00000000-0000-4000-8000-00000000b701';
UPDATE public.usuarios SET rol = 'operador', activo = true WHERE id = '00000000-0000-4000-8000-00000000b702';
UPDATE public.usuarios SET rol = 'operador', activo = true WHERE id = '00000000-0000-4000-8000-00000000b703';

INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control
) VALUES (
  '00000000-0000-4000-8000-00000000b710', 'B7LEG', 'Material legado B7',
  'materia_prima', 'pieza', 'pieza', 1, 10, 10, 10, 1
);
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, material_legacy_id)
VALUES (
  '00000000-0000-4000-8000-00000000b711', 'B7MAT', 'Material B7', 'pieza',
  '00000000-0000-4000-8000-00000000b710'
);
SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-00000000b711', 10, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-00000000b701',
  (SELECT actualizado_en FROM public.catalogo_materiales
   WHERE id = '00000000-0000-4000-8000-00000000b711'),
  NULL
);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000b720', 'Cliente B7 SA de CV', 'Cliente B7', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES (
  '00000000-0000-4000-8000-00000000b721', 'OP-997207',
  '00000000-0000-4000-8000-00000000b720', 'en_proceso', current_date + 7
);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida,
  catalogo_material_id, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-00000000b722', '00000000-0000-4000-8000-00000000b721',
  'B7-PIEZA', 10, 'pieza', '00000000-0000-4000-8000-00000000b711',
  '00000000-0000-4000-8000-00000000b702'
);
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-00000000b730', 'B7R1', 'Recurso B7', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
) VALUES (
  '00000000-0000-4000-8000-00000000b731', '00000000-0000-4000-8000-00000000b721',
  '00000000-0000-4000-8000-00000000b722', '00000000-0000-4000-8000-00000000b730',
  current_date, 'matutino', 2, 1, 'en_proceso'
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-00000000b740', '00000000-0000-4000-8000-00000000b721',
  '00000000-0000-4000-8000-00000000b722', '00000000-0000-4000-8000-00000000b731',
  '00000000-0000-4000-8000-00000000b702', now() - interval '60 minutes'
);

CREATE TEMP TABLE b7_antes ON COMMIT DROP AS
SELECT sesion.horas_netas, sesion.costo_hora_interno
FROM public.sesiones_trabajo AS sesion
WHERE sesion.id = '00000000-0000-4000-8000-00000000b740';

-- 1-2. Columnas de trazabilidad.
SELECT has_column('public', 'registros_consumo_material', 'motivo',
  'el consumo exige un motivo (sección 2)');
SELECT has_column('public', 'registros_consumo_material', 'sesion_id',
  'el consumo queda ligado a la operación individual');

-- 3. El motivo no puede quedar vacío.
SELECT throws_ok($$SELECT public.registrar_consumo_material_op(
  '00000000-0000-4000-8000-00000000b722', '00000000-0000-4000-8000-00000000b711',
  1, 0, '   ', '00000000-0000-4000-8000-00000000b701')$$,
  '23514', 'motivo_consumo_requerido',
  'un consumo sin motivo se rechaza');

-- 4-8. Setup identificable dentro del tiempo real, sin duplicar costo.
SELECT throws_ok($$SELECT public.registrar_setup_sesion_operador(
  '00000000-0000-4000-8000-00000000b740',
  '00000000-0000-4000-8000-00000000b703', 10)$$,
  '42501', 'sin_permiso_setup',
  'solo el operador de la sesión identifica su setup');
SELECT throws_ok($$SELECT public.registrar_setup_sesion_operador(
  '00000000-0000-4000-8000-00000000b740',
  '00000000-0000-4000-8000-00000000b702', 120)$$,
  '23514', 'minutos_setup_exceden_sesion',
  'el setup no puede exceder el tiempo transcurrido');
SELECT lives_ok($$SELECT public.registrar_setup_sesion_operador(
  '00000000-0000-4000-8000-00000000b740',
  '00000000-0000-4000-8000-00000000b702', 15)$$,
  'el operador identifica 15 minutos de setup');
SELECT is((SELECT minutos_setup FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-00000000b740'),
  15::numeric, 'los minutos de setup quedan registrados');
SELECT is((SELECT row(horas_netas, costo_hora_interno)::text
  FROM public.sesiones_trabajo WHERE id = '00000000-0000-4000-8000-00000000b740'),
  (SELECT row(horas_netas, costo_hora_interno)::text FROM b7_antes),
  'identificar el setup no altera el tiempo ni el costo ya calculados');

-- 9-12. Cierre individual con motivo: registra una sola vez y liga la sesión.
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_con_consumo_operador(
  '00000000-0000-4000-8000-00000000b740',
  '00000000-0000-4000-8000-00000000b702', 3,
  '00000000-0000-4000-8000-00000000b711', 2, 0.5,
  'Consumo de producción')$$,
  'cierra la sesión registrando el consumo con motivo');
SELECT is((SELECT motivo FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b722'),
  'Consumo de producción', 'el motivo queda almacenado');
SELECT is((SELECT sesion_id FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b722'),
  '00000000-0000-4000-8000-00000000b740'::uuid,
  'el consumo queda ligado a la operación que lo produjo');
SELECT is((SELECT count(*)::integer FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b722'),
  1, 'el consumo se registra una sola vez');

-- 13-20. Recosteo: sustituye el costo provisional sin duplicar el consumo.
SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-00000000b711', 20, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-00000000b701',
  (SELECT actualizado_en FROM public.catalogo_materiales
   WHERE id = '00000000-0000-4000-8000-00000000b711'),
  NULL
);
SELECT lives_ok($$SELECT * FROM public.revaluar_costo_material_consumido(
  '00000000-0000-4000-8000-00000000b711', 20, 'MXN',
  'Costo comprobado por factura', '00000000-0000-4000-8000-00000000b7a1',
  '00000000-0000-4000-8000-00000000b701')$$,
  'administración revalúa el costo provisional');
SELECT is((SELECT consumos_actualizados FROM public.recosteo_consumos_material
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b7a1'),
  1, 'el recosteo actualiza el consumo ya registrado');
SELECT is((SELECT costo_unitario_momento FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b722'),
  20::numeric, 'el costo congelado se sustituye por el comprobado');
SELECT is((SELECT count(*)::integer FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b722'),
  1, 'el recosteo no crea un segundo consumo');
SELECT is((SELECT importe_nuevo_total FROM public.recosteo_consumos_material
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b7a1'),
  50::numeric, 'el importe nuevo corresponde a 2.5 unidades a 20 MXN');
SELECT is((SELECT count(*)::integer FROM public.recosteo_consumos_material),
  1, 'cada recosteo deja una sola cabecera de auditoría');
SELECT is((SELECT count(*)::integer FROM public.recosteo_consumos_material_detalle
  WHERE origen = 'CONSUMO'), 1,
  'el detalle registra el consumo revaluado');
SELECT is((SELECT costo_anterior_mxn FROM public.recosteo_consumos_material_detalle
  WHERE origen = 'CONSUMO'), 10::numeric,
  'el detalle conserva el costo provisional anterior');

-- 21-22. Idempotencia y conflicto de la solicitud.
SELECT lives_ok($$SELECT * FROM public.revaluar_costo_material_consumido(
  '00000000-0000-4000-8000-00000000b711', 20, 'MXN',
  'Costo comprobado por factura', '00000000-0000-4000-8000-00000000b7a1',
  '00000000-0000-4000-8000-00000000b701')$$,
  'reintentar la misma solicitud es idempotente');
SELECT throws_ok($$SELECT * FROM public.revaluar_costo_material_consumido(
  '00000000-0000-4000-8000-00000000b711', 21, 'MXN',
  'Costo comprobado por factura', '00000000-0000-4000-8000-00000000b7a1',
  '00000000-0000-4000-8000-00000000b701')$$,
  '23514', 'solicitud_recosteo_conflicto',
  'reutilizar la solicitud con otros datos se rechaza');

-- 23-25. Motivo, permiso y superficie de ejecución.
SELECT throws_ok($$SELECT * FROM public.revaluar_costo_material_consumido(
  '00000000-0000-4000-8000-00000000b711', 20, 'MXN', ' ',
  '00000000-0000-4000-8000-00000000b7a2',
  '00000000-0000-4000-8000-00000000b701')$$,
  '23514', 'motivo_recosteo_requerido',
  'el recosteo exige un motivo');
SELECT throws_ok($$SELECT * FROM public.revaluar_costo_material_consumido(
  '00000000-0000-4000-8000-00000000b711', 20, 'MXN', 'Sin permiso',
  '00000000-0000-4000-8000-00000000b7a3',
  '00000000-0000-4000-8000-00000000b703')$$,
  '42501', 'sin_permiso_materiales',
  'solo administración revalúa costos consumidos');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.revaluar_costo_material_consumido(uuid,numeric,text,text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.registrar_setup_sesion_operador(uuid,uuid,numeric)', 'EXECUTE'),
  'authenticated no ejecuta recosteo ni setup directamente');

SELECT * FROM finish();
ROLLBACK;
