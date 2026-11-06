-- B5 - Costos, conciliacion financiera y pagos a proveedores.
-- AUD-07 (material nuevo/legado en reportes), AUD-08 (retrabajo en C10.2/C10.3)
-- y AUD-15 (idempotencia de pagos a proveedor).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(32);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-00000000b501', 'b5-admin@prueba.local')
ON CONFLICT (id) DO NOTHING;
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B5'
WHERE id = '00000000-0000-4000-8000-00000000b501';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-00000000b502', 'Cliente B5', 'Cliente B5 SA', 'activo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.proveedores (id, nombre_comercial, contacto_nombre, correo, telefono)
VALUES ('00000000-0000-4000-8000-00000000b503', 'Proveedor B5', 'Contacto B5',
        'b5@proveedor.local', '5550000000')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.compras (id, folio_sii, proveedor_id, estado, monto_subtotal,
  monto_iva, monto_total, saldo_pendiente, creado_por)
VALUES
  ('00000000-0000-4000-8000-00000000b504', 'CG-2026_0501',
   '00000000-0000-4000-8000-00000000b503', 'CONFIRMADA', 1000, 0, 1000, 1000,
   '00000000-0000-4000-8000-00000000b501'),
  ('00000000-0000-4000-8000-00000000b505', 'CG-2026_0502',
   '00000000-0000-4000-8000-00000000b503', 'CONFIRMADA', 500, 0, 500, 500,
   '00000000-0000-4000-8000-00000000b501');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, estado_sii,
  fecha_compromiso, snapshot_json)
