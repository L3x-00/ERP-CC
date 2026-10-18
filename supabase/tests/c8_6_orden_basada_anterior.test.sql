-- C8.6 / O-03 B — nueva OP no legacy basada en una terminada, sin precio ni CxC.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-0000000c8611', 'c86-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000c8612', 'c86-operador@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c8611';
UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000c8612';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c8620', 'Cliente C8.6', 'Cliente C8.6 SA', 'activo');

INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, estado_sii, prioridad, fecha_compromiso,
  fecha_compromiso_comercial, referencia_externa, condicion_pago, horas_estimadas,
  monto_sin_iva, monto_iva
) VALUES (
  '00000000-0000-4000-8000-0000000c8630', 'OP-008630',
  '00000000-0000-4000-8000-0000000c8620', 'completada', 'PRODUCCION_COMPLETADA', 'alta',
  now() + interval '3 days', now() + interval '2 days', 'REF-C86', 'credito', 12,
  1250, 200
);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada,
  cantidad_producida, cantidad_scrap, unidad_medida, tiempo_estimado_minutos,
  tiempo_real_minutos, maquina_asignada, procesos, es_externo, proveedor_externo
) VALUES (
  '00000000-0000-4000-8000-0000000c8631', '00000000-0000-4000-8000-0000000c8630',
  'C86-PIEZA', 'IT86', 'Pieza técnica C8.6', 5, 5, 1, 'pza', 90, 86,
  'CNC-C86', ARRAY['Corte', 'Doblez'], true, 'Proveedor C8.6'
);

INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, estado_sii, prioridad, fecha_compromiso, id_historico,
  monto_sin_iva, monto_iva, fecha_trabajo, condicion_pago
) VALUES
  ('00000000-0000-4000-8000-0000000c8640', 'OP-008640',
   '00000000-0000-4000-8000-0000000c8620', 'completada', 'PRODUCCION_COMPLETADA', 'normal',
   now() + interval '3 days', 'LEG-C86', 100, 16, current_date, 'credito'),
  ('00000000-0000-4000-8000-0000000c8650', 'OP-008650',
   '00000000-0000-4000-8000-0000000c8620', 'programada', 'PLANIFICADA', 'normal',
   now() + interval '3 days', NULL, NULL, NULL, NULL, NULL);

SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_orden_basada_en_anterior(uuid,uuid,timestamptz)', 'EXECUTE'),
  'Un JWT no ejecuta la nueva orden basada');
SELECT ok(NOT has_function_privilege('anon',
  'public.crear_orden_basada_en_anterior(uuid,uuid,timestamptz)', 'EXECUTE'),
  'Un visitante tampoco ejecuta la nueva orden basada');
SELECT ok(has_function_privilege('service_role',
  'public.crear_orden_basada_en_anterior(uuid,uuid,timestamptz)', 'EXECUTE'),
  'El servidor sí ejecuta la nueva orden basada');

SET LOCAL ROLE service_role;
SELECT throws_ok(format(
  'SELECT * FROM public.crear_orden_basada_en_anterior(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000c8630',
  '00000000-0000-4000-8000-0000000c8612', now() + interval '12 days'),
  '42501', 'sin_permiso_crear_orden_basada', 'Un operador no crea una orden basada');
SELECT lives_ok(format(
  'SELECT * FROM public.crear_orden_basada_en_anterior(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000c8630',
  '00000000-0000-4000-8000-0000000c8611', now() + interval '12 days'),
  'Un admin crea la nueva OP desde una orden terminada no legacy');

SELECT is((
  SELECT orden.orden_origen_id FROM public.ordenes_produccion AS orden
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), '00000000-0000-4000-8000-0000000c8630'::uuid, 'La nueva OP referencia a su origen');
SELECT ok((
  SELECT destino.folio <> origen.folio
  FROM public.ordenes_produccion AS destino
  JOIN public.ordenes_produccion AS origen ON origen.id = destino.orden_origen_id
  WHERE origen.id = '00000000-0000-4000-8000-0000000c8630'
), 'La nueva OP tiene folio nuevo');
SELECT is((
  SELECT orden.estado FROM public.ordenes_produccion AS orden
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 'borrador', 'La nueva OP inicia en borrador');
SELECT ok((
  SELECT cotizacion_id IS NULL
    AND referencia_externa IS NULL
    AND condicion_pago IS NULL
    AND horas_estimadas IS NULL
    AND monto_sin_iva IS NULL
    AND monto_iva IS NULL
  FROM public.ordenes_produccion
  WHERE orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 'La nueva OP no copia datos comerciales');
SELECT is((
  SELECT count(*)::integer FROM public.cuentas_por_cobrar AS cuenta
  JOIN public.ordenes_produccion AS orden ON orden.id = cuenta.orden_id
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 0, 'La nueva OP no crea cuenta por cobrar');
SELECT ok((
  SELECT partida.codigo_pieza = 'C86-PIEZA'
    AND partida.descripcion = 'Pieza técnica C8.6'
    AND partida.cantidad_solicitada = 5
    AND partida.unidad_medida = 'pza'
    AND partida.tiempo_estimado_minutos = 90
    AND partida.maquina_asignada = 'CNC-C86'
    AND partida.procesos = ARRAY['Corte', 'Doblez']
    AND partida.es_externo = true
    AND partida.proveedor_externo = 'Proveedor C8.6'
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 'La nueva OP copia solo la partida técnica');
SELECT ok((
  SELECT partida.cantidad_producida = 0
    AND partida.cantidad_scrap = 0
    AND partida.tiempo_real_minutos = 0
  FROM public.partidas_orden_produccion AS partida
  JOIN public.ordenes_produccion AS orden ON orden.id = partida.orden_id
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 'La nueva partida no copia ejecución');
SELECT is((
  SELECT count(*)::integer FROM public.programacion_areas AS programacion
  JOIN public.ordenes_produccion AS orden ON orden.id = programacion.orden_id
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 0, 'La nueva OP no copia programación');
SELECT is((
  SELECT count(*)::integer FROM public.sesiones_trabajo AS sesion
  JOIN public.ordenes_produccion AS orden ON orden.id = sesion.orden_id
  WHERE orden.orden_origen_id = '00000000-0000-4000-8000-0000000c8630'
), 0, 'La nueva OP no copia sesiones');
SELECT throws_ok(format(
  'SELECT * FROM public.crear_orden_basada_en_anterior(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000c8640',
  '00000000-0000-4000-8000-0000000c8611', now() + interval '12 days'),
  '23514', 'orden_origen_legacy_no_admitida', 'Una orden legacy queda fuera del MVP');
SELECT throws_ok(format(
  'SELECT * FROM public.crear_orden_basada_en_anterior(%L,%L,%L)',
  '00000000-0000-4000-8000-0000000c8650',
  '00000000-0000-4000-8000-0000000c8611', now() + interval '12 days'),
  '23514', 'orden_origen_no_finalizada', 'Una orden activa no puede ser el origen');

SELECT * FROM finish();
ROLLBACK;
