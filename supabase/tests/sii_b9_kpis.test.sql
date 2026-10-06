-- SII-B9 — Diccionario de KPIs §9.3: fórmulas y reglas anti doble conteo.
-- Usa una ventana futura (2098) para aislar los KPIs por rango y deltas para
-- los KPIs globales (WIP, aging, promesas).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000e201', 'sii-b9-kpi@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000e213', 'sii-b9-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B9'
WHERE id = '00000000-0000-4000-8000-00000000e201';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B9'
WHERE id = '00000000-0000-4000-8000-00000000e213';

-- Snapshot de KPIs antes del fixture (para los deltas globales de WIP/aging/promesas).
CREATE TEMP TABLE b9_antes AS
SELECT public.obtener_kpis_sii('2098-01-01T00:00:00Z', '2098-02-01T00:00:00Z',
  '00000000-0000-4000-8000-00000000e201') AS kpis;

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-00000000e202', 'Cliente B9', 'Cliente B9 SA', 'activo');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo, cantidad_equipos, capacidad_jornada_override_horas)
VALUES ('00000000-0000-4000-8000-00000000e203', 'B9R1', 'Recurso B9', 'taller', true, 1, 8);

INSERT INTO public.pipeline (id, folio_op, nombre_contacto, empresa, vendedor_id, estado_rfq, cliente_id, moneda)
VALUES ('00000000-0000-4000-8000-00000000e204', 'OP-B9-0001', 'Contacto B9', 'Cliente B9',
  '00000000-0000-4000-8000-00000000e201', 'CONVERTED', '00000000-0000-4000-8000-00000000e202', 'MXN');

INSERT INTO public.propuestas (id, rfq_id, cliente_id, folio_cnc, estado, revision_vigente_id, accepted_revision_id, responsable_id, creado_por)
VALUES ('00000000-0000-4000-8000-00000000e205', '00000000-0000-4000-8000-00000000e204',
  '00000000-0000-4000-8000-00000000e202', 'CNC-9999_01', 'SALE_CONFIRMED', NULL,
  NULL, '00000000-0000-4000-8000-00000000e201',
  '00000000-0000-4000-8000-00000000e201');

INSERT INTO public.propuesta_revisiones (id, propuesta_id, letra, folio_revision, estado, motivo_creacion, snapshot_cabecera, creado_por)
VALUES
  ('00000000-0000-4000-8000-00000000e206', '00000000-0000-4000-8000-00000000e205',
   'A', 'CNC-9999_01-A', 'SALE_CONFIRMED', NULL, '{"tipo_cambio": 1}'::jsonb,
   '00000000-0000-4000-8000-00000000e201'),
  ('00000000-0000-4000-8000-00000000e208', '00000000-0000-4000-8000-00000000e205',
   'B', 'CNC-9999_01-B', 'SENT', 'Cambio solicitado por el cliente', '{"tipo_cambio": 1}'::jsonb,
   '00000000-0000-4000-8000-00000000e201'),
  ('00000000-0000-4000-8000-00000000e215', '00000000-0000-4000-8000-00000000e205',
   'C', 'CNC-9999_01-C', 'ACCEPTED', 'Ajuste de alcance', '{"tipo_cambio": 1}'::jsonb,
   '00000000-0000-4000-8000-00000000e201');

UPDATE public.propuestas SET revision_vigente_id = '00000000-0000-4000-8000-00000000e208',
  accepted_revision_id = '00000000-0000-4000-8000-00000000e206'
WHERE id = '00000000-0000-4000-8000-00000000e205';

-- Fixture de revisiones congeladas: el GUC de las RPC de B4 permite hijos.
SET LOCAL sii.b4_rpc = 'on';

INSERT INTO public.propuesta_items (revision_id, codigo, descripcion, cantidad, precio_unitario, es_descuento, activo)
VALUES
  ('00000000-0000-4000-8000-00000000e206', 'IT01', 'Pieza B9', 10, 100, false, true),
  ('00000000-0000-4000-8000-00000000e215', 'IT01', 'Pieza B9', 10, 100, false, true);

INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto)
VALUES
  ('00000000-0000-4000-8000-00000000e215', 'material', 400),
  ('00000000-0000-4000-8000-00000000e206', 'material', 400);

