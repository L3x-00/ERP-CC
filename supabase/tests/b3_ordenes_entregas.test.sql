-- B3 — Órdenes, planeación y entregas
-- AUD-05: entregas parciales de piezas conformes sin esperar el cierre de la
--         orden; topes por cantidad conforme y por pendiente; idempotencia.
-- AUD-06: cancelación transaccional; bloquea con trabajo en ejecución y libera
--         programaciones, reclamos, corridas y la AR cuando se permite.
-- AUD-14: anulación administrativa de notas con motivo, responsable y auditoría.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(53);

-- -----------------------------------------------------------------------------
-- 0. Actores
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b3a01', 'b3-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b3a02', 'b3-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000000b3a03', 'b3-operador@prueba.local');

UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B3'
WHERE id = '00000000-0000-4000-8000-0000000b3a01';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B3'
WHERE id = '00000000-0000-4000-8000-0000000b3a02';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B3'
WHERE id = '00000000-0000-4000-8000-0000000b3a03';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('00000000-0000-4000-8000-0000000b3c01', 'Cliente B3', 'Cliente B3 SA de CV', 'activo', '30_dias');

-- -----------------------------------------------------------------------------
-- 1. Fixtures: órdenes, partidas, recursos y programaciones
-- -----------------------------------------------------------------------------
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, estado_sii, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-0000000b3d01', 'O-1026_41',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d02', 'O-1026_42',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d03', 'O-1026_43',
   '00000000-0000-4000-8000-0000000b3c01', 'programada', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d04', 'O-1026_44',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d05', 'O-1026_45',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d06', 'O-1026_46',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d07', 'O-1026_47',
   '00000000-0000-4000-8000-0000000b3c01', 'borrador', 'CONFIRMADA', now() + interval '10 days'),
  ('00000000-0000-4000-8000-0000000b3d08', 'O-1026_48',
   '00000000-0000-4000-8000-0000000b3c01', 'en_proceso', 'EN_PRODUCCION', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion
  (id, orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada, cantidad_producida, unidad_medida)
VALUES
  ('00000000-0000-4000-8000-0000000b3e01', '00000000-0000-4000-8000-0000000b3d01',
   'P-41', 'IT01', 'Pieza o1', 10, 10, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e02', '00000000-0000-4000-8000-0000000b3d02',
   'P-42', 'IT01', 'Pieza o2', 10, 10, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e03', '00000000-0000-4000-8000-0000000b3d03',
   'P-43', 'IT01', 'Pieza o3', 5, 0, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e04', '00000000-0000-4000-8000-0000000b3d04',
   'P-44', 'IT01', 'Pieza o4', 5, 5, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e05', '00000000-0000-4000-8000-0000000b3d05',
   'P-45', 'IT01', 'Pieza o5', 5, 5, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e06', '00000000-0000-4000-8000-0000000b3d06',
   'P-46', 'IT01', 'Pieza o6', 5, 5, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e07', '00000000-0000-4000-8000-0000000b3d07',
   'P-47', 'IT01', 'Pieza o7', 5, 5, 'pieza'),
  ('00000000-0000-4000-8000-0000000b3e08', '00000000-0000-4000-8000-0000000b3d08',
   'P-48', 'IT01', 'Pieza o8', 5, 5, 'pieza');

-- o2 simula calidad B2: 10 producidas, solo 6 conformes.
UPDATE public.partidas_orden_produccion SET cantidad_conforme = 6
WHERE id = '00000000-0000-4000-8000-0000000b3e02';

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo) VALUES
  ('00000000-0000-4000-8000-0000000b3f01', 'B3-REC1', 'Estación B3-1', 'taller', true),
  ('00000000-0000-4000-8000-0000000b3f02', 'B3-REC2', 'Estación B3-2', 'taller', true),
  ('00000000-0000-4000-8000-0000000b3f03', 'B3-REC3', 'Estación B3-3', 'taller', true),
  ('00000000-0000-4000-8000-0000000b3f04', 'B3-REC4', 'Estación B3-4', 'taller', true);