VALUES ('00000000-0000-4000-8000-00000000b510', 'OP-995501',
  '00000000-0000-4000-8000-00000000b502', 'completada', 'PRODUCCION_COMPLETADA',
  current_date + 5, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.partidas_orden_produccion (id, orden_id, codigo_pieza,
  cantidad_solicitada, cantidad_producida, unidad_medida)
VALUES ('00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b510',
  'B5-PIEZA', 10, 10, 'pieza')
ON CONFLICT (id) DO NOTHING;

-- AR cobrable: venta neta 1000 para el margen de rentabilidad.
INSERT INTO public.cuentas_por_cobrar (id, orden_id, cliente_id, monto_total,
  monto_subtotal, monto_iva, saldo_pendiente, moneda, tipo_cambio_origen,
  estado, cobrable_desde, fecha_vencimiento)
VALUES ('00000000-0000-4000-8000-00000000b512', '00000000-0000-4000-8000-00000000b510',
  '00000000-0000-4000-8000-00000000b502', 1160, 1000, 160, 1160, 'MXN', 1,
  'pendiente', now(), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo, costo_hora_interno)
VALUES ('00000000-0000-4000-8000-00000000b513', 'B5-REC', 'Estacion B5', 'taller', true, 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.programacion_areas (id, orden_id, partida_id, recurso_id,
  fecha_programada, turno, horas_estimadas, secuencia, estado_planeacion)
VALUES ('00000000-0000-4000-8000-00000000b514', '00000000-0000-4000-8000-00000000b510',
  '00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b513',
  current_date, 'matutino', 4, 1, 'programada')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sesiones_trabajo (id, orden_id, partida_id, programacion_id,
  operador_id, fecha_inicio, fecha_fin, horas_brutas, horas_netas, estado_sesion,
  costo_hora_interno)
VALUES ('00000000-0000-4000-8000-00000000b515', '00000000-0000-4000-8000-00000000b510',
  '00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b514',
  '00000000-0000-4000-8000-00000000b501', now() - interval '3 hours',
  now() - interval '1 hour', 2, 2, 'finalizada', 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.materiales (id, codigo, nombre, categoria, unidad_compra,
  unidad_control, factor_conversion, costo_unitario_compra, costo_unitario_control,
  stock_actual_control, stock_minimo_control)
VALUES
  ('00000000-0000-4000-8000-00000000b516', 'B5LEG1', 'Legado B5 uno',
   'materia_prima', 'pieza', 'kg', 1, 10, 10, 100, 1),
  ('00000000-0000-4000-8000-00000000b517', 'B5LEG2', 'Legado B5 dos',
   'materia_prima', 'pieza', 'kg', 1, 5, 5, 100, 1);

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, moneda_costo)
VALUES ('00000000-0000-4000-8000-00000000b518', 'CAT-B5', 'Catalogo B5', 'kg', 'MXN')
ON CONFLICT (id) DO NOTHING;

-- Consumo legado: 3 x 10 = 30.
INSERT INTO public.registros_consumo_material (id, partida_id, material_id,
  cantidad_usada, cantidad_scrap, costo_unitario_momento, origen)
VALUES ('00000000-0000-4000-8000-00000000b519',
  '00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b516',
  3, 0, 10, 'LEGADO')
ON CONFLICT (id) DO NOTHING;

-- Consumo nuevo: 2 x 20 = 40, unidad kg.
INSERT INTO public.registros_consumo_material (id, partida_id, catalogo_material_id,
  unidad_base, cantidad_usada, cantidad_scrap, costo_unitario_momento,
  costo_unitario_origen, moneda_costo, tipo_cambio, actor_id, origen)
VALUES ('00000000-0000-4000-8000-00000000b51a',
  '00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b518',
  'kg', 2, 0, 20, 20, 'MXN', 1, '00000000-0000-4000-8000-00000000b501', 'NUEVO')
ON CONFLICT (id) DO NOTHING;

-- Retrabajo: material 1 x 5 = 5; 30 min a 50/h = 25.
INSERT INTO public.retrabajos_produccion (id, orden_id, partida_id, sesion_id,
  material_id, cantidad_usada, cantidad_scrap, minutos, causa, motivo,
  costo_unitario_momento, registrado_por)
VALUES ('00000000-0000-4000-8000-00000000b51b', '00000000-0000-4000-8000-00000000b510',
  '00000000-0000-4000-8000-00000000b511', '00000000-0000-4000-8000-00000000b515',
  '00000000-0000-4000-8000-00000000b517', 1, 0, 30, 'operador', 'Prueba B5',
  5, '00000000-0000-4000-8000-00000000b501')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.gastos (id, folio, categoria, descripcion, monto_subtotal,
  monto_iva, monto_total, moneda, tipo_cambio, estado_pago, orden_id, creado_por)
VALUES ('00000000-0000-4000-8000-00000000b51c', 'GTO-995501', 'maquila_externa',
  'Maquila B5', 10, 0, 10, 'MXN', 1, 'pendiente',
  '00000000-0000-4000-8000-00000000b510', '00000000-0000-4000-8000-00000000b501')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- AUD-15 - esquema y firma
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'pagos_compra', 'solicitud_id',
  'pagos_compra guarda la clave de idempotencia');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.pagos_compra'::regclass
    AND conname = 'pagos_compra_solicitud_id_key' AND contype = 'u'
), 'La clave de solicitud es unica');
SELECT ok(to_regprocedure('public.pagar_compra(uuid,numeric,text,text,uuid,text,uuid,uuid,uuid)') IS NOT NULL,
  'Existe pagar_compra con la clave de solicitud');
SELECT ok(to_regprocedure('public.pagar_compra(uuid,numeric,text,text,uuid,text,uuid,uuid)') IS NULL,
  'Se elimino el overload sin idempotencia');

-- Primer pago: 100 de 1000.
CREATE TEMP TABLE b5_pago1 AS
SELECT * FROM public.pagar_compra(
  '00000000-0000-4000-8000-00000000b504', 100, 'transferencia', 'B5-P1', NULL, NULL,
  '00000000-0000-4000-8000-00000000b501', NULL,
  '00000000-0000-4000-8000-00000000b5a1');

