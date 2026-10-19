-- C10.2/F01-F05/F07 — Conciliación Estimado/Comprometido/Real por Orden.
-- Decisiones del cliente que mandan:
--   * F-01 A: Material real = consumo de Producción; la compra no se suma.
--   * F-02: PAGADA sin recepción no es real.
--   * F-04: margen estimado con la venta de la Propuesta; real con la venta de la AR.
--   * F-05: subcontratación se estima y se compara con maquila/compras.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(58);

-- Fixtures base --------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f0301', 'f03-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000f0302', 'f03-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin F03'
WHERE id = '00000000-0000-4000-8000-0000000f0301';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador F03'
WHERE id = '00000000-0000-4000-8000-0000000f0302';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000f0303', 'Cliente F03', 'Cliente F03 SA', 'activo');

INSERT INTO public.pipeline (id, folio_op, etapa, nombre_contacto, empresa,
  cliente_id, vendedor_id, moneda, iva_porcentaje)
VALUES ('00000000-0000-4000-8000-0000000f0304', 'OP-F03-01', 'negociacion',
  'Contacto F03', 'Empresa F03', '00000000-0000-4000-8000-0000000f0303',
  '00000000-0000-4000-8000-0000000f0301', 'MXN', 16);

INSERT INTO public.propuestas (id, rfq_id, cliente_id, folio_cnc,
  estado, responsable_id, creado_por)
VALUES ('00000000-0000-4000-8000-0000000f0305', '00000000-0000-4000-8000-0000000f0304',
  '00000000-0000-4000-8000-0000000f0303', 'CNC-9919_01', 'SENT',
  '00000000-0000-4000-8000-0000000f0301', '00000000-0000-4000-8000-0000000f0301');

INSERT INTO public.propuesta_revisiones (id, propuesta_id, letra, folio_revision,
  estado, motivo_creacion, snapshot_cabecera, creado_por)
VALUES
  ('00000000-0000-4000-8000-0000000f0306', '00000000-0000-4000-8000-0000000f0305',
   'A', 'CNC-9919_01-A', 'DRAFT', NULL, '{"moneda":"MXN","iva_porcentaje":16}'::jsonb,
   '00000000-0000-4000-8000-0000000f0301'),
  ('00000000-0000-4000-8000-0000000f0308', '00000000-0000-4000-8000-0000000f0305',
   'C', 'CNC-9919_01-C', 'DRAFT', 'Prueba F03 posterior',
   '{"moneda":"MXN","iva_porcentaje":16}'::jsonb,
   '00000000-0000-4000-8000-0000000f0301'),
  ('00000000-0000-4000-8000-0000000f0341', '00000000-0000-4000-8000-0000000f0305',
   'B', 'CNC-9919_01-B', 'DRAFT', 'Prueba F03 USD',
   '{"moneda":"USD","iva_porcentaje":16}'::jsonb,
   '00000000-0000-4000-8000-0000000f0301');

INSERT INTO public.propuesta_items (id, revision_id, codigo, descripcion,
  cantidad, precio_unitario, activo)
VALUES
  ('00000000-0000-4000-8000-0000000f0307', '00000000-0000-4000-8000-0000000f0306',
   'IT01', 'Pieza F03', 1, 20000, true),
  ('00000000-0000-4000-8000-0000000f0309', '00000000-0000-4000-8000-0000000f0308',
   'IT01', 'Pieza F03 posterior', 1, 20000, true),
  ('00000000-0000-4000-8000-0000000f0347', '00000000-0000-4000-8000-0000000f0341',
   'IT01', 'Pieza F03 USD', 1, 1000, true);

SELECT set_config('sii.b4_rpc', 'on', true);
INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto)
VALUES
  ('00000000-0000-4000-8000-0000000f0306', 'material', 5000),
  ('00000000-0000-4000-8000-0000000f0306', 'mano_obra', 2000),
  ('00000000-0000-4000-8000-0000000f0306', 'gastos_directos', 800),
  ('00000000-0000-4000-8000-0000000f0306', 'subcontratacion', 0),
  ('00000000-0000-4000-8000-0000000f0308', 'material', 4000),
  ('00000000-0000-4000-8000-0000000f0308', 'mano_obra', 900),
  ('00000000-0000-4000-8000-0000000f0341', 'material', 500);

