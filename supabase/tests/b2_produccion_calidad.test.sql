-- B2 - Producción, materiales, retrabajos y calidad (AUD-01, AUD-02, AUD-04).
-- Escenarios de aceptación del cliente 06/11/2026.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(27);

-- -----------------------------------------------------------------------------
-- Fixtures: una orden con dos ítems; IT01 con material propio, IT02 sin él.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b201', 'b2-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b202', 'b2-operador@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B2'
WHERE id = '00000000-0000-4000-8000-00000000b201';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B2'
WHERE id = '00000000-0000-4000-8000-00000000b202';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000b203', 'Cliente B2 SA', 'Cliente B2', 'activo');

INSERT INTO public.catalogo_materiales (
  id, codigo, nombre, unidad_base, moneda_costo, costo_vigente, fecha_vigencia_costo,
  costo_confirmado_en, costo_confirmado_por
) VALUES ('00000000-0000-4000-8000-00000000b210', 'B2-MAT', 'Lámina B2',
  'kg', 'MXN', 10, current_date, now(), '00000000-0000-4000-8000-00000000b201');

INSERT INTO public.ordenes_produccion (
  id, folio, cliente_id, estado, estado_sii, fecha_compromiso
) VALUES ('00000000-0000-4000-8000-00000000b204', 'OP-998202',
  '00000000-0000-4000-8000-00000000b203', 'en_proceso', 'EN_PRODUCCION', current_date + 7);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, codigo_item, cantidad_solicitada, unidad_medida,
  operador_asignado_id, catalogo_material_id
) VALUES
  ('00000000-0000-4000-8000-00000000b205', '00000000-0000-4000-8000-00000000b204',
   'IT01', 'IT01', 10, 'pieza', '00000000-0000-4000-8000-00000000b202',
   '00000000-0000-4000-8000-00000000b210'),
  ('00000000-0000-4000-8000-00000000b206', '00000000-0000-4000-8000-00000000b204',
   'IT02', 'IT02', 5, 'pieza', '00000000-0000-4000-8000-00000000b202', NULL);

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo, costo_hora_interno)
VALUES
  ('00000000-0000-4000-8000-00000000b211', 'B2R1', 'Recurso B2 uno', 'taller', true, 50),
  ('00000000-0000-4000-8000-00000000b216', 'B2R2', 'Recurso B2 dos', 'taller', true, 50);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, fecha_programada, turno, horas_estimadas,
  secuencia, estado_planeacion
) VALUES
  ('00000000-0000-4000-8000-00000000b212', '00000000-0000-4000-8000-00000000b204',
   '00000000-0000-4000-8000-00000000b205', '00000000-0000-4000-8000-00000000b211',
   current_date, 'matutino', 2, 1, 'en_proceso'),
  ('00000000-0000-4000-8000-00000000b213', '00000000-0000-4000-8000-00000000b204',
   '00000000-0000-4000-8000-00000000b206', '00000000-0000-4000-8000-00000000b216',
   current_date, 'matutino', 2, 1, 'en_proceso');

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, estado_sesion
) VALUES
  ('00000000-0000-4000-8000-00000000b214', '00000000-0000-4000-8000-00000000b204',
   '00000000-0000-4000-8000-00000000b205', '00000000-0000-4000-8000-00000000b212',
   '00000000-0000-4000-8000-00000000b202', now() - interval '1 hour', 'activa'),
  ('00000000-0000-4000-8000-00000000b215', '00000000-0000-4000-8000-00000000b204',
   '00000000-0000-4000-8000-00000000b206', '00000000-0000-4000-8000-00000000b213',
   '00000000-0000-4000-8000-00000000b202', now() - interval '1 hour', 'activa');

-- 1. La orden conserva un solo folio con dos ítems.
SELECT is((SELECT count(*)::integer FROM public.partidas_orden_produccion
  WHERE orden_id = '00000000-0000-4000-8000-00000000b204'), 2,
  'Una orden contiene varios ítems sin crear otra orden');

-- 2. AUD-02: IT01 exige material propio y no puede cerrar sin consumo.
SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b214',
  '00000000-0000-4000-8000-00000000b202', 3, 'finalizada')$$,
  '23514', 'consumo_material_requerido',
  'El proceso con material propio exige consumo antes de cerrar');