INSERT INTO public.propuesta_revision_eventos (revision_id, estado_anterior, estado_nuevo, accion, creado_en)
VALUES
  ('00000000-0000-4000-8000-00000000e206', 'DRAFT', 'SENT', 'enviar_revision', '2098-01-05T10:00:00Z'),
  ('00000000-0000-4000-8000-00000000e206', 'SENT', 'SALE_CONFIRMED', 'confirmar_venta', '2098-01-08T10:00:00Z'),
  ('00000000-0000-4000-8000-00000000e215', 'DRAFT', 'SENT', 'enviar_revision', '2098-01-09T10:00:00Z'),
  ('00000000-0000-4000-8000-00000000e215', 'SENT', 'ACCEPTED', 'aceptar_revision', '2098-01-10T10:00:00Z');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-00000000e209', 'OP-999201',
  '00000000-0000-4000-8000-00000000e202', 'en_proceso', '2098-03-01');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida, cantidad_scrap,
  unidad_medida, tiempo_estimado_minutos, procesos
) VALUES ('00000000-0000-4000-8000-00000000e210', '00000000-0000-4000-8000-00000000e209',
  'P1', 'Pieza B9', 10, 10, 1, 'pza', 120, ARRAY['LASER_FIBRA']);

INSERT INTO public.programacion_areas (id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion, fecha_programada, turno, horas_estimadas)
VALUES ('00000000-0000-4000-8000-00000000e211', '00000000-0000-4000-8000-00000000e209',
  '00000000-0000-4000-8000-00000000e210', '00000000-0000-4000-8000-00000000e203',
  1, 'en_proceso', '2098-01-10', 'matutino', 2);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  horas_brutas, horas_netas, estado_sesion, costo_hora_interno
) VALUES ('00000000-0000-4000-8000-00000000e212', '00000000-0000-4000-8000-00000000e209',
  '00000000-0000-4000-8000-00000000e210', '00000000-0000-4000-8000-00000000e211',
  '00000000-0000-4000-8000-00000000e213', '2098-01-10T08:00:00Z', '2098-01-10T10:00:00Z',
  2, 2, 'finalizada', 100);

-- El trigger de captura fija la tarifa del recurso; para el fixture se fija la interna.
UPDATE public.sesiones_trabajo SET costo_hora_interno = 100 WHERE id = '00000000-0000-4000-8000-00000000e212';

INSERT INTO public.inspecciones_calidad (
  orden_id, partida_id, codigo_item, tipo, resultado, cantidad_inspeccionada, cantidad_ok,
  cantidad_nok, cantidad_retrabajo, liberado_por, creado_en
) VALUES ('00000000-0000-4000-8000-00000000e209', '00000000-0000-4000-8000-00000000e210',
  'IT01', 'CIERRE', 'RECHAZADA', 5, 2, 2, 1, '00000000-0000-4000-8000-00000000e201', '2098-01-12T10:00:00Z');

INSERT INTO public.pagos_ar (
  ar_id, folio_recibo, solicitud_id, monto_pagado, moneda_pago, tipo_cambio_pago,
  monto_aplicado_ar, monto_sobrepago_ar, metodo_pago, creado_por, creado_en
) VALUES (NULL, 'REC-920001', gen_random_uuid(), 500, 'MXN', 1, 500, 0, 'transferencia',
  '00000000-0000-4000-8000-00000000e201', '2098-01-15T10:00:00Z');

CREATE TEMP TABLE b9 (clave text PRIMARY KEY, valor jsonb);

-- Fixture de aging y promesa (global; se mide por delta).
INSERT INTO public.ordenes_produccion (id, folio, folio_sii, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-00000000e219', 'OP-999202', 'O-9999_20',
  '00000000-0000-4000-8000-00000000e202', 'completada', '2098-03-01');
INSERT INTO public.cuentas_por_cobrar (
  id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, estado,
  cobrable_desde, fecha_vencimiento
) VALUES ('00000000-0000-4000-8000-00000000e217', '00000000-0000-4000-8000-00000000e219',
  '00000000-0000-4000-8000-00000000e202', 100, 100, 'MXN', 'pendiente',
  now() - interval '40 days', now() - interval '10 days');
INSERT INTO public.promesas_pago (cuenta_id, fecha_prometida, monto, estado, creado_por)
VALUES ('00000000-0000-4000-8000-00000000e217', current_date + 3, 100, 'VIGENTE',
  '00000000-0000-4000-8000-00000000e201');

INSERT INTO b9 (clave, valor)
SELECT 'kpis', public.obtener_kpis_sii('2098-01-01T00:00:00Z', '2098-02-01T00:00:00Z',
  '00000000-0000-4000-8000-00000000e201');

SELECT plan(18);

-- 1-3. Ventas: una venta por revisión cerrada, TI fuera, TC congelado.
SELECT is((SELECT (valor -> 'ventas' ->> 'vendidoMxn')::numeric FROM b9 WHERE clave = 'kpis'),
  1000::numeric, 'Ventas suma una vez la revisión SALE_CONFIRMED del periodo');
SELECT is((SELECT (valor -> 'ventas' ->> 'tasaCierrePorcentaje')::numeric FROM b9 WHERE clave = 'kpis'),
  100::numeric, 'Tasa de cierre = aceptadas ÷ enviadas del periodo');