-- Congela las revisiones: los cambios posteriores de contenido quedan bloqueados.
SELECT set_config('sii.b4_rpc', 'on', true);
UPDATE public.propuesta_revisiones
SET estado = 'ACCEPTED', actualizado_en = now()
WHERE id IN ('00000000-0000-4000-8000-0000000f0306',
             '00000000-0000-4000-8000-0000000f0308',
             '00000000-0000-4000-8000-0000000f0341');
SELECT set_config('sii.b4_rpc', 'off', true);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, es_interna,
  propuesta_revision_id, snapshot_json, fecha_compromiso, creado_en)
VALUES
  ('00000000-0000-4000-8000-0000000f0310', 'OP-991901',
   '00000000-0000-4000-8000-0000000f0303', 'completada', false,
   NULL, '{}'::jsonb, now() + interval '5 days', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000f0340', 'OP-991902',
   '00000000-0000-4000-8000-0000000f0303', 'completada', false,
   NULL, '{}'::jsonb, now() + interval '5 days', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000f0350', 'OP-991903',
   '00000000-0000-4000-8000-0000000f0303', 'programada', false,
   NULL, '{}'::jsonb, now() + interval '5 days', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000f0360', 'OP-991904',
   '00000000-0000-4000-8000-0000000f0303', 'programada', true,
   NULL, '{}'::jsonb, now() + interval '5 days', now() - interval '10 days');

INSERT INTO public.cuentas_por_cobrar (id, orden_id, cliente_id, monto_total,
  monto_subtotal, monto_iva, saldo_pendiente, moneda, tipo_cambio_origen,
  estado, fecha_vencimiento, cobrable_desde)
VALUES
  ('00000000-0000-4000-8000-0000000f0311', '00000000-0000-4000-8000-0000000f0310',
   '00000000-0000-4000-8000-0000000f0303', 23200, 20000, 3200, 23200, 'MXN', 1,
   'pendiente', NULL, NULL),
  ('00000000-0000-4000-8000-0000000f0345', '00000000-0000-4000-8000-0000000f0340',
   '00000000-0000-4000-8000-0000000f0303', 1160, 1000, 160, 1160, 'USD', 18.5,
   'pendiente', NULL, NULL);

INSERT INTO public.partidas_orden_produccion (id, orden_id, codigo_pieza,
  cantidad_solicitada, unidad_medida)
VALUES
  ('00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0310',
   'F03-PIEZA', 1, 'pieza'),
  ('00000000-0000-4000-8000-0000000f0342', '00000000-0000-4000-8000-0000000f0340',
   'F03-PIEZA-USD', 1, 'pieza');

INSERT INTO public.materiales (id, codigo, nombre, categoria, unidad_compra,
  unidad_control, factor_conversion, costo_unitario_compra, costo_unitario_control,
  stock_actual_control, stock_minimo_control)
VALUES ('00000000-0000-4000-8000-0000000f0313', 'F03ACERO', 'Acero F03',
  'materia_prima', 'pieza', 'kg', 1, 50, 50, 1000, 10);

INSERT INTO public.registros_consumo_material (id, partida_id, material_id,
  cantidad_usada, cantidad_scrap, costo_unitario_momento, creado_en)
VALUES ('00000000-0000-4000-8000-0000000f0314',
  '00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0313',
  109, 0, 50, now() - interval '5 days');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000f0315', 'F03-REC', 'Estación F03', 'taller', true);

INSERT INTO public.programacion_areas (id, orden_id, partida_id, recurso_id,
  fecha_programada, horas_estimadas)
VALUES
  ('00000000-0000-4000-8000-0000000f0316', '00000000-0000-4000-8000-0000000f0310',
   '00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0315',
   current_date, 18),
  ('00000000-0000-4000-8000-0000000f0343', '00000000-0000-4000-8000-0000000f0340',
   '00000000-0000-4000-8000-0000000f0342', '00000000-0000-4000-8000-0000000f0315',
   current_date, 10);

UPDATE public.recursos_planeacion SET costo_hora_interno = 100
WHERE id = '00000000-0000-4000-8000-0000000f0315';