-- Reintento identico: mismo pago, sin nuevo descuento.
CREATE TEMP TABLE b5_pago2 AS
SELECT * FROM public.pagar_compra(
  '00000000-0000-4000-8000-00000000b504', 100, 'transferencia', 'B5-P1', NULL, NULL,
  '00000000-0000-4000-8000-00000000b501', NULL,
  '00000000-0000-4000-8000-00000000b5a1');

SELECT is((SELECT idempotente FROM b5_pago1), false,
  'El primer pago no es idempotente');
SELECT is((SELECT saldo_pendiente FROM b5_pago1), 900::numeric,
  'El primer pago descuenta el saldo una vez');
SELECT is((SELECT idempotente FROM b5_pago2), true,
  'El reintento se reconoce como idempotente');
SELECT is((SELECT pago_id FROM b5_pago2), (SELECT pago_id FROM b5_pago1),
  'El reintento devuelve el pago original');
SELECT is((SELECT saldo_pendiente FROM b5_pago2), 900::numeric,
  'El reintento no vuelve a descontar el saldo');
SELECT is((SELECT count(*) FROM public.pagos_compra
  WHERE compra_id = '00000000-0000-4000-8000-00000000b504'), 1::bigint,
  'El reintento no duplica el pago');

SELECT throws_ok($$
  SELECT * FROM public.pagar_compra(
    '00000000-0000-4000-8000-00000000b504', 999, 'transferencia', 'B5-P1', NULL, NULL,
    '00000000-0000-4000-8000-00000000b501', NULL,
    '00000000-0000-4000-8000-00000000b5a1')
$$, '23514', 'solicitud_pago_conflicto',
  'La misma clave con otro monto se rechaza');

SELECT throws_ok($$
  SELECT * FROM public.pagar_compra(
    '00000000-0000-4000-8000-00000000b505', 100, 'transferencia', 'B5-P1', NULL, NULL,
    '00000000-0000-4000-8000-00000000b501', NULL,
    '00000000-0000-4000-8000-00000000b5a1')
$$, '23514', 'solicitud_pago_conflicto',
  'La misma clave en otra compra se rechaza');

SELECT throws_ok($$
  SELECT * FROM public.pagar_compra(
    '00000000-0000-4000-8000-00000000b504', 10, 'efectivo', NULL, NULL, NULL,
    '00000000-0000-4000-8000-00000000b501', NULL, NULL)
$$, '23514', 'datos_pago_compra_invalidos',
  'Sin clave de solicitud no se registra el pago');

-- Pago parcial legitimo con otra clave.
SELECT * FROM public.pagar_compra(
  '00000000-0000-4000-8000-00000000b504', 500, 'efectivo', 'B5-P2', NULL, NULL,
  '00000000-0000-4000-8000-00000000b501', NULL,
  '00000000-0000-4000-8000-00000000b5a2');
SELECT is((SELECT count(*) FROM public.pagos_compra
  WHERE compra_id = '00000000-0000-4000-8000-00000000b504'), 2::bigint,
  'Dos pagos legitimos con claves distintas quedan registrados');
SELECT is((SELECT saldo_pendiente FROM public.compras
  WHERE id = '00000000-0000-4000-8000-00000000b504'), 400::numeric,
  'Los dos pagos descuentan 100 + 500');

SELECT throws_ok($$
  INSERT INTO public.pagos_compra (compra_id, monto, metodo_pago, creado_por, solicitud_id)
  VALUES ('00000000-0000-4000-8000-00000000b504', 1, 'efectivo',
          '00000000-0000-4000-8000-00000000b501',
          '00000000-0000-4000-8000-00000000b5a1')
$$, '23505', NULL, 'La restriccion unica impide duplicar la clave');

SELECT is((SELECT count(*) FROM public.movimientos_tesoreria), 0::bigint,
  'pagar_compra no genera movimientos de tesoreria: un duplicado no puede crear doble movimiento');