SELECT is((SELECT (valor -> 'ventas' ->> 'propuestasEnSeguimiento')::integer FROM b9 WHERE clave = 'kpis'),
  1, 'Propuestas en seguimiento usa la revisión vigente SENT/FOLLOW_UP');

-- 4-6. Producción: horas, piezas finales y WIP.
SELECT is((SELECT (valor -> 'produccion' ->> 'horasReales')::numeric FROM b9 WHERE clave = 'kpis'),
  2::numeric, 'Horas reales = horas netas de sesiones del periodo');
SELECT is((SELECT (valor -> 'produccion' ->> 'horasEstimadas')::numeric FROM b9 WHERE clave = 'kpis'),
  2::numeric, 'Horas estimadas = ruteo del snapshot (120 min)');
SELECT is((SELECT (valor -> 'produccion' ->> 'piezasProducidas')::numeric FROM b9 WHERE clave = 'kpis'),
  10::numeric, 'Piezas producidas cuenta solo la cantidad final una vez');

-- 7-8. WIP por delta (global) y costo estimado con tarifa interna.
SELECT is(
  (SELECT (valor -> 'produccion' ->> 'wipOrdenes')::integer FROM b9 WHERE clave = 'kpis')
  - (SELECT (kpis -> 'produccion' ->> 'wipOrdenes')::integer FROM b9_antes),
  1, 'WIP crece con la orden en producción sin cierre administrativo');
SELECT is(
  (SELECT (valor -> 'produccion' ->> 'wipCostoEstimadoMxn')::numeric FROM b9 WHERE clave = 'kpis')
  - (SELECT (kpis -> 'produccion' ->> 'wipCostoEstimadoMxn')::numeric FROM b9_antes),
  200::numeric, 'El WIP se valora con horas estimadas × tarifa interna');

-- 9-11. Calidad.
SELECT is((SELECT (valor -> 'calidad' ->> 'retrabajos')::numeric FROM b9 WHERE clave = 'kpis'),
  1::numeric, 'Retrabajos = Σ cantidad_retrabajo de inspecciones');
SELECT is((SELECT (valor -> 'calidad' ->> 'scrap')::numeric FROM b9 WHERE clave = 'kpis'),
  3::numeric, 'Scrap = cantidad_nok (2) + scrap de partida (1)');
SELECT is((SELECT (valor -> 'calidad' ->> 'noConformidades')::integer FROM b9 WHERE clave = 'kpis'),
  1, 'No conformidades = inspecciones RECHAZADA');

-- 12-13. Rentabilidad estimada vs real del rango.
SELECT is((SELECT (valor -> 'rentabilidad' ->> 'margenEstimadoPorcentaje')::numeric FROM b9 WHERE clave = 'kpis'),
  60::numeric, 'Margen estimado = (venta − costos de revisión aceptada) ÷ venta');
SELECT ok((SELECT valor -> 'rentabilidad' ->> 'margenRealPorcentaje' IS NULL FROM b9 WHERE clave = 'kpis'),
  'Sin AR reconocida en el periodo, el margen real queda no calculable');

-- 14. Utilización por máquina.
SELECT ok((SELECT (valor -> 'produccion' ->> 'utilizacionPorcentaje')::numeric FROM b9 WHERE clave = 'kpis') > 0,
  'La utilización usa horas reales ÷ capacidad nominal del periodo');

-- 15-18. Cobranza: cobros vigentes, aging por tramos y promesas (deltas globales).
SELECT is((SELECT (valor -> 'cobranza' ->> 'cobrosPeriodoMxn')::numeric FROM b9 WHERE clave = 'kpis'),
  500::numeric, 'Cobros del periodo suman pagos vigentes (sin reversos)');
SELECT is(
  (SELECT (valor -> 'cobranza' -> 'aging' ->> 'dias0a30')::numeric FROM b9 WHERE clave = 'kpis')
  - (SELECT (kpis -> 'cobranza' -> 'aging' ->> 'dias0a30')::numeric FROM b9_antes),
  100::numeric, 'Aging 0-30 crece con la cuenta vencida de 10 días');
SELECT is(
  (SELECT (valor -> 'cobranza' -> 'promesas' ->> 'vigentes')::integer FROM b9 WHERE clave = 'kpis')
  - (SELECT (kpis -> 'cobranza' -> 'promesas' ->> 'vigentes')::integer FROM b9_antes),
  1, 'Promesas vigentes crece con la promesa registrada');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.obtener_kpis_sii(timestamptz,timestamptz,uuid)', 'EXECUTE'),
  'authenticated no ejecuta el diccionario de KPIs');

SELECT * FROM finish();
ROLLBACK;