INSERT INTO public.sesiones_trabajo (id, orden_id, partida_id, programacion_id,
  operador_id, fecha_inicio, fecha_fin, horas_brutas, horas_netas, estado_sesion,
  costo_hora_interno)
VALUES
  ('00000000-0000-4000-8000-0000000f0317', '00000000-0000-4000-8000-0000000f0310',
   '00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0316',
   '00000000-0000-4000-8000-0000000f0302', now() - interval '3 hours',
   now() - interval '2 hours', 1, 10, 'finalizada', 100),
  ('00000000-0000-4000-8000-0000000f0318', '00000000-0000-4000-8000-0000000f0310',
   '00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0316',
   '00000000-0000-4000-8000-0000000f0302', now() - interval '2 hours',
   now() - interval '1 hour', 1, 8, 'pausada', 100),
  ('00000000-0000-4000-8000-0000000f0319', '00000000-0000-4000-8000-0000000f0310',
   '00000000-0000-4000-8000-0000000f0312', '00000000-0000-4000-8000-0000000f0316',
   '00000000-0000-4000-8000-0000000f0302', now(), NULL, 0, 5, 'activa', 100),
  ('00000000-0000-4000-8000-0000000f0344', '00000000-0000-4000-8000-0000000f0340',
   '00000000-0000-4000-8000-0000000f0342', '00000000-0000-4000-8000-0000000f0343',
   '00000000-0000-4000-8000-0000000f0302', now() - interval '3 hours',
   now() - interval '2 hours', 1, 10, 'finalizada', 100);

-- La Orden nace sin snapshot y se completa al final, como el creador real:
-- así el trigger comercial permite las partidas y después congela el alcance.
UPDATE public.ordenes_produccion
SET propuesta_revision_id = '00000000-0000-4000-8000-0000000f0306',
    snapshot_json = '{"totales":{"subtotal":20000,"moneda":"MXN","tipo_cambio":1}}'::jsonb,
    fecha_compromiso_comercial = now() + interval '5 days'
WHERE id = '00000000-0000-4000-8000-0000000f0310';
UPDATE public.ordenes_produccion
SET propuesta_revision_id = '00000000-0000-4000-8000-0000000f0341',
    snapshot_json = '{"totales":{"subtotal":1000,"moneda":"USD","tipo_cambio":18.5}}'::jsonb,
    fecha_compromiso_comercial = now() + interval '5 days'
WHERE id = '00000000-0000-4000-8000-0000000f0340';

INSERT INTO public.proveedores (id, nombre_comercial, razon_social, contacto_nombre,
  correo, telefono)
VALUES ('00000000-0000-4000-8000-0000000f0330', 'Proveedor F03', 'Proveedor F03 SA',
  'Contacto F03', 'proveedor-f03@prueba.local', '5555555555');

INSERT INTO public.gastos (id, folio, orden_id, categoria, descripcion,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, estado_pago,
  fecha_gasto, creado_por)
VALUES
  ('00000000-0000-4000-8000-0000000f0320', 'GTO-991901',
   '00000000-0000-4000-8000-0000000f0310', 'maquila_externa', 'Maquila F03',
   500, 80, 580, 'MXN', 1, 'pendiente', now() - interval '4 days',
   '00000000-0000-4000-8000-0000000f0301'),
  ('00000000-0000-4000-8000-0000000f0321', 'GTO-991902',
   '00000000-0000-4000-8000-0000000f0310', 'consumibles', 'Consumibles F03',
   650, 104, 754, 'MXN', 1, 'pendiente', now() - interval '4 days',
   '00000000-0000-4000-8000-0000000f0301'),
  ('00000000-0000-4000-8000-0000000f0322', 'GTO-991903',
   '00000000-0000-4000-8000-0000000f0310', 'materia_prima', 'Materia prima F03',
   1000, 160, 1160, 'MXN', 1, 'pendiente', now() - interval '4 days',
   '00000000-0000-4000-8000-0000000f0301');

INSERT INTO public.compras (id, folio_sii, proveedor_id, orden_id, estado,
  monto_subtotal, monto_iva, monto_total, moneda, tipo_cambio, saldo_pendiente,
  creado_por, rubro_costo, recibida_en)