-- 3-5. Cierre con consumo normal y costo correcto.
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_con_consumo_operador(
  '00000000-0000-4000-8000-00000000b214',
  '00000000-0000-4000-8000-00000000b202', 3,
  '00000000-0000-4000-8000-00000000b210', 2, 0, 'Consumo de producción')$$,
  'El proceso con material cierra registrando su consumo');

SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b205'), 3::numeric,
  'El cierre actualiza las piezas producidas');

SELECT is((SELECT costo_unitario_momento FROM public.registros_consumo_material
  WHERE partida_id = '00000000-0000-4000-8000-00000000b205'), 10::numeric,
  'El consumo congela el costo del catálogo');

-- 6-7. AUD-02: IT02 no declara material propio y cierra sin consumo.
SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b215',
  '00000000-0000-4000-8000-00000000b202', 5, 'finalizada')$$,
  'Una operación sin material propio puede finalizar');

SELECT is((SELECT cantidad_producida FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b206'), 5::numeric,
  'La operación sin material conserva su avance');

-- 8-10. AUD-01: retrabajo con catálogo, sin inventario y con resultado.
SELECT lives_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000b214',
  '00000000-0000-4000-8000-00000000b210', 1, 0, 30,
  'operador', 'Corrección de doblez', NULL,
  '00000000-0000-4000-8000-00000000b202',
  '00000000-0000-4000-8000-00000000b2a1', 'RECUPERADO')$$,
  'El retrabajo se registra con material del catálogo');

SELECT is((SELECT count(*)::integer FROM public.movimientos_inventario
  WHERE orden_id = '00000000-0000-4000-8000-00000000b204' AND referencia_externa = 'RETRABAJO-OP'),
  0, 'El retrabajo no genera movimientos de inventario');