INSERT INTO public.programacion_areas
  (id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion, fecha_programada, turno, horas_estimadas)
VALUES
  ('00000000-0000-4000-8000-0000000b4001', '00000000-0000-4000-8000-0000000b3d03',
   '00000000-0000-4000-8000-0000000b3e03', '00000000-0000-4000-8000-0000000b3f01',
   1, 'programada', current_date, 'matutino', 4),
  ('00000000-0000-4000-8000-0000000b4002', '00000000-0000-4000-8000-0000000b3d04',
   '00000000-0000-4000-8000-0000000b3e04', '00000000-0000-4000-8000-0000000b3f02',
   1, 'en_proceso', current_date, 'matutino', 4),
  ('00000000-0000-4000-8000-0000000b4003', '00000000-0000-4000-8000-0000000b3d05',
   '00000000-0000-4000-8000-0000000b3e05', '00000000-0000-4000-8000-0000000b3f03',
   1, 'en_proceso', current_date, 'matutino', 4),
  ('00000000-0000-4000-8000-0000000b4004', '00000000-0000-4000-8000-0000000b3d06',
   '00000000-0000-4000-8000-0000000b3e06', '00000000-0000-4000-8000-0000000b3f04',
   1, 'en_proceso', current_date, 'matutino', 4);

-- Reclamo activo de una operación de o3.
INSERT INTO public.reclamos_proceso_operador
  (id, orden_id, partida_id, programacion_id, operador_id, fecha, turno, horas_estimadas, estado)
VALUES
  ('00000000-0000-4000-8000-0000000b4101', '00000000-0000-4000-8000-0000000b3d03',
   '00000000-0000-4000-8000-0000000b3e03', '00000000-0000-4000-8000-0000000b4001',
   '00000000-0000-4000-8000-0000000b3a03', current_date, 'matutino', 4, 'activo');

-- Corrida planificada de o3.
INSERT INTO public.catalogo_procesos (id, codigo, nombre, prefijo_corrida)
VALUES ('00000000-0000-4000-8000-0000000b4201', 'B3PROC', 'Proceso B3', 'BPP');
INSERT INTO public.corridas
  (id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por)
VALUES
  ('00000000-0000-4000-8000-0000000b4301', '00000000-0000-4000-8000-0000000b3d03',
   'BPP01', '00000000-0000-4000-8000-0000000b4201', 'PLANIFICADA', 5,
   '00000000-0000-4000-8000-0000000b3a01');

-- Sesión activa en o4 y sesión pausada en o5 (trabajo en ejecución).
INSERT INTO public.sesiones_trabajo
  (id, orden_id, partida_id, programacion_id, operador_id, estado_sesion, fecha_fin)
VALUES
  ('00000000-0000-4000-8000-0000000b4401', '00000000-0000-4000-8000-0000000b3d04',
   '00000000-0000-4000-8000-0000000b3e04', '00000000-0000-4000-8000-0000000b4002',
   '00000000-0000-4000-8000-0000000b3a03', 'activa', NULL),
  ('00000000-0000-4000-8000-0000000b4402', '00000000-0000-4000-8000-0000000b3d05',
   '00000000-0000-4000-8000-0000000b3e05', '00000000-0000-4000-8000-0000000b4003',
   '00000000-0000-4000-8000-0000000b3a03', 'pausada', now());

-- Cuentas por cobrar: o1 se activa al entregar el 100 %; o3 se cancela con la orden.
INSERT INTO public.cuentas_por_cobrar
  (id, orden_id, cliente_id, monto_total, saldo_pendiente, moneda, tipo_cambio_origen,
   estado, fecha_vencimiento, cobrable_desde)
VALUES
  ('00000000-0000-4000-8000-0000000b4501', '00000000-0000-4000-8000-0000000b3d01',
   '00000000-0000-4000-8000-0000000b3c01', 1000, 1000, 'MXN', 1, 'pendiente', NULL, NULL),
  ('00000000-0000-4000-8000-0000000b4503', '00000000-0000-4000-8000-0000000b3d03',
   '00000000-0000-4000-8000-0000000b3c01', 500, 500, 'MXN', 1, 'pendiente', NULL, NULL);

