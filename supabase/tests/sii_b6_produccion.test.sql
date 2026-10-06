-- SII-B6 ola 1 — Producción básica: corridas, pausas, jornada, horas extra y calidad.
-- Verifica modelo, compatibilidad, códigos (99→100→101), checklist, pausa por
-- catálogo, liberación >1 h, primera pieza, referencias de lote, horas extra,
-- cierre de jornada, privilegios/RLS y hook B5 de estado_sii.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(74);

-- -----------------------------------------------------------------------------
-- Fixtures: actores, cliente, recursos, orden/partidas y programaciones
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b601', 'sii-b6-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b602', 'sii-b6-gerente@prueba.local'),
  ('00000000-0000-4000-8000-00000000b603', 'sii-b6-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B6'
WHERE id = '00000000-0000-4000-8000-00000000b601';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente B6'
WHERE id = '00000000-0000-4000-8000-00000000b602';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B6'
WHERE id = '00000000-0000-4000-8000-00000000b603';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000b604', 'Cliente B6 SA de CV', 'B6', 'activo');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo) VALUES
  ('00000000-0000-4000-8000-00000000b605', 'BT6R1', 'Recurso B6 uno', 'taller', true),
  ('00000000-0000-4000-8000-00000000b606', 'BT6R2', 'Recurso B6 dos', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-00000000b605', 'matutino', 4);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000b607', 'OP-991300',
   '00000000-0000-4000-8000-00000000b604', 'programada', now() + interval '30 days'),
  ('00000000-0000-4000-8000-00000000b60c', 'OP-991301',
   '00000000-0000-4000-8000-00000000b604', 'programada', now() + interval '30 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, maquina_asignada, operador_asignado_id
) VALUES
  ('00000000-0000-4000-8000-00000000b608', '00000000-0000-4000-8000-00000000b607',
   'P1', 'Pieza B6 uno', 10, 'pza', ARRAY['LASER_FIBRA'], 'BT6R1',
   '00000000-0000-4000-8000-00000000b603'),
  ('00000000-0000-4000-8000-00000000b609', '00000000-0000-4000-8000-00000000b607',
   'P2', 'Pieza B6 dos', 4, 'pza', ARRAY['DOB'], 'BT6R2',
   '00000000-0000-4000-8000-00000000b603'),
  ('00000000-0000-4000-8000-00000000b60d', '00000000-0000-4000-8000-00000000b60c',
   'P3', 'Pieza B6 tres', 2, 'pza', ARRAY['LASER_FIBRA'], NULL,
   '00000000-0000-4000-8000-00000000b603');

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES
  ('00000000-0000-4000-8000-00000000b60a', '00000000-0000-4000-8000-00000000b607',
   '00000000-0000-4000-8000-00000000b608', '00000000-0000-4000-8000-00000000b605',
   1, 'en_preparacion', (now() AT TIME ZONE 'America/Tijuana')::date, 'matutino', 4),
  ('00000000-0000-4000-8000-00000000b60b', '00000000-0000-4000-8000-00000000b607',
   '00000000-0000-4000-8000-00000000b609', '00000000-0000-4000-8000-00000000b606',
   1, 'en_preparacion', (now() AT TIME ZONE 'America/Tijuana')::date, 'matutino', 4);

CREATE TEMP TABLE b6 (clave text PRIMARY KEY, valor jsonb);

-- -----------------------------------------------------------------------------
-- 1-9. Modelo
-- -----------------------------------------------------------------------------
SELECT has_table('public', 'corridas', 'Existe corridas');
SELECT has_table('public', 'corrida_items', 'Existe corrida_items');
SELECT has_table('public', 'catalogo_motivos_pausa', 'Existe catalogo_motivos_pausa');
SELECT has_table('public', 'autorizaciones_hora_extra', 'Existe autorizaciones_hora_extra');
SELECT has_table('public', 'inspecciones_calidad', 'Existe inspecciones_calidad');
SELECT has_column('public', 'sesiones_trabajo', 'corrida_id', 'sesiones.corrida_id existe');
SELECT has_column('public', 'sesiones_trabajo', 'motivo_pausa_codigo', 'sesiones.motivo_pausa_codigo existe');
SELECT has_column('public', 'sesiones_trabajo', 'recurso_liberado', 'sesiones.recurso_liberado existe');
SELECT has_column('public', 'sesiones_trabajo', 'verificacion_inicio', 'sesiones.verificacion_inicio existe');

-- 10-12. Catálogo de motivos
SELECT is((SELECT count(*) FROM public.catalogo_motivos_pausa), 6::bigint,
  'Seis motivos de pausa sembrados');
SELECT ok((SELECT bool_and(libera_maquina) FROM public.catalogo_motivos_pausa
  WHERE codigo IN ('DUDA','MATERIAL')), 'DUDA y MATERIAL liberan máquina');
SELECT is(privado.motivo_pausa_legacy('MATERIAL'), 'material_pendiente',
  'El mapeo legacy conserva el valor histórico');

-- -----------------------------------------------------------------------------
-- 13-26. crear_corrida: permisos, compatibilidad, cantidades y códigos
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.crear_corrida(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
    jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b608')),
    '00000000-0000-4000-8000-00000000b603')
$$, '42501', 'sin_permiso_corrida', 'Operador sin gestionar_produccion no crea corridas');

