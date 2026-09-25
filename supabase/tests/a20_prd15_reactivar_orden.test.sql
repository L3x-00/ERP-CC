BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000e0001', 'prd15-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000e0002', 'prd15-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000e0001';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000e0002';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000e0010', 'Cliente PRD-15', 'Cliente PRD-15 SA', 'activo');
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000e0040', 'PRD15-REC', 'taller', 'Recurso PRD-15', true);

-- Orden completada con ejecución previa (sesión y avance) que debe preservarse.
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000e0020', 'OP-993150',
  '00000000-0000-4000-8000-0000000e0010', 'en_proceso', now() + interval '5 days');
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000e0030', '00000000-0000-4000-8000-0000000e0020',
  'P15-1', 5, 'pza', '00000000-0000-4000-8000-0000000e0002'
);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000e0050', '00000000-0000-4000-8000-0000000e0020',
  '00000000-0000-4000-8000-0000000e0030', '00000000-0000-4000-8000-0000000e0040',
  1, 'completada', current_date, 'matutino', 2
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, estado_sesion,
  fecha_inicio, fecha_fin, horas_brutas, horas_netas, piezas_producidas
) VALUES (
  '00000000-0000-4000-8000-0000000e0060', '00000000-0000-4000-8000-0000000e0020',
  '00000000-0000-4000-8000-0000000e0030', '00000000-0000-4000-8000-0000000e0050',
  '00000000-0000-4000-8000-0000000e0002', 'finalizada',
  now() - interval '3 hours', now() - interval '1 hour', 2, 2, 5
);
SELECT * FROM public.registrar_avance_partida_op(
  '00000000-0000-4000-8000-0000000e0030', '00000000-0000-4000-8000-0000000e0002', 5, 0);

SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000e0020'), 'completada',
  'La ejecución previa completó la orden');

SELECT ok(NOT has_function_privilege('authenticated',
  'public.reactivar_orden_op(uuid,timestamptz,uuid)', 'EXECUTE'),
  'Un JWT no ejecuta la reactivación');
SELECT ok(NOT has_function_privilege('anon',
  'public.reactivar_orden_op(uuid,timestamptz,uuid)', 'EXECUTE'),
  'Un visitante tampoco ejecuta la reactivación');
SELECT ok(has_function_privilege('service_role',
  'public.reactivar_orden_op(uuid,timestamptz,uuid)', 'EXECUTE'),
  'El servidor sí ejecuta la reactivación');

SELECT throws_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0020', now() - interval '1 day',
  '00000000-0000-4000-8000-0000000e0001'),
  '23514', 'orden_desactualizada', 'Un CAS vencido rechaza la reactivación');
SELECT throws_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0020',
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000e0020'),
  '00000000-0000-4000-8000-0000000e0002'),
  '42501', 'sin_permiso_reactivar_orden', 'Un operador sin permiso no reactiva');

-- AR cobrable (entrega activada): no se reabre.
INSERT INTO public.cuentas_por_cobrar (
  orden_id, cliente_id, monto_total, saldo_pendiente, moneda, tipo_cambio_origen,
  estado, cobrable_desde, fecha_vencimiento
) VALUES (
  '00000000-0000-4000-8000-0000000e0020', '00000000-0000-4000-8000-0000000e0010',
  100, 100, 'MXN', 1, 'pendiente', now(), now() + interval '30 days'
);
SELECT throws_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0020',
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000e0020'),
  '00000000-0000-4000-8000-0000000e0001'),
  '23514', 'orden_entregada_no_reactivable',
  'Una cuenta ya cobrable impide reactivar la orden');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000e0020'), 'completada',
  'El rechazo financiero conserva la orden completada');

-- Anticipo no estructurado: la cuenta sigue no cobrable; se permite reactivar.
DELETE FROM public.cuentas_por_cobrar WHERE orden_id = '00000000-0000-4000-8000-0000000e0020';
SELECT lives_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0020',
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000e0020'),
  '00000000-0000-4000-8000-0000000e0001'),
  'El admin reactiva una orden completada sin entrega ni cobros');
SELECT is((SELECT estado FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000e0020'), 'en_proceso',
  'La orden vuelve a operación');
SELECT ok((SELECT fecha_fin IS NULL FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-0000000e0020'),
  'La reactivación limpia el cierre sin tocar el inicio');
SELECT is((SELECT count(*)::integer FROM public.sesiones_trabajo
  WHERE orden_id = '00000000-0000-4000-8000-0000000e0020'), 1,
  'La sesión previa se conserva');
SELECT is((SELECT count(*)::integer FROM public.registros_avance_partida AS avance
  JOIN public.partidas_orden_produccion AS partida ON partida.id = avance.partida_id
  WHERE partida.orden_id = '00000000-0000-4000-8000-0000000e0020'), 1,
  'Los avances previos se conservan');
SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-0000000e0030'), 5::numeric,
  'Las cantidades producidas no se reinician');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000e0050'), 'completada',
  'La programación previa no se reabre ni se duplica');

-- Orden entregada/archivada: no reactivable.
INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, fecha_compromiso, archivada_en
) VALUES (
  '00000000-0000-4000-8000-0000000e0070', 'OP-993151',
  '00000000-0000-4000-8000-0000000e0010', 'completada', now(), now()
);
SELECT throws_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0070',
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000e0070'),
  '00000000-0000-4000-8000-0000000e0001'),
  '23514', 'orden_entregada_no_reactivable',
  'Una orden archivada por entrega no se reactiva');

-- Orden en borrador: no reactivable.
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000e0080', 'OP-993152',
  '00000000-0000-4000-8000-0000000e0010', 'borrador', now());
SELECT throws_ok(format(
  'SELECT * FROM public.reactivar_orden_op(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000e0080',
  (SELECT actualizado_en FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000e0080'),
  '00000000-0000-4000-8000-0000000e0001'),
  '23514', 'orden_no_reactivable', 'Solo una orden completada puede reactivarse');

SELECT * FROM finish();
ROLLBACK;