VALUES
  ('00000000-0000-4000-8000-0000000f0323', 'CG-9919_0001',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0310',
   'RECIBIDA', 5450, 872, 6322, 'MXN', 1, 6322,
   '00000000-0000-4000-8000-0000000f0301', 'material', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000f0324', 'CG-9919_0002',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0310',
   'CONFIRMADA', 200, 32, 232, 'MXN', 1, 232,
   '00000000-0000-4000-8000-0000000f0301', NULL, NULL),
  ('00000000-0000-4000-8000-0000000f0325', 'CG-9919_0003',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0310',
   'BORRADOR', 100, 16, 116, 'MXN', 1, 116,
   '00000000-0000-4000-8000-0000000f0301', 'subcontratacion', NULL),
  ('00000000-0000-4000-8000-0000000f0326', 'CG-9919_0004',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0310',
   'CONFIRMADA', 100, 16, 116, 'MXN', 1, 116,
   '00000000-0000-4000-8000-0000000f0301', 'subcontratacion', NULL),
  ('00000000-0000-4000-8000-0000000f0346', 'CG-9919_0005',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0340',
   'CONFIRMADA', 200, 32, 232, 'USD', 20, 232,
   '00000000-0000-4000-8000-0000000f0301', 'subcontratacion', NULL),
  ('00000000-0000-4000-8000-0000000f0351', 'CG-9919_0006',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0350',
   'PAGADA', 400, 64, 464, 'MXN', 1, 0,
   '00000000-0000-4000-8000-0000000f0301', 'subcontratacion', NULL),
  ('00000000-0000-4000-8000-0000000f0352', 'CG-9919_0007',
   '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0350',
   'PAGADA', 300, 48, 348, 'MXN', 1, 0,
   '00000000-0000-4000-8000-0000000f0301', 'subcontratacion', now() - interval '1 day');

UPDATE public.compras SET estado = 'CANCELADA', motivo_cancelacion = 'Cancelada F03',
  cancelada_en = now() - interval '1 day'
WHERE id = '00000000-0000-4000-8000-0000000f0326';

-- 1-8. Orden A: identidad, estimado y bases. --------------------------------
SELECT ok((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') ->> 'esInterna')::boolean = false,
  'A no es interna');
SELECT ok((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') ->> 'tieneEstimado')::boolean,
  'A tiene Propuesta de origen');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 ->> 'estimado')::numeric),
  5000::numeric, 'Estimado de Material = 5,000');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 1 ->> 'estimado')::numeric),
  2000::numeric, 'Estimado de Fabricación = 2,000');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 2 ->> 'estimado')::numeric),
  0::numeric, 'Estimado de Subcontratación = 0');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 3 ->> 'estimado')::numeric),
  800::numeric, 'Estimado de Gastos directos = 800');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'estimado')::numeric),
  7800::numeric, 'Estimado total = 7,800');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'ventaBaseEstimadoMxn')::numeric),
  20000::numeric, 'Venta base estimada = 20,000 sin IVA');

-- 9-14. Comprometido: compras confirmadas/recibidas/pagadas con rubro. ------
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 ->> 'comprometido')::numeric),
  5450::numeric, 'Material comprometido = compra recibida de 5,450');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 2 ->> 'comprometido')::numeric),
  0::numeric, 'BORRADOR y CANCELADA no comprometen subcontratación');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'comprometido')::numeric),
  5450::numeric, 'La compra sin rubro no suma al comprometido');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'avisos' -> 'comprasSinRubro' ->> 'n')::integer),
  1, 'Se avisa una compra sin rubro');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'avisos' -> 'comprasSinRubro' ->> 'importe')::numeric),
  200::numeric, 'El aviso de compra sin rubro informa su importe');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'avisos' -> 'comprasPagadasSinRecepcion' ->> 'n')::integer),
  0, 'A no tiene compras pagadas sin recepción');