-- -----------------------------------------------------------------------------
-- 2. AUD-06 — cancelación con trabajo en ejecución se bloquea
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000b3d04'::uuid, 'en_proceso', 'cancelada', 'Cambio de alcance')
$$, '23514', 'orden_con_trabajo_en_proceso',
  'AUD-06: una sesión activa impide cancelar');

SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000b3d04'),
  'en_proceso', 'La orden con sesión activa no cambia de estado');

SELECT is(
  (SELECT estado_sesion FROM public.sesiones_trabajo WHERE id = '00000000-0000-4000-8000-0000000b4401'),
  'activa', 'La sesión activa no se finaliza automáticamente');

SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000b3d05'::uuid, 'en_proceso', 'cancelada', 'Cambio de alcance')
$$, '23514', 'orden_con_trabajo_en_proceso',
  'AUD-06: una sesión pausada también impide cancelar');

SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000b3d05'),
  'en_proceso', 'La orden con sesión pausada no cambia de estado');

SELECT is(
  (SELECT estado_sesion FROM public.sesiones_trabajo WHERE id = '00000000-0000-4000-8000-0000000b4402'),
  'pausada', 'La sesión pausada se conserva');

SELECT throws_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000b3d06'::uuid, 'en_proceso', 'cancelada', 'Cambio de alcance')
$$, '23514', 'orden_con_trabajo_en_proceso',
  'AUD-06: una programación en proceso impide cancelar aunque no haya sesión');

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000b4004'),
  'en_proceso', 'La programación en proceso se conserva intacta');

-- -----------------------------------------------------------------------------
-- 3. AUD-06 — cancelación permitida libera recursos de forma transaccional
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT public.cambiar_estado_orden(
    '00000000-0000-4000-8000-0000000b3d03'::uuid, (SELECT estado FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000b3d03'), 'cancelada', 'Cliente desistió')
$$, 'AUD-06: cancelar sin trabajo en ejecución completa la operación');

SELECT is(
  (SELECT estado FROM public.ordenes_produccion WHERE id = '00000000-0000-4000-8000-0000000b3d03'),
  'cancelada', 'La orden queda cancelada');

SELECT is(
  (SELECT estado_planeacion FROM public.programacion_areas
    WHERE id = '00000000-0000-4000-8000-0000000b4001'),
  'cancelada', 'La programación comprometida se libera');

SELECT is(
  (SELECT estado FROM public.reclamos_proceso_operador
    WHERE id = '00000000-0000-4000-8000-0000000b4101'),
  'liberado', 'El reclamo del operador se libera');

SELECT is(
  (SELECT estado FROM public.corridas WHERE id = '00000000-0000-4000-8000-0000000b4301'),
  'CANCELADA', 'La corrida planificada se cancela');

SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar
    WHERE id = '00000000-0000-4000-8000-0000000b4503'),
  'cancelado', 'La AR de la orden cancelada se cancela en la misma transacción');

SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d03'
      AND tipo = 'orden_cancelada_operativa'),
  1, 'La cancelación deja un evento auditable');

SELECT is(
  (SELECT count(*)::integer FROM public.programacion_areas
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d03'
      AND estado_planeacion <> 'cancelada'),
  0, 'No queda capacidad comprometida tras la cancelación');

-- -----------------------------------------------------------------------------
-- 4. AUD-05 — entregas parciales de piezas conformes
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d01'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":4}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4901'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'AUD-05: se entrega parcialmente con la orden en producción');

SELECT is(
  (SELECT es_parcial FROM public.notas_entrega
    WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4901'),
  true, 'La nota parcial se marca como parcial');

SELECT is(
  (SELECT archivada_en FROM public.ordenes_produccion
    WHERE id = '00000000-0000-4000-8000-0000000b3d01'),
  NULL::timestamptz, 'La entrega parcial no archiva la orden');

SELECT throws_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d01'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":7}]'::jsonb,
    'Receptor B3', NULL, NULL, NULL,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, '23514', 'cantidad_entrega_excede_producida',
  'AUD-05: no se entrega más de lo conforme disponible');

