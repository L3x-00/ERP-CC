-- B4 - Material del cliente: idempotencia por solicitud y sin inventario.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(11);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b401', 'b4mc-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b402', 'b4mc-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B4 MC'
WHERE id = '00000000-0000-4000-8000-00000000b401';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B4 MC'
WHERE id = '00000000-0000-4000-8000-00000000b402';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-00000000b403', 'Cliente B4 MC', 'Cliente B4 MC SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id,
  vendedor_id, moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud
) VALUES (
  '00000000-0000-4000-8000-00000000b404', 'OP-B4MC-01', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto B4 MC', 'Empresa B4 MC', '00000000-0000-4000-8000-00000000b403',
  '00000000-0000-4000-8000-00000000b401', 'MXN', 16, 'Solicitud B4 MC', 'correo', current_date
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad)
VALUES ('00000000-0000-4000-8000-00000000b405', '00000000-0000-4000-8000-00000000b404',
  1, 'IT01', 'Pieza B4 MC', 10);

SELECT public.crear_propuesta(
  '00000000-0000-4000-8000-00000000b404', '00000000-0000-4000-8000-00000000b401');

CREATE TEMP TABLE b4mc (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO b4mc SELECT 'propuesta', id FROM public.propuestas
WHERE rfq_id = '00000000-0000-4000-8000-00000000b404';
INSERT INTO b4mc SELECT 'revision', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM b4mc WHERE nombre = 'propuesta') AND letra = 'A';

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-00000000b406', 'B4MCMAT', 'Lámina del cliente B4', 'm2', true);

SELECT public.reemplazar_material_cliente_item(
  (SELECT valor FROM b4mc WHERE nombre = 'revision'), 'IT01',
  '[{"material_id":"00000000-0000-4000-8000-00000000b406","cantidad":3}]'::jsonb,
  '00000000-0000-4000-8000-00000000b401');

INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, fecha_compromiso, propuesta_revision_id
) VALUES (
  '00000000-0000-4000-8000-00000000b407', 'OP-998601',
  '00000000-0000-4000-8000-00000000b403', 'en_proceso', current_date + 7,
  (SELECT valor FROM b4mc WHERE nombre = 'revision')
);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-00000000b408', '00000000-0000-4000-8000-00000000b407',
  'IT01', 10, 'pieza', '00000000-0000-4000-8000-00000000b402'
);
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES
  ('00000000-0000-4000-8000-00000000b409', 'B4MCR1', 'Recurso B4 MC uno', 'taller', true),
  ('00000000-0000-4000-8000-00000000b40d', 'B4MCR2', 'Recurso B4 MC dos', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
 ) VALUES
  ('00000000-0000-4000-8000-00000000b40a', '00000000-0000-4000-8000-00000000b407',
   '00000000-0000-4000-8000-00000000b408', '00000000-0000-4000-8000-00000000b409',
   current_date, 'matutino', 2, 1, 'en_proceso'),
  ('00000000-0000-4000-8000-00000000b40e', '00000000-0000-4000-8000-00000000b407',
   '00000000-0000-4000-8000-00000000b408', '00000000-0000-4000-8000-00000000b40d',
   current_date, 'matutino', 2, 2, 'en_proceso');
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES
  ('00000000-0000-4000-8000-00000000b40b', '00000000-0000-4000-8000-00000000b407',
   '00000000-0000-4000-8000-00000000b408', '00000000-0000-4000-8000-00000000b40a',
   '00000000-0000-4000-8000-00000000b402', now()),
  ('00000000-0000-4000-8000-00000000b40c', '00000000-0000-4000-8000-00000000b407',
   '00000000-0000-4000-8000-00000000b408', '00000000-0000-4000-8000-00000000b40e',
   '00000000-0000-4000-8000-00000000b402', now() - interval '5 minutes');

-- 1-3. Primer consumo con clave de solicitud.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-00000000b40b', '00000000-0000-4000-8000-00000000b406',
  1, 0, '00000000-0000-4000-8000-00000000b402',
  '00000000-0000-4000-8000-00000000b4a1')$$,
  'El primer consumo del cliente se registra');

SELECT is((
  SELECT count(*)::integer FROM public.consumos_material_cliente
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b4a1'
), 1, 'El consumo queda con su clave de idempotencia');

SELECT is((
  SELECT consumido FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-00000000b407', '00000000-0000-4000-8000-00000000b401')
), 1::numeric, 'El consumo acumulado es 1');

-- 4-5. Reintento idéntico: no duplica.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-00000000b40b', '00000000-0000-4000-8000-00000000b406',
  1, 0, '00000000-0000-4000-8000-00000000b402',
  '00000000-0000-4000-8000-00000000b4a1')$$,
  'El reintento con la misma solicitud es válido');

SELECT is((
  SELECT count(*)::integer FROM public.consumos_material_cliente
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b4a1'
), 1, 'El reintento no duplica el consumo');

-- 6-7. Misma clave con otros datos: conflicto controlado.
SELECT throws_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-00000000b40b', '00000000-0000-4000-8000-00000000b406',
  2, 0, '00000000-0000-4000-8000-00000000b402',
  '00000000-0000-4000-8000-00000000b4a1')$$,
  '23514', 'solicitud_consumo_conflicto',
  'La misma clave con otra cantidad se rechaza');

SELECT is((
  SELECT consumido FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-00000000b407', '00000000-0000-4000-8000-00000000b401')
), 1::numeric, 'El conflicto no altera el consumo acumulado');

-- 8-9. Otra sesión / otra clave: consumo legítimo y serializado por partida.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-00000000b40c', '00000000-0000-4000-8000-00000000b406',
  1, 0, '00000000-0000-4000-8000-00000000b402',
  '00000000-0000-4000-8000-00000000b4a2')$$,
  'Otra sesión puede consumir con una clave distinta');

SELECT is((
  SELECT consumido FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-00000000b407', '00000000-0000-4000-8000-00000000b401')
), 2::numeric, 'El segundo consumo se acumula correctamente');

-- 10. Nunca toca inventario propio.
SELECT is((
  SELECT count(*)::integer FROM public.movimientos_inventario
  WHERE orden_id = '00000000-0000-4000-8000-00000000b407'
), 0, 'El material del cliente no genera movimientos de inventario');

-- 11. La firma nueva queda reservada al service_role.
SELECT is(has_function_privilege('anon',
  'public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid, uuid)',
  'execute'), false, 'anon no registra consumo con la firma idempotente');

SELECT * FROM finish();
ROLLBACK;