-- 15-22. Real: consumo, sesiones y gastos; la compra de material no suma. ---
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 ->> 'real')::numeric),
  5450::numeric, 'F-01 A: Material real = consumo (5,450), no la compra');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 1 ->> 'real')::numeric),
  1800::numeric, 'Fabricación real = sesiones pausada/finalizada (1,800)');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 2 ->> 'real')::numeric),
  500::numeric, 'Subcontratación real = maquila externa (500)');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 3 ->> 'real')::numeric),
  650::numeric, 'Gastos directos reales = consumibles (650)');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'real')::numeric),
  8400::numeric, 'Real total = 8,400');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'variacionAbs')::numeric),
  600::numeric, 'Variación total = +600');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'variacionPct')::numeric),
  7.6923::numeric, 'Variación total = +7.6923 %');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 ->> 'variacionPct')::numeric),
  9.0000::numeric, 'Variación de Material = +9 %');

SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 2 -> 'variacionPct')),
  'null'::jsonb, 'Estimado 0 deja la variación porcentual en null');

-- 23-27. Márgenes con bases separadas (F-04) y fuentes. ---------------------
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'margenEstimadoPct')::numeric),
  61.0000::numeric, 'Margen estimado = 61 %');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'margenRealPct')::numeric),
  58.0000::numeric, 'Margen real = 58 %');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'ventaBaseRealMxn')::numeric),
  20000::numeric, 'La venta real usa la AR aunque no sea cobrable');
SELECT is((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 -> 'fuentes'),
  '["compra", "consumo"]'::jsonb, 'Material declara compra comprometida y consumo real');
SELECT is((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 1 -> 'fuentes'),
  '["sesion"]'::jsonb, 'Fabricación declara la fuente sesión');

-- 28-29. Avisos de gastos incluidos en rubros y rentabilidad. ---------------
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'avisos' -> 'gastosIncluidosEnRubros' ->> 'n')::integer),
  1, 'Se avisa el gasto de materia prima ya incluido');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'avisos' -> 'gastosIncluidosEnRubros' ->> 'importe')::numeric),
  1000::numeric, 'El aviso de gasto incluido informa su importe');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'totales' ->> 'real')::numeric),
  (SELECT r.costo_total_mxn FROM public.obtener_rentabilidad_orden(
    '00000000-0000-4000-8000-0000000f0310') AS r),
  'Sin compras reales, la conciliación coincide con la tarjeta de rentabilidad');

-- 30-34. Orden C: sin estimado y PAGADA sin recepción no es real. -----------
SELECT ok(NOT (public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') ->> 'tieneEstimado')::boolean,
  'C no tiene Propuesta de origen');
SELECT is((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'totales' -> 'estimado'),
  'null'::jsonb, 'Sin Propuesta el estimado es null, no 0');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'totales' ->> 'comprometido')::numeric),
  700::numeric, 'C compromete 400 + 300');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'totales' ->> 'real')::numeric),
  300::numeric, 'Solo la PAGADA con recepción cuenta como real');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'avisos' -> 'comprasPagadasSinRecepcion' ->> 'n')::integer),
  1, 'C avisa una compra pagada sin recepción');

SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'margenEstimadoPct')),
  'null'::jsonb, 'Sin estimado el margen estimado es null');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0350') -> 'margenRealPct')),
  'null'::jsonb, 'Sin AR el margen real es null');

-- 35-36. Orden D interna. ---------------------------------------------------
SELECT ok((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0360') ->> 'esInterna')::boolean,
  'D es una Orden interna');
SELECT ok(NOT (public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0360') ->> 'tieneEstimado')::boolean,
  'D no tiene Propuesta de origen');

-- 37-44. Caso USD y compras de servicios. ----------------------------------
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'conceptos' -> 0 ->> 'estimado')::numeric),
  9250::numeric, 'USD: estimado de Material = 500 × 18.5');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'conceptos' -> 2 ->> 'comprometido')::numeric),
  4000::numeric, 'USD: compra de subcontratación = 200 × 20');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'conceptos' -> 2 ->> 'real')::numeric),
  0::numeric, 'USD: compra confirmada sin recepción no es real');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'totales' ->> 'real')::numeric),
  1000::numeric, 'USD: real = sesión de 1,000 MXN');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'ventaBaseEstimadoMxn')::numeric),
  18500::numeric, 'USD: venta base estimada = 1,000 × 18.5');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'ventaBaseRealMxn')::numeric),
  18500::numeric, 'USD: venta base real usa el TC de la AR');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'margenEstimadoPct')::numeric),
  50.0000::numeric, 'USD: margen estimado = 50 %');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0340') -> 'margenRealPct')::numeric),
  94.5946::numeric, 'USD: margen real = 94.5946 %');