-- -----------------------------------------------------------------------------
-- AUD-08 - conciliacion y rentabilidad incluyen el retrabajo una sola vez
-- -----------------------------------------------------------------------------
SELECT is(((public.obtener_conciliacion_costos_orden(
    '00000000-0000-4000-8000-00000000b510')) -> 'conceptos' -> 0 ->> 'real')::numeric,
  75::numeric, 'Material real = consumo legado 30 + nuevo 40 + retrabajo 5');
SELECT is(((public.obtener_conciliacion_costos_orden(
    '00000000-0000-4000-8000-00000000b510')) -> 'conceptos' -> 1 ->> 'real')::numeric,
  125::numeric, 'Fabricacion real = sesion 100 + retrabajo 25');
SELECT is(((public.obtener_conciliacion_costos_orden(
    '00000000-0000-4000-8000-00000000b510')) -> 'avisos' -> 'retrabajos' ->> 'material')::numeric,
  5::numeric, 'La conciliacion informa el material de retrabajo');
SELECT is(((public.obtener_conciliacion_costos_orden(
    '00000000-0000-4000-8000-00000000b510')) -> 'avisos' -> 'retrabajos' ->> 'manoObra')::numeric,
  25::numeric, 'La conciliacion informa la mano de obra de retrabajo');
SELECT is(((public.obtener_conciliacion_costos_orden(
    '00000000-0000-4000-8000-00000000b510')) -> 'avisos' -> 'retrabajos' ->> 'sinSesion')::int,
  0, 'El retrabajo tiene sesion historica');

SELECT is((public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')).costo_materiales_mxn,
  75::numeric, 'Rentabilidad: material incluye consumo y retrabajo');
SELECT is((public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')).costo_mano_obra_mxn,
  125::numeric, 'Rentabilidad: mano de obra incluye retrabajo');
SELECT is((public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')).costo_total_mxn,
  210::numeric, 'Rentabilidad: total 75 + 125 + 10 gastos');

SELECT is((SELECT count(*) FROM public.obtener_desglose_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510') WHERE rubro = 'material'),
  3::bigint, 'El desglose separa legado, catalogo y retrabajo en tres materiales');
SELECT ok(EXISTS (
  SELECT 1 FROM public.obtener_desglose_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')
  WHERE rubro = 'material' AND referencia = 'CAT-B5' AND importe = 40
), 'El desglose resuelve el catalogo nuevo por su codigo y costo');
SELECT is((SELECT horas_reales FROM public.obtener_desglose_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510') WHERE rubro = 'mano_obra'),
  2.5::numeric, 'El desglose suma 0.5 h de retrabajo a las horas reales');
SELECT is((SELECT sum(importe) FROM public.obtener_desglose_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')
    WHERE rubro IN ('material', 'mano_obra', 'gasto')),
  210::numeric, 'El desglose suma exactamente el costo de rentabilidad');

-- Escenario sin retrabajo: la diferencia debe ser exactamente su costo.
DELETE FROM public.retrabajos_produccion
WHERE id = '00000000-0000-4000-8000-00000000b51b';

SELECT is((public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')).costo_materiales_mxn,
  70::numeric, 'Sin retrabajo el material baja a 70');
SELECT is((public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-00000000b510')).costo_mano_obra_mxn,
  100::numeric, 'Sin retrabajo la mano de obra baja a 100');
SELECT is(
  (SELECT (public.obtener_conciliacion_costos_orden(
      '00000000-0000-4000-8000-00000000b510')) -> 'conceptos' -> 0 ->> 'real')::numeric
  + (SELECT (public.obtener_conciliacion_costos_orden(
      '00000000-0000-4000-8000-00000000b510')) -> 'conceptos' -> 1 ->> 'real')::numeric,
  170::numeric, 'Sin retrabajo la conciliacion baja 30 (5 material + 25 mano de obra)');

SELECT * FROM finish();
ROLLBACK;
