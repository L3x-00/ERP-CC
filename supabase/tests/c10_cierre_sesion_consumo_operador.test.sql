-- C10 — cerrar sesión y consumo en una única transacción de operador.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000c701', 'c70-operador@prueba.local'),
  ('00000000-0000-4000-8000-00000000c702', 'c70-admin@prueba.local');
UPDATE public.usuarios
SET rol = 'operador', activo = true, nombre_completo = 'Operador C70'
WHERE id = '00000000-0000-4000-8000-00000000c701';
UPDATE public.usuarios
SET rol = 'admin', activo = true, nombre_completo = 'Administración C70'
WHERE id = '00000000-0000-4000-8000-00000000c702';

INSERT INTO public.materiales (
  id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control
) VALUES (
  '00000000-0000-4000-8000-00000000c703', 'C70LEG', 'Material legado C70',
  'materia_prima', 'pieza', 'pieza', 1, 10, 10, 10, 1
);
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, material_legacy_id)
VALUES (
  '00000000-0000-4000-8000-00000000c704', 'C70MAT', 'Material C70', 'pieza',
  '00000000-0000-4000-8000-00000000c703'
);
SELECT public.confirmar_costo_material(
  '00000000-0000-4000-8000-00000000c704', 10, 'MXN', current_date,
  'MANUAL', NULL, '00000000-0000-4000-8000-00000000c702',
  (SELECT actualizado_en FROM public.catalogo_materiales
   WHERE id = '00000000-0000-4000-8000-00000000c704'),
  NULL
);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000c705', 'Cliente C70 SA de CV', 'Cliente C70', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES (
  '00000000-0000-4000-8000-00000000c706', 'OP-997001',
  '00000000-0000-4000-8000-00000000c705', 'en_proceso', current_date + 7
);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida,
  catalogo_material_id, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-00000000c707', '00000000-0000-4000-8000-00000000c706',
  'C70-PIEZA', 10, 'pieza', '00000000-0000-4000-8000-00000000c704',
  '00000000-0000-4000-8000-00000000c701'
);
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-00000000c708', 'C70R1', 'Recurso C70', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
) VALUES (
  '00000000-0000-4000-8000-00000000c709', '00000000-0000-4000-8000-00000000c706',
  '00000000-0000-4000-8000-00000000c707', '00000000-0000-4000-8000-00000000c708',
  current_date, 'matutino', 2, 1, 'en_proceso'
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-00000000c710', '00000000-0000-4000-8000-00000000c706',
  '00000000-0000-4000-8000-00000000c707', '00000000-0000-4000-8000-00000000c709',
  '00000000-0000-4000-8000-00000000c701', now() - interval '30 minutes'
);

SELECT has_function(
  'public',
  'cerrar_sesion_con_consumo_operador',
  ARRAY['uuid', 'uuid', 'numeric', 'uuid', 'numeric', 'numeric', 'uuid', 'text'],
  'Existe la RPC transaccional de cierre con consumo'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.cerrar_sesion_con_consumo_operador(uuid,uuid,numeric,uuid,numeric,numeric,uuid,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.cerrar_sesion_con_consumo_operador(uuid,uuid,numeric,uuid,numeric,numeric,uuid,text)',
    'EXECUTE'
  ),
  'La RPC de cierre con consumo solo la ejecuta el servidor'
);
SELECT throws_ok(
  $$ SELECT * FROM public.cerrar_sesion_con_consumo_operador(
       '00000000-0000-4000-8000-00000000c710',
       '00000000-0000-4000-8000-00000000c701',
       1,
       '00000000-0000-4000-8000-00000000c704',
       0,
       0,
       NULL,
       NULL
     ) $$,
  '23514',
  'cierre_sesion_invalido',
  'Rechaza un cierre final sin consumo ni merma'
);
SELECT is(
  (SELECT estado_sesion FROM public.sesiones_trabajo
   WHERE id = '00000000-0000-4000-8000-00000000c710'),
  'activa',
  'El rechazo no cierra parcialmente la sesión'
);
SELECT is(
  (SELECT count(*) FROM public.registros_consumo_material
   WHERE partida_id = '00000000-0000-4000-8000-00000000c707'),
  0::bigint,
  'El rechazo no registra un consumo parcial'
);
SELECT lives_ok(
  $$ SELECT * FROM public.cerrar_sesion_con_consumo_operador(
       '00000000-0000-4000-8000-00000000c710',
       '00000000-0000-4000-8000-00000000c701',
       1,
       '00000000-0000-4000-8000-00000000c704',
       2,
       0.5,
       NULL,
       'Cierre con consumo C70'
     ) $$,
  'Cierra y registra consumo en la misma transacción'
);
SELECT is(
  (SELECT estado_sesion FROM public.sesiones_trabajo
   WHERE id = '00000000-0000-4000-8000-00000000c710'),
  'finalizada',
  'El cierre confirmado finaliza la sesión'
);
SELECT is(
  (SELECT count(*) FROM public.registros_consumo_material
   WHERE partida_id = '00000000-0000-4000-8000-00000000c707'),
  1::bigint,
  'El cierre confirmado registra exactamente un consumo'
);
SELECT is(
  (SELECT cantidad_usada FROM public.registros_consumo_material
   WHERE partida_id = '00000000-0000-4000-8000-00000000c707'),
  2::numeric,
  'Conserva la cantidad usada'
);
SELECT is(
  (SELECT cantidad_scrap FROM public.registros_consumo_material
   WHERE partida_id = '00000000-0000-4000-8000-00000000c707'),
  0.5::numeric,
  'Conserva la merma'
);

SELECT * FROM finish();
ROLLBACK;