SELECT throws_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d01'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":1},
      {"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":1}]'::jsonb,
    'Receptor B3', NULL, NULL, NULL,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, '23514', 'partidas_entrega_invalidas',
  'AUD-05: una partida repetida en el mismo intento se rechaza');

SELECT is(
  (public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d01'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":4}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4901'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL) ->> 'yaExistia')::boolean,
  true, 'AUD-05: reintentar la misma solicitud devuelve la nota existente');

SELECT is(
  (SELECT count(*)::integer FROM public.notas_entrega
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d01'),
  1, 'AUD-05: el reintento no duplica la nota');

SELECT throws_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d02'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e02","cantidad_entregada":7}]'::jsonb,
    'Receptor B3', NULL, NULL, NULL,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, '23514', 'cantidad_entrega_excede_producida',
  'AUD-05: las piezas NOK no son entregables (B2: conforme = 6 de 10)');

SELECT throws_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d07'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e07","cantidad_entregada":1}]'::jsonb,
    'Receptor B3', NULL, NULL, NULL,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, '23514', 'orden_no_entregable',
  'AUD-05: una orden en borrador no admite entregas');

SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d01'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e01","cantidad_entregada":6}]'::jsonb,
    'Receptor B3', NULL, NULL, NULL,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'AUD-05: se completa la entrega del ítem sin cerrar la orden en producción');

SELECT is(
  (SELECT es_parcial FROM public.notas_entrega
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d01'
      AND solicitud_id IS NULL),
  false, 'La nota final del ítem no es parcial');

SELECT isnt(
  (SELECT archivada_en FROM public.ordenes_produccion
    WHERE id = '00000000-0000-4000-8000-0000000b3d01'),
  NULL::timestamptz, 'La entrega total archiva la orden');

SELECT isnt(
  (SELECT cobrable_desde FROM public.cuentas_por_cobrar
    WHERE id = '00000000-0000-4000-8000-0000000b4501'),
  NULL::timestamptz, 'La entrega total activa la AR con el plazo del cliente');

-- -----------------------------------------------------------------------------
-- 5. AUD-14 — anulación administrativa
-- -----------------------------------------------------------------------------
-- Nota parcial en o2 (AR aún no cobrable): 4 de 6 conformes.
SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d02'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e02","cantidad_entregada":4}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4902'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'Se prepara una nota parcial que luego se anula');

SELECT throws_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
    'Error de captura', '00000000-0000-4000-8000-0000000b3a03'::uuid)
$$, '42501', 'sin_permiso_anulacion',
  'AUD-14: un usuario que no es administrador no puede anular');

SELECT throws_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
    '  ', '00000000-0000-4000-8000-0000000b3a01'::uuid)
$$, '23514', 'motivo_anulacion_requerido',
  'AUD-14: el motivo es obligatorio');

SELECT lives_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
    'Cliente devolvió la pieza por medida', '00000000-0000-4000-8000-0000000b3a01'::uuid,
    '00000000-0000-4000-8000-0000000b4903'::uuid)
$$, 'AUD-14: el administrador anula la nota con motivo');