INSERT INTO b6 (clave, valor)
SELECT 'corrida1', public.crear_corrida(
  '00000000-0000-4000-8000-00000000b607',
  (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
  jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b608')),
  '00000000-0000-4000-8000-00000000b602');
SELECT is((SELECT valor->>'codigo' FROM b6 WHERE clave = 'corrida1'), 'LAS01',
  'La primera corrida del proceso es LAS01');
SELECT is((SELECT valor->>'estado' FROM b6 WHERE clave = 'corrida1'), 'PLANIFICADA',
  'La corrida nace PLANIFICADA');
SELECT is((SELECT (valor->>'cantidad_planificada')::numeric FROM b6 WHERE clave = 'corrida1'), 10::numeric,
  'Sin cantidad explícita toma el pendiente de la partida');
SELECT is((SELECT valor->'items'->0->>'codigo_item' FROM b6 WHERE clave = 'corrida1'), 'P1',
  'El ítem conserva el código de la partida legacy');

INSERT INTO b6 (clave, valor)
SELECT 'corrida2', public.crear_corrida(
  '00000000-0000-4000-8000-00000000b607',
  (SELECT id FROM public.catalogo_procesos WHERE codigo = 'DOB'),
  jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b609')),
  '00000000-0000-4000-8000-00000000b602');
SELECT is((SELECT valor->>'codigo' FROM b6 WHERE clave = 'corrida2'), 'DOB01',
  'Cada proceso numera su propio prefijo');

SELECT throws_ok($$
  SELECT public.crear_corrida(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
    jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b60d')),
    '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'corrida_items_otra_orden', 'Nunca agrupa ítems de otra orden');

SELECT throws_ok($$
  SELECT public.crear_corrida(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT id FROM public.catalogo_procesos WHERE codigo = 'DOB'),
    jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b608')),
    '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'corrida_items_incompatibles', 'Rechaza proceso que la partida no declara');

SELECT throws_ok($$
  SELECT public.crear_corrida(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT id FROM public.catalogo_procesos WHERE codigo = 'DOB'),
    jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b609', 'cantidad', 5)),
    '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'corrida_cantidad_invalida', 'La cantidad no puede exceder el pendiente');

-- Consecutivo sin truncar: se siembran LAS03..LAS99 y se emiten LAS100/LAS101.
INSERT INTO public.corridas (orden_id, codigo, proceso_id, cantidad_planificada, creado_por)
SELECT '00000000-0000-4000-8000-00000000b607',
       'LAS' || CASE WHEN serie.n < 10 THEN '0' || serie.n::text ELSE serie.n::text END,
       (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
       1, '00000000-0000-4000-8000-00000000b602'
FROM generate_series(3, 99) AS serie(n);

INSERT INTO b6 (clave, valor)
SELECT 'corrida100', public.crear_corrida(
  '00000000-0000-4000-8000-00000000b607',
  (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
  jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b608')),
  '00000000-0000-4000-8000-00000000b602');
SELECT is((SELECT valor->>'codigo' FROM b6 WHERE clave = 'corrida100'), 'LAS100',
  'El consecutivo 100 no se trunca');

INSERT INTO b6 (clave, valor)
SELECT 'corrida101', public.crear_corrida(
  '00000000-0000-4000-8000-00000000b607',
  (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'),
  jsonb_build_array(jsonb_build_object('partida_id', '00000000-0000-4000-8000-00000000b608')),
  '00000000-0000-4000-8000-00000000b602');
SELECT is((SELECT valor->>'codigo' FROM b6 WHERE clave = 'corrida101'), 'LAS101',
  'El consecutivo 101 continúa sin ambigüedad');

-- -----------------------------------------------------------------------------
-- 27-31. iniciar_corrida y sesión con checklist
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.iniciar_corrida(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'),
    jsonb_build_object('material', true), '00000000-0000-4000-8000-00000000b602')
$$, '22023', 'verificacion_inicio_incompleta', 'Checklist incompleto no inicia corrida');

SELECT lives_ok($$
  SELECT public.iniciar_corrida(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'),
    jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
      'archivo', true, 'proceso_equipo', true, 'observaciones', ''),
    '00000000-0000-4000-8000-00000000b602')
$$, 'Checklist completo inicia la corrida');
SELECT is((SELECT estado FROM public.corridas
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1')), 'EN_PROCESO',
  'La corrida queda EN_PROCESO');

-- Hook B5: la primera sesión de trabajo deriva la orden a EN_PRODUCCION.
SELECT has_trigger('public', 'sesiones_trabajo', 'trigger_sesiones_derivar_orden_en_produccion',
  'El hook B5 de derivación a EN_PRODUCCION existe');
SELECT is((SELECT estado_sii FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b607'), 'PLANIFICADA',
  'Antes de la primera sesión la orden sigue PLANIFICADA');

SELECT throws_ok($$
  SELECT * FROM public.iniciar_sesion_trabajo_operador(
    '00000000-0000-4000-8000-00000000b607', '00000000-0000-4000-8000-00000000b608',
    '00000000-0000-4000-8000-00000000b60a', '00000000-0000-4000-8000-00000000b603')
$$, '23514', 'verificacion_inicio_incompleta', 'Sin checklist previo la sesión no inicia');

INSERT INTO b6 (clave, valor)
SELECT 'sesion1', to_jsonb(sesion.*)
FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b607', '00000000-0000-4000-8000-00000000b608',
  '00000000-0000-4000-8000-00000000b60a', '00000000-0000-4000-8000-00000000b603',
  jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
    'archivo', true, 'proceso_equipo', true, 'observaciones', 'Listo'),
  (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1')) AS sesion;
SELECT is((SELECT (valor->>'estado_sesion') FROM b6 WHERE clave = 'sesion1'), 'activa',
  'La sesión inicia activa');
SELECT isnt((SELECT corrida_id FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1')), NULL,
  'La sesión queda ligada a una corrida');
SELECT ok((SELECT verificacion_inicio IS NOT NULL FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1')),
  'La verificación inicial queda persistida');
SELECT is((SELECT estado_sii FROM public.ordenes_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b607'), 'EN_PRODUCCION',
  'La primera sesión deriva la orden a EN_PRODUCCION (hook B5)');

-- -----------------------------------------------------------------------------
-- 32-39. Pausa por catálogo, reanudación con checklist heredado
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1'),
    '00000000-0000-4000-8000-00000000b603', 0, 'pausada', 'MATERIAL', NULL)
$$, 'Pausa con motivo de catálogo válido');
SELECT is((SELECT motivo_pausa_codigo FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1')), 'MATERIAL',
  'La sesión guarda el código del catálogo');
SELECT is((SELECT motivo_pausa FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1')), 'material_pendiente',
  'El valor legacy se conserva');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-00000000b60a'), 'bloqueada',
  'La programación queda bloqueada al pausar');
SELECT is((SELECT estado FROM public.corridas
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1')), 'PAUSADA',
  'La corrida queda PAUSADA sin sesiones activas');

-- -----------------------------------------------------------------------------
-- 36-41. Reclamación del recurso liberado (>1 h, motivo liberable)
-- -----------------------------------------------------------------------------
UPDATE public.sesiones_trabajo
SET fecha_inicio = now() - interval '2 hours',
    fecha_fin = now() - interval '61 minutes'
WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1');

SELECT lives_ok($$
  SELECT public.reclamar_recurso_liberado(
    '00000000-0000-4000-8000-00000000b605', '00000000-0000-4000-8000-00000000b602')
$$, 'Reclama el recurso con pausa liberable ≥60 min');
SELECT is((SELECT recurso_liberado FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion1')), true,
  'La reclamación deja traza recurso_liberado');

SELECT throws_ok($$
  SELECT public.reclamar_recurso_liberado(
    '00000000-0000-4000-8000-00000000b605', '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'sin_sesion_liberable', 'No hay segunda sesión que reclamar');

UPDATE public.programacion_areas SET estado_planeacion = 'bloqueada'
WHERE id = '00000000-0000-4000-8000-00000000b60b';
INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  estado_sesion, motivo_pausa, motivo_pausa_codigo, corrida_id
) VALUES (
  '00000000-0000-4000-8000-00000000b620', '00000000-0000-4000-8000-00000000b607',
  '00000000-0000-4000-8000-00000000b609', '00000000-0000-4000-8000-00000000b60b',
  '00000000-0000-4000-8000-00000000b603', now() - interval '3 hours', now() - interval '90 minutes',
  'pausada', 'otro', 'COMIDA',
  (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida2'));
SELECT throws_ok($$
  SELECT public.reclamar_recurso_liberado(
    '00000000-0000-4000-8000-00000000b606', '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'sin_sesion_liberable', 'COMIDA no libera máquina');

-- -----------------------------------------------------------------------------
-- 42-47. Reanudación con checklist heredado y pausas inválidas
-- -----------------------------------------------------------------------------
INSERT INTO b6 (clave, valor)
SELECT 'sesion2', to_jsonb(sesion.*)
FROM public.reanudar_sesion_trabajo_a20(
  '00000000-0000-4000-8000-00000000b607', '00000000-0000-4000-8000-00000000b608',
  '00000000-0000-4000-8000-00000000b60a',
  (SELECT actualizado_en FROM public.programacion_areas WHERE id = '00000000-0000-4000-8000-00000000b60a'),
  '00000000-0000-4000-8000-00000000b603') AS sesion;
SELECT is((SELECT (valor->>'estado_sesion') FROM b6 WHERE clave = 'sesion2'), 'activa',
  'La reanudación crea una sesión activa');
SELECT ok((SELECT verificacion_inicio IS NOT NULL FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion2')),
  'La reanudación hereda el checklist del inicio');

SELECT throws_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion2'),
    '00000000-0000-4000-8000-00000000b603', 0, 'pausada', 'NOEXISTE', NULL)
$$, '23514', 'motivo_pausa_invalido', 'Motivo fuera del catálogo y legacy se rechaza');

SELECT throws_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion2'),
    '00000000-0000-4000-8000-00000000b603', 0, 'pausada', 'OTRA', '')
$$, '23514', 'nota_pausa_requerida', 'OTRA exige nota');

-- -----------------------------------------------------------------------------
-- 48-53. Primera pieza: bloquea y desbloquea
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion2'),
    '00000000-0000-4000-8000-00000000b603', 2, 'finalizada', NULL, NULL)
$$, '23514', 'primera_pieza_pendiente', 'Sin primera pieza aprobada no se declaran piezas');

SELECT lives_ok($$
  SELECT public.registrar_inspeccion(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'),
    '00000000-0000-4000-8000-00000000b608', 'P1',
    'PRIMERA_PIEZA', NULL, 'APROBADA', '{}'::jsonb,
    1, 1, 0, 0, '{}'::jsonb, 'Primera pieza OK',
    '00000000-0000-4000-8000-00000000b603')
$$, 'La inspección de primera pieza se registra');

SELECT lives_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion2'),
    '00000000-0000-4000-8000-00000000b603', 2, 'finalizada', NULL, NULL)
$$, 'Con primera pieza aprobada el cierre procede');
SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b608'), 2::numeric,
  'Las piezas declaradas se acumulan a la partida');
SELECT is((SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-00000000b60a'), 'programada',
  'La programación vuelve a programada al no completar la partida');

-- Referencias de lote: 1/3/5 para ≥5 e intervalos de 10 para lotes grandes.
SELECT throws_ok($$
  SELECT public.registrar_inspeccion(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'),
    '00000000-0000-4000-8000-00000000b608', 'P1',
    'REFERENCIA_LOTE', 2, 'APROBADA', '{}'::jsonb,
    1, 1, 0, 0, '{}'::jsonb, NULL, '00000000-0000-4000-8000-00000000b603')
$$, '23514', 'referencia_lote_invalida', 'Una referencia 2 no es válida en lote de 10');

SELECT lives_ok($$
  SELECT public.registrar_inspeccion(
    '00000000-0000-4000-8000-00000000b607',
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'),
    '00000000-0000-4000-8000-00000000b608', 'P1',
    'REFERENCIA_LOTE', 10, 'APROBADA', '{}'::jsonb,
    1, 1, 0, 0, '{}'::jsonb, NULL, '00000000-0000-4000-8000-00000000b603')
$$, 'La referencia 10 (intervalo) es válida');

-- -----------------------------------------------------------------------------
-- 52-56. Horas extra y cierre de jornada
-- -----------------------------------------------------------------------------
UPDATE public.programacion_areas SET estado_planeacion = 'en_preparacion'
WHERE id = '00000000-0000-4000-8000-00000000b60a';
INSERT INTO b6 (clave, valor)
SELECT 'sesion3', to_jsonb(sesion.*)
FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b607', '00000000-0000-4000-8000-00000000b608',
  '00000000-0000-4000-8000-00000000b60a', '00000000-0000-4000-8000-00000000b603') AS sesion;
-- 6 h garantiza superar la jornada de 4 h a cualquier hora local: el descuento
-- de comida (12:00-13:00 Tijuana) resta como máximo 1 h.
UPDATE public.sesiones_trabajo SET fecha_inicio = now() - interval '6 hours'
WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion3');

SELECT throws_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion3'),
    '00000000-0000-4000-8000-00000000b603', 0, 'finalizada', NULL, NULL)
$$, '23514', 'horas_extra_sin_autorizacion', 'Sin autorización no se cierra con horas extra');

SELECT lives_ok($$
  SELECT public.autorizar_horas_extra(
    '00000000-0000-4000-8000-00000000b607', NULL, 2, 'Cierre de lote urgente',
    '00000000-0000-4000-8000-00000000b602')
$$, 'Management autoriza horas extra');

SELECT lives_ok($$
  SELECT * FROM public.cerrar_sesion_trabajo_operador(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion3'),
    '00000000-0000-4000-8000-00000000b603', 0, 'finalizada', NULL, NULL)
$$, 'Con autorización vigente el cierre procede');
SELECT is((SELECT estado FROM public.autorizaciones_hora_extra
  WHERE orden_id = '00000000-0000-4000-8000-00000000b607'), 'USADA',
  'La autorización se marca USADA');

UPDATE public.programacion_areas SET estado_planeacion = 'en_preparacion'
WHERE id = '00000000-0000-4000-8000-00000000b60a';
INSERT INTO b6 (clave, valor)
SELECT 'sesion4', to_jsonb(sesion.*)
FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b607', '00000000-0000-4000-8000-00000000b608',
  '00000000-0000-4000-8000-00000000b60a', '00000000-0000-4000-8000-00000000b603') AS sesion;
-- La base local puede tener sesiones activas de otras corridas: se finalizan
-- dentro de la transacción (la RPC de cierre validaría horas extra ajenas)
-- para que cerrar_jornada cierre solo la del fixture.
UPDATE public.sesiones_trabajo
SET estado_sesion = 'finalizada', fecha_fin = coalesce(fecha_fin, now())
WHERE estado_sesion = 'activa'
  AND id <> (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion4');
SELECT is(
  (public.cerrar_jornada((now() AT TIME ZONE 'America/Tijuana')::date,
    '00000000-0000-4000-8000-00000000b602')->>'sesiones_cerradas')::integer,
  1, 'cerrar_jornada cierra la sesión activa');
SELECT is((SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion4')), 'finalizada',
  'La sesión cerrada por jornada queda finalizada');
SELECT is((SELECT motivo_pausa_codigo FROM public.sesiones_trabajo
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion4')), 'FIN_JORNADA',
  'El cierre de jornada deja causa FIN_JORNADA');
SELECT is(
  (SELECT (fecha_fin AT TIME ZONE 'America/Tijuana')::date FROM public.sesiones_trabajo
   WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'sesion4')),
  (now() AT TIME ZONE 'America/Tijuana')::date,
  'Ninguna sesión cruza de fecha');
SELECT is(
  (public.cerrar_jornada((now() AT TIME ZONE 'America/Tijuana')::date,
    '00000000-0000-4000-8000-00000000b602')->>'sesiones_cerradas')::integer,
  0, 'cerrar_jornada es idempotente');

-- -----------------------------------------------------------------------------
-- 57-60. completar/cancelar corrida, inspección de cierre y hook ausente
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.cancelar_corrida(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida1'), 'con avance',
    '00000000-0000-4000-8000-00000000b602')
$$, '23514', 'corrida_con_avance', 'No se cancela una corrida con producción finalizada');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  estado_sesion, piezas_producidas, corrida_id
) VALUES (
  '00000000-0000-4000-8000-00000000b621', '00000000-0000-4000-8000-00000000b607',
  '00000000-0000-4000-8000-00000000b609', '00000000-0000-4000-8000-00000000b60b',
  '00000000-0000-4000-8000-00000000b603', now() - interval '2 days', now() - interval '2 days',
  'finalizada', 0,
  (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida2'));
DELETE FROM public.sesiones_trabajo WHERE id = '00000000-0000-4000-8000-00000000b620';
INSERT INTO public.registros_avance_partida (
  partida_id, operador_id, cantidad_producida, cantidad_scrap, meta_proceso_id
)
SELECT '00000000-0000-4000-8000-00000000b609', '00000000-0000-4000-8000-00000000b603', 4, 0, meta.id
FROM public.metas_proceso_partida AS meta
WHERE meta.partida_id = '00000000-0000-4000-8000-00000000b609'
ORDER BY meta.secuencia DESC
LIMIT 1;
UPDATE public.partidas_orden_produccion SET cantidad_producida = 4
WHERE id = '00000000-0000-4000-8000-00000000b609';
SELECT lives_ok($$
  SELECT public.iniciar_corrida(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida2'),
    jsonb_build_object('material', true, 'espesor', true, 'cantidad', true,
      'archivo', true, 'proceso_equipo', true, 'observaciones', ''),
    '00000000-0000-4000-8000-00000000b602')
$$, 'La corrida planificada puede iniciarse antes de completarse');
SELECT lives_ok($$
  SELECT public.completar_corrida(
    (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida2'),
    '00000000-0000-4000-8000-00000000b602')
$$, 'completar_corrida convive con el hook B5 de estado_sii');
SELECT is((SELECT estado FROM public.corridas
  WHERE id = (SELECT (valor->>'id')::uuid FROM b6 WHERE clave = 'corrida2')), 'COMPLETADA',
  'La corrida queda COMPLETADA');

SELECT lives_ok($$
  SELECT public.registrar_inspeccion(
    '00000000-0000-4000-8000-00000000b607', NULL,
    '00000000-0000-4000-8000-00000000b608', 'P1',
    'CIERRE', NULL, 'APROBADA',
    '{"largo": 0.5}'::jsonb, 2, 2, 0, 0, '{"acero": 3}'::jsonb,
    'Cierre con tolerancias', '00000000-0000-4000-8000-00000000b603')
$$, 'La inspección de cierre guarda tolerancias y cantidades');

-- -----------------------------------------------------------------------------
-- 61+. Privilegios, RLS y Realtime
-- -----------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_corrida(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_corrida');
SELECT ok(has_function_privilege('service_role',
  'public.crear_corrida(uuid,uuid,jsonb,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta crear_corrida');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.registrar_inspeccion(uuid,uuid,uuid,text,text,integer,text,jsonb,numeric,numeric,numeric,numeric,jsonb,text,uuid,uuid)',
  'EXECUTE'), 'authenticated no ejecuta registrar_inspeccion');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.cerrar_jornada(date,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta cerrar_jornada');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.corridas'::regclass),
  'corridas tiene RLS');
SELECT ok(has_table_privilege('authenticated', 'public.corridas', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.corridas', 'INSERT'),
  'corridas es solo lectura para authenticated');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'corridas'
), 'corridas está publicada en Realtime');

SELECT * FROM finish();
ROLLBACK;