-- 45-46. Estimado inmune a revisión posterior y cambio de tarifario. --------
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 0 ->> 'estimado')::numeric),
  5000::numeric, 'Una revisión posterior no cambia el estimado de la Orden');
UPDATE public.recursos_planeacion SET costo_hora_interno = 999
WHERE id = '00000000-0000-4000-8000-0000000f0315';
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0310') -> 'conceptos' -> 1 ->> 'estimado')::numeric),
  2000::numeric, 'Un cambio de tarifario no altera el estimado congelado');

-- 47-49. Contrato de la función y permisos. --------------------------------
SELECT is((SELECT provolatile::text FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'obtener_conciliacion_costos_orden'), 's',
  'La conciliación es STABLE (solo lectura)');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.obtener_conciliacion_costos_orden(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
  'public.obtener_conciliacion_costos_orden(uuid)', 'EXECUTE'),
  'authenticated y anon no ejecutan la conciliación');
SELECT ok(has_function_privilege('service_role',
  'public.obtener_conciliacion_costos_orden(uuid)', 'EXECUTE'),
  'service_role sí ejecuta la conciliación');

-- 50-56. Recepción congelada y PAGADA sin recepción (F-02). ----------------
CREATE TEMP TABLE f03 (clave text PRIMARY KEY, valor jsonb);
INSERT INTO f03 (clave, valor)
SELECT 'recibida', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0360',
  50, 8, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0301',
  NULL, 'subcontratacion', 'Prueba recepción', NULL, NULL, NULL, NULL) AS compra;
UPDATE f03 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'recibida'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f03 WHERE clave = 'recibida'),
  'CONFIRMADA', NULL, '00000000-0000-4000-8000-0000000f0301') AS compra
WHERE f03.clave = 'recibida';
UPDATE f03 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'recibida'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f03 WHERE clave = 'recibida'),
  'RECIBIDA', NULL, '00000000-0000-4000-8000-0000000f0301') AS compra
WHERE f03.clave = 'recibida';
SELECT ok((SELECT recibida_en IS NOT NULL FROM public.compras
  WHERE id = (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'recibida')),
  'Recibir congela recibida_en');
UPDATE f03 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'recibida'),
  58, 'efectivo', NULL, NULL, NULL, '00000000-0000-4000-8000-0000000f0301') AS pago
WHERE f03.clave = 'recibida';
SELECT ok((SELECT estado = 'PAGADA' AND recibida_en IS NOT NULL FROM public.compras
  WHERE id = (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'recibida')),
  'Una PAGADA que pasó por RECIBIDA conserva la recepción');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0360') -> 'conceptos' -> 2 ->> 'comprometido')::numeric),
  50::numeric, 'La compra recibida sigue comprometida');
SELECT is(((public.obtener_conciliacion_costos_orden(
  '00000000-0000-4000-8000-0000000f0360') -> 'conceptos' -> 2 ->> 'real')::numeric),
  50::numeric, 'Al recibir, la compra de servicios pasa a real sin perder el comprometido');

INSERT INTO f03 (clave, valor)
SELECT 'directa', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0330', '00000000-0000-4000-8000-0000000f0360',
  50, 8, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0301',
  NULL, 'subcontratacion', 'Pago directo', NULL, NULL, NULL, NULL) AS compra;
UPDATE f03 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'directa'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f03 WHERE clave = 'directa'),
  'CONFIRMADA', NULL, '00000000-0000-4000-8000-0000000f0301') AS compra
WHERE f03.clave = 'directa';
UPDATE f03 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'directa'),
  58, 'efectivo', NULL, NULL, NULL, '00000000-0000-4000-8000-0000000f0301') AS pago
WHERE f03.clave = 'directa';
SELECT ok((SELECT estado = 'PAGADA' AND recibida_en IS NULL FROM public.compras
  WHERE id = (SELECT (valor ->> 'id')::uuid FROM f03 WHERE clave = 'directa')),
  'Una PAGADA directa desde CONFIRMADA queda sin recepción');

SELECT * FROM finish();
ROLLBACK;