SELECT is(
  (SELECT estado FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
  'ANULADA', 'La nota queda marcada como ANULADA');

SELECT is(
  (SELECT anulada_por FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
  '00000000-0000-4000-8000-0000000b3a01'::uuid, 'Se registra el responsable');

SELECT isnt(
  (SELECT anulada_en FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
  NULL::timestamptz, 'Se registra la fecha de anulación');

SELECT is(
  (SELECT motivo_anulacion FROM public.notas_entrega
    WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
  'Cliente devolvió la pieza por medida', 'Se conserva el motivo');

SELECT is(
  (SELECT count(*)::integer FROM public.partidas_nota_entrega AS renglon
    JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
    WHERE nota.solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
  1, 'El documento original y sus renglones se conservan');

SELECT is(
  (SELECT count(*)::integer FROM public.orden_eventos_cambio
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d02'
      AND tipo = 'orden_nota_anulada'),
  1, 'La anulación deja un evento auditable');

SELECT is(
  (SELECT resultado.ya_anulada FROM public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4902'),
    'Reintento', '00000000-0000-4000-8000-0000000b3a01'::uuid,
    '00000000-0000-4000-8000-0000000b4903'::uuid) AS resultado),
  true, 'AUD-14: el reintento es idempotente');

SELECT is(
  (SELECT count(*)::integer FROM public.notas_entrega
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d02'),
  1, 'AUD-14: el reintento no duplica documentos');

SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d02'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e02","cantidad_entregada":6}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4904'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'AUD-14: las cantidades anuladas vuelven a estar disponibles sin exceder conformes');

SELECT throws_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega
      WHERE orden_id = '00000000-0000-4000-8000-0000000b3d01'
        AND solicitud_id IS NULL),
    'Intento con AR activa', '00000000-0000-4000-8000-0000000b3a01'::uuid)
$$, '23514', 'nota_con_cuenta_por_cobrar',
  'AUD-14: una nota con AR activada no se anula');

SELECT is(
  (SELECT estado FROM public.notas_entrega
    WHERE orden_id = '00000000-0000-4000-8000-0000000b3d01' AND solicitud_id IS NULL),
  'VIGENTE', 'La nota con cobranza conserva su estado');

SELECT is(
  (SELECT estado FROM public.cuentas_por_cobrar WHERE id = '00000000-0000-4000-8000-0000000b4501'),
  'pendiente', 'La AR no se altera al bloquear la anulación');

-- Nota sustituta: dos notas de o4, la segunda sustituye a la primera.
SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d04'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e04","cantidad_entregada":2}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4905'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'Se prepara la nota original de o4');

SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d04'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e04","cantidad_entregada":1}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4906'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'Se prepara la nota sustituta de o4');

SELECT lives_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4905'),
    'Se corrigió el documento', '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL,
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4906'))
$$, 'AUD-14: se anula una nota enlazando su sustituta');

SELECT is(
  (SELECT nota_sustituta_id FROM public.notas_entrega
    WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4905'),
  (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4906'),
  'AUD-14: la nota anulada conserva el enlace a su sustituta');

-- o8 sin AR: entregar el 100 % archiva; anular reabre las cantidades pendientes.
SELECT lives_ok($$
  SELECT public.registrar_entrega(
    '00000000-0000-4000-8000-0000000b3d08'::uuid,
    '[{"partida_id":"00000000-0000-4000-8000-0000000b3e08","cantidad_entregada":5}]'::jsonb,
    'Receptor B3', NULL, NULL,
    '00000000-0000-4000-8000-0000000b4907'::uuid,
    '00000000-0000-4000-8000-0000000b3a01'::uuid, NULL)
$$, 'La entrega total de o8 archiva la orden');

SELECT isnt(
  (SELECT archivada_en FROM public.ordenes_produccion
    WHERE id = '00000000-0000-4000-8000-0000000b3d08'),
  NULL::timestamptz, 'La orden de o8 queda archivada al entregarse');

SELECT lives_ok($$
  SELECT public.anular_nota_entrega(
    (SELECT id FROM public.notas_entrega WHERE solicitud_id = '00000000-0000-4000-8000-0000000b4907'),
    'Documento emitido por error', '00000000-0000-4000-8000-0000000b3a01'::uuid)
$$, 'AUD-14: se anula la nota total de o8');

SELECT is(
  (SELECT archivada_en FROM public.ordenes_produccion
    WHERE id = '00000000-0000-4000-8000-0000000b3d08'),
  NULL::timestamptz, 'AUD-14: al anular se recuperan las cantidades pendientes y se reabre la orden');

SELECT * FROM finish();
ROLLBACK;
