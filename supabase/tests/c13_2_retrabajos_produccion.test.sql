-- C13.2 - Retrabajo con consumo de inventario y avance intacto.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000d101', 'c132-operador@prueba.local'),
  ('00000000-0000-4000-8000-00000000d102', 'c132-otro@prueba.local'),
  ('00000000-0000-4000-8000-00000000d103', 'c132-admin@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C132'
WHERE id = '00000000-0000-4000-8000-00000000d101';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Otro C132'
WHERE id = '00000000-0000-4000-8000-00000000d102';
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C132'
WHERE id = '00000000-0000-4000-8000-00000000d103';

INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control
) VALUES (
  '00000000-0000-4000-8000-00000000d104', 'C132MAT', 'Material C132',
  'materia_prima', 'pieza', 'pieza', 1, 10, 10, 10, 1
);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000d105', 'Cliente C132 SA de CV', 'Cliente C132', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-00000000d106', 'OP-998201',
  '00000000-0000-4000-8000-00000000d105', 'en_proceso', current_date + 7);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-00000000d107', '00000000-0000-4000-8000-00000000d106',
  'C132-PIEZA', 10, 'pieza', '00000000-0000-4000-8000-00000000d101'
);
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-00000000d108', 'C132R1', 'Recurso C132', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
) VALUES (
  '00000000-0000-4000-8000-00000000d109', '00000000-0000-4000-8000-00000000d106',
  '00000000-0000-4000-8000-00000000d107', '00000000-0000-4000-8000-00000000d108',
  current_date, 'matutino', 2, 1, 'en_proceso'
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d106',
  '00000000-0000-4000-8000-00000000d107', '00000000-0000-4000-8000-00000000d109',
  '00000000-0000-4000-8000-00000000d101', now()
);

-- 1-2. El operador registra el retrabajo de su sesión activa.
SELECT lives_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d104',
  2, 1, 45, 'operador', 'Pieza fuera de tolerancia', 'Se corrigió el doblez',
  '00000000-0000-4000-8000-00000000d101')$$,
  'El operador registra el retrabajo de su sesión');

SELECT is((
  SELECT count(*)::integer FROM public.retrabajos_produccion
  WHERE sesion_id = '00000000-0000-4000-8000-00000000d110'
), 1, 'El retrabajo queda registrado una sola vez');

-- 3-5. Inventario, costo y kardex.
SELECT is((
  SELECT stock_actual_control FROM public.materiales
  WHERE id = '00000000-0000-4000-8000-00000000d104'
), 7::numeric, 'El retrabajo descuenta inventario propio (2 usadas + 1 merma)');

SELECT is((
  SELECT costo_unitario_momento FROM public.retrabajos_produccion
  WHERE sesion_id = '00000000-0000-4000-8000-00000000d110'
), 10::numeric, 'Conserva el costo CPP del momento');

SELECT is((
  SELECT count(*)::integer FROM public.movimientos_inventario
  WHERE referencia_externa = 'RETRABAJO-OP'
    AND orden_id = '00000000-0000-4000-8000-00000000d106'
), 1, 'El kardex registra la salida del retrabajo');

-- 6. No altera el avance declarado.
SELECT is((
  SELECT count(*)::integer FROM public.registros_avance_partida
  WHERE partida_id = '00000000-0000-4000-8000-00000000d107'
), 0, 'El retrabajo no mueve el avance ni las metas');

-- 7-8. Validaciones de captura.
SELECT throws_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d104',
  1, 0, 0, 'operador', 'Sin tiempo', NULL,
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'minutos_retrabajo_invalidos',
  'El retrabajo exige tiempo mayor a cero');

SELECT throws_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d104',
  1, 0, 10, 'clima', 'Causa fuera de catálogo', NULL,
  '00000000-0000-4000-8000-00000000d101')$$,
  '23514', 'causa_retrabajo_invalida',
  'La causa debe ser operador, cliente, material u otro');

-- 9. Un operador ajeno no puede registrar retrabajo en otra sesión.
SELECT throws_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d104',
  1, 0, 10, 'operador', 'Intento ajeno', NULL,
  '00000000-0000-4000-8000-00000000d102')$$,
  '42501', 'sin_permiso_retrabajo',
  'Solo el operador de la sesión o producción puede registrar el retrabajo');

-- 10. Las RPC quedan reservadas al service_role.
SELECT is(has_function_privilege('anon',
  'public.registrar_retrabajo_sesion(uuid, uuid, numeric, numeric, numeric, text, text, text, uuid)',
  'execute'), false, 'anon no puede registrar retrabajos');
SELECT is(has_function_privilege('service_role',
  'public.registrar_retrabajo_sesion(uuid, uuid, numeric, numeric, numeric, text, text, text, uuid)',
  'execute'), true, 'service_role registra retrabajos');

-- 11-12. Se admite la sesión recién finalizada al cerrar.
UPDATE public.sesiones_trabajo
SET estado_sesion = 'finalizada', fecha_fin = now()
WHERE id = '00000000-0000-4000-8000-00000000d110';

SELECT lives_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000d110', '00000000-0000-4000-8000-00000000d104',
  1, 0, 15, 'cliente', 'Ajuste pedido por el cliente', NULL,
  '00000000-0000-4000-8000-00000000d101')$$,
  'Se acepta el retrabajo declarado al cerrar la sesión');

SELECT is((
  SELECT count(*)::integer FROM public.retrabajos_produccion
  WHERE sesion_id = '00000000-0000-4000-8000-00000000d110'
), 2, 'El retrabajo de cierre se suma al historial');

SELECT * FROM finish();
ROLLBACK;