SELECT is((SELECT resultado FROM public.retrabajos_produccion
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b2a1'), 'RECUPERADO',
  'El resultado del retrabajo queda registrado');

-- 11-13. AUD-04: NOK recuperable baja lo conforme y la revalidación lo restituye.
SELECT lives_ok($$SELECT public.registrar_inspeccion_b2(
  '00000000-0000-4000-8000-00000000b204', NULL,
  '00000000-0000-4000-8000-00000000b205', 'IT01', 'CIERRE', NULL, 'RECHAZADA',
  '{}'::jsonb, 3, 2, 1, 1, '{}'::jsonb, 'NOK recuperable',
  '00000000-0000-4000-8000-00000000b201', NULL, 0,
  '00000000-0000-4000-8000-00000000b214', NULL)$$,
  'La disposición de cierre separa recuperables');

SELECT is((SELECT cantidad_conforme FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b205'), 2::numeric,
  'Las piezas recuperables dejan de ser conformes');

SELECT is((SELECT cantidad_nok_pendiente FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b205'), 1::numeric,
  'Las piezas recuperables quedan pendientes de validación');

SELECT lives_ok($$SELECT public.registrar_inspeccion_b2(
  '00000000-0000-4000-8000-00000000b204', NULL,
  '00000000-0000-4000-8000-00000000b205', 'IT01', 'REVALIDACION', NULL, 'APROBADA',
  '{}'::jsonb, 1, 1, 0, 0, '{}'::jsonb, 'Revalidación aprobada',
  '00000000-0000-4000-8000-00000000b201', NULL, 0, NULL, NULL)$$,
  'La revalidación aprobada libera las piezas recuperables');

SELECT is((SELECT cantidad_conforme FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b205'), 3::numeric,
  'Las piezas recuperadas vuelven a ser conformes sin duplicar producción');

-- 14-16. AUD-04: scrap definitivo no es entregable.
SELECT lives_ok($$SELECT public.registrar_inspeccion_b2(
  '00000000-0000-4000-8000-00000000b204', NULL,
  '00000000-0000-4000-8000-00000000b206', 'IT02', 'CIERRE', NULL, 'RECHAZADA',
  '{}'::jsonb, 5, 3, 2, 0, '{}'::jsonb, 'Dos piezas irrecuperables',
  '00000000-0000-4000-8000-00000000b201', NULL, 2,
  '00000000-0000-4000-8000-00000000b215', NULL)$$,
  'La disposición registra scrap definitivo');

SELECT is((SELECT cantidad_scrap_definitivo FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b206'), 2::numeric,
  'El scrap definitivo queda separado de las conformes');

SELECT is((SELECT cantidad_conforme FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b206'), 3::numeric,
  'Solo las piezas conformes son entregables');

-- 17. No se puede disponer dos veces la misma sesión.
SELECT throws_ok($$SELECT public.registrar_inspeccion_b2(
  '00000000-0000-4000-8000-00000000b204', NULL,
  '00000000-0000-4000-8000-00000000b206', 'IT02', 'CIERRE', NULL, 'RECHAZADA',
  '{}'::jsonb, 5, 3, 2, 0, '{}'::jsonb, 'Repetición',
  '00000000-0000-4000-8000-00000000b201', NULL, 2,
  '00000000-0000-4000-8000-00000000b215', NULL)$$,
  '23505', 'inspeccion_cierre_duplicada',
  'Una sesión no admite dos disposiciones de cierre');

-- 18-20. Entregas: el tope es lo conforme.
UPDATE public.ordenes_produccion
SET estado_sii = 'PRODUCCION_COMPLETADA'
WHERE id = '00000000-0000-4000-8000-00000000b204';

SELECT throws_ok($$SELECT public.registrar_entrega(
  '00000000-0000-4000-8000-00000000b204',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b206","cantidad_entregada":5}]'::jsonb,
  'Cliente B2', NULL, NULL, NULL,
  '00000000-0000-4000-8000-00000000b201', NULL)$$,
  '23514', 'cantidad_entrega_excede_producida',
  'No se entregan piezas NOK ni scrap');

SELECT lives_ok($$SELECT public.registrar_entrega(
  '00000000-0000-4000-8000-00000000b204',
  '[{"partida_id":"00000000-0000-4000-8000-00000000b206","cantidad_entregada":3}]'::jsonb,
  'Cliente B2', NULL, NULL, NULL,
  '00000000-0000-4000-8000-00000000b201', NULL)$$,
  'La entrega de las piezas conformes se registra');

SELECT is((SELECT coalesce(sum(cantidad_entregada), 0) FROM public.partidas_nota_entrega
  WHERE partida_id = '00000000-0000-4000-8000-00000000b206'), 3::numeric,
  'La nota entrega exactamente las piezas conformes');

-- 21-22. Reintentos sin duplicados.
SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-00000000b214',
  '00000000-0000-4000-8000-00000000b202', 3, 'finalizada')$$,
  '23514', NULL,
  'Un reintento de cierre no vuelve a mover el avance');

SELECT lives_ok($$SELECT * FROM public.registrar_retrabajo_sesion(
  '00000000-0000-4000-8000-00000000b214',
  '00000000-0000-4000-8000-00000000b210', 1, 0, 30,
  'operador', 'Corrección de doblez', NULL,
  '00000000-0000-4000-8000-00000000b202',
  '00000000-0000-4000-8000-00000000b2a1', 'RECUPERADO')$$,
  'El reintento de retrabajo con la misma solicitud es idempotente');

SELECT is((SELECT count(*)::integer FROM public.retrabajos_produccion
  WHERE solicitud_id = '00000000-0000-4000-8000-00000000b2a1'), 1,
  'El reintento no duplica el retrabajo');

-- 23-24. Invariante de calidad y contratos B2.
SELECT ok((
  SELECT cantidad_conforme + cantidad_nok_pendiente + cantidad_scrap_definitivo
    <= cantidad_producida
  FROM public.partidas_orden_produccion
  WHERE id = '00000000-0000-4000-8000-00000000b206'
), 'Conformes + pendientes + scrap nunca superan lo producido');

SELECT ok(
  to_regprocedure('public.registrar_inspeccion_b2(uuid,uuid,uuid,text,text,integer,text,jsonb,numeric,numeric,numeric,numeric,jsonb,text,uuid,uuid,numeric,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.registrar_retrabajo_sesion(uuid,uuid,numeric,numeric,numeric,text,text,text,uuid,uuid,text)') IS NOT NULL,
  'Las RPC de B2 existen sin depender de B1/B5');

SELECT * FROM finish();
ROLLBACK;
