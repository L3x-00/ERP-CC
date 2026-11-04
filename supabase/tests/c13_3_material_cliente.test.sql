-- C13.3 - Material del cliente: declaración en propuesta, saldo y bloqueo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(10);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000e0101', 'c133-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000e0102', 'c133-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C133'
WHERE id = '00000000-0000-4000-8000-0000000e0101';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C133'
WHERE id = '00000000-0000-4000-8000-0000000e0102';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000e0103', 'Cliente C133', 'Cliente C133 SA de CV', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id,
  vendedor_id, moneda, iva_porcentaje, descripcion_general, canal, fecha_solicitud
) VALUES (
  '00000000-0000-4000-8000-0000000e0104', 'OP-C133-01', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C133', 'Empresa C133', '00000000-0000-4000-8000-0000000e0103',
  '00000000-0000-4000-8000-0000000e0101', 'MXN', 16, 'Solicitud C133', 'correo', current_date
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad)
VALUES ('00000000-0000-4000-8000-0000000e0105', '00000000-0000-4000-8000-0000000e0104',
  1, 'IT01', 'Pieza C133', 10);

SELECT public.crear_propuesta(
  '00000000-0000-4000-8000-0000000e0104', '00000000-0000-4000-8000-0000000e0101');

CREATE TEMP TABLE c133 (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO c133 SELECT 'propuesta', id FROM public.propuestas
WHERE rfq_id = '00000000-0000-4000-8000-0000000e0104';
INSERT INTO c133 SELECT 'revision', id FROM public.propuesta_revisiones
WHERE propuesta_id = (SELECT valor FROM c133 WHERE nombre = 'propuesta') AND letra = 'A';

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-0000000e0106', 'C133MAT', 'Lámina del cliente', 'm2', true);

-- 1-2. Declaración del material del cliente en la revisión DRAFT.
SELECT lives_ok(format(
  'SELECT public.reemplazar_material_cliente_item(%L, %L, %L::jsonb, %L)',
  (SELECT valor::text FROM c133 WHERE nombre = 'revision'), 'IT01',
  '[{"material_id":"00000000-0000-4000-8000-0000000e0106","cantidad":3}]',
  '00000000-0000-4000-8000-0000000e0101'
), 'Se declara el material del cliente para el ítem');

SELECT is((
  SELECT cantidad FROM public.material_cliente_item
  WHERE propuesta_revision_id = (SELECT valor FROM c133 WHERE nombre = 'revision')
    AND codigo_item = 'IT01'
), 3::numeric, 'La cantidad declarada queda registrada');

-- Orden y sesión de producción.
INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, fecha_compromiso, propuesta_revision_id
) VALUES (
  '00000000-0000-4000-8000-0000000e0107', 'OP-998301',
  '00000000-0000-4000-8000-0000000e0103', 'en_proceso', current_date + 7,
  (SELECT valor FROM c133 WHERE nombre = 'revision')
);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, operador_asignado_id
) VALUES (
  '00000000-0000-4000-8000-0000000e0108', '00000000-0000-4000-8000-0000000e0107',
  'IT01', 10, 'pieza', '00000000-0000-4000-8000-0000000e0102'
);
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000e0109', 'C133R1', 'Recurso C133', 'taller', true);
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno,
  horas_estimadas, secuencia, estado_planeacion
) VALUES (
  '00000000-0000-4000-8000-0000000e0110', '00000000-0000-4000-8000-0000000e0107',
  '00000000-0000-4000-8000-0000000e0108', '00000000-0000-4000-8000-0000000e0109',
  current_date, 'matutino', 2, 1, 'en_proceso'
);
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio
) VALUES (
  '00000000-0000-4000-8000-0000000e0111', '00000000-0000-4000-8000-0000000e0107',
  '00000000-0000-4000-8000-0000000e0108', '00000000-0000-4000-8000-0000000e0110',
  '00000000-0000-4000-8000-0000000e0102', now()
);

-- 3. Consumo dentro del saldo.
SELECT lives_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-0000000e0111', '00000000-0000-4000-8000-0000000e0106',
  1, 0, '00000000-0000-4000-8000-0000000e0102')$$,
  'El operador consume material del cliente dentro del saldo');

-- 4-5. Saldo calculado por la lectura administrativa.
SELECT is((
  SELECT saldo FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-0000000e0107', '00000000-0000-4000-8000-0000000e0101')
), 2::numeric, 'El saldo del cliente baja a 2');

SELECT is((
  SELECT consumido FROM public.obtener_material_cliente_orden(
    '00000000-0000-4000-8000-0000000e0107', '00000000-0000-4000-8000-0000000e0101')
), 1::numeric, 'El consumo acumulado queda en 1');

-- 6. Exceso de saldo: bloquea el cierre.
SELECT throws_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-0000000e0111', '00000000-0000-4000-8000-0000000e0106',
  3, 0, '00000000-0000-4000-8000-0000000e0102')$$,
  '23514', 'material_cliente_insuficiente',
  'El consumo que excede el saldo del cliente se bloquea');

-- 7. No se toca el inventario propio ni el kardex de la orden.
SELECT is((
  SELECT count(*)::integer FROM public.movimientos_inventario
  WHERE orden_id = '00000000-0000-4000-8000-0000000e0107'
), 0, 'El material del cliente no genera movimientos de inventario');

-- 8. Material no declarado para el ítem.
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, activo)
VALUES ('00000000-0000-4000-8000-0000000e0112', 'C133OTRO', 'Otro material', 'm2', true);
SELECT throws_ok($$SELECT * FROM public.registrar_consumo_material_cliente(
  '00000000-0000-4000-8000-0000000e0111', '00000000-0000-4000-8000-0000000e0112',
  1, 0, '00000000-0000-4000-8000-0000000e0102')$$,
  '23514', 'material_cliente_no_declarado',
  'Solo se descuenta material declarado por el cliente');

-- 9-10. RPC reservadas al service_role.
SELECT is(has_function_privilege('anon',
  'public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid)',
  'execute'), false, 'anon no registra consumo del cliente');
SELECT is(has_function_privilege('service_role',
  'public.registrar_consumo_material_cliente(uuid, uuid, numeric, numeric, uuid)',
  'execute'), true, 'service_role registra consumo del cliente');

SELECT * FROM finish();
ROLLBACK;
