-- C2.2 — Próxima acción por transición del RFQ (DC-06).
-- Verifica: transiciones no terminales exigen una próxima acción válida y la
-- guardan junto al estado; un fallo (incluida la validación LISTO) revierte
-- todo; cerrar exige motivo, no exige acción futura y limpia la pendiente.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c2201', 'c22-gerente@prueba.local');
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente C22'
WHERE id = '00000000-0000-4000-8000-0000000c2201';

INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  ('rfq_editar', 'rfq', 'Editar RFQ'),
  ('rfq_marcar_listo', 'rfq', 'Marcar RFQ listo'),
  ('rfq_cerrar', 'rfq', 'Cerrar o cancelar RFQ')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('gerente', 'rfq_editar'), ('gerente', 'rfq_marcar_listo'), ('gerente', 'rfq_cerrar')
ON CONFLICT (rol, permiso) DO NOTHING;

INSERT INTO public.pipeline (id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, vendedor_id)
VALUES ('00000000-0000-4000-8000-0000000c2210', 'OP-C22-1', 'prospecto', 'NEW',
  'Contacto C22', 'C22 Empresa', '00000000-0000-4000-8000-0000000c2201');

CREATE FUNCTION pg_temp.args(p_proxima jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'actualizado_en', (SELECT actualizado_en FROM public.pipeline
                       WHERE id = '00000000-0000-4000-8000-0000000c2210'),
    'proxima_accion', p_proxima))
$$;
CREATE FUNCTION pg_temp.proxima(p_codigo text, p_texto text, p_fecha date, p_responsable text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('codigo', p_codigo, 'texto', p_texto, 'fecha', p_fecha,
    'responsable_id', p_responsable)
$$;

-- 1-5. Validación de la próxima acción en transiciones no terminales
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210',
    'poner_en_espera_cliente', pg_temp.args(NULL), '00000000-0000-4000-8000-0000000c2201')
$$, '22023', 'proxima_accion_requerida', 'sin próxima acción no hay transición no terminal');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210',
    'poner_en_espera_cliente',
    pg_temp.args(pg_temp.proxima('NO_EXISTE', NULL, current_date, '00000000-0000-4000-8000-0000000c2201')),
    '00000000-0000-4000-8000-0000000c2201')
$$, '22023', 'proxima_accion_invalida', 'la acción debe existir en el catálogo activo');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210',
    'poner_en_espera_cliente',
    pg_temp.args(pg_temp.proxima('OTHER', '', current_date, '00000000-0000-4000-8000-0000000c2201')),
    '00000000-0000-4000-8000-0000000c2201')
$$, '22023', 'proxima_accion_detalle_requerido', '"Otro" exige detalle');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210',
    'poner_en_espera_cliente',
    pg_temp.args(pg_temp.proxima('FOLLOW_UP', NULL, current_date - 1, '00000000-0000-4000-8000-0000000c2201')),
    '00000000-0000-4000-8000-0000000c2201')
$$, '22023', 'proxima_accion_fecha_invalida', 'la fecha no puede estar en el pasado');
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210',
    'poner_en_espera_cliente',
    pg_temp.args(pg_temp.proxima('FOLLOW_UP', NULL, current_date, '00000000-0000-4000-8000-0000000c22ff')),
    '00000000-0000-4000-8000-0000000c2201')
$$, '22023', 'proxima_accion_responsable_invalido', 'el responsable debe ser un usuario activo');

-- 6-7. Transición válida guarda estado y seguimiento juntos
SELECT is(
  public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210', 'poner_en_espera_cliente',
    pg_temp.args(pg_temp.proxima('OTHER', 'Llamar al comprador', current_date + 2,
      '00000000-0000-4000-8000-0000000c2201')),
    '00000000-0000-4000-8000-0000000c2201'),
  'WAITING_CUSTOMER', 'la transición aplica con próxima acción válida');
SELECT results_eq(
  $$SELECT proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion, responsable_proxima_accion_id
    FROM public.pipeline WHERE id = '00000000-0000-4000-8000-0000000c2210'$$,
  $$VALUES ('OTHER'::text, 'Llamar al comprador'::text, current_date + 2,
            '00000000-0000-4000-8000-0000000c2201'::uuid)$$,
  'la próxima acción queda guardada con la transición');

-- 8-9. Si la validación LISTO falla, no cambia ni el estado ni el seguimiento
SELECT throws_ok($$
  SELECT public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210', 'marcar_listo',
    pg_temp.args(pg_temp.proxima('FOLLOW_UP', NULL, current_date + 5,
      '00000000-0000-4000-8000-0000000c2201')),
    '00000000-0000-4000-8000-0000000c2201')
$$, '23514', 'rfq_no_listo', 'marcar listo revalida con el seguimiento aplicado');
SELECT results_eq(
  $$SELECT estado_rfq, proxima_accion_codigo FROM public.pipeline
    WHERE id = '00000000-0000-4000-8000-0000000c2210'$$,
  $$VALUES ('WAITING_CUSTOMER'::text, 'OTHER'::text)$$,
  'el fallo revierte la transición completa, incluida la próxima acción');

-- 10-12. Terminal: motivo sí, acción futura no
SELECT is(
  public.cambiar_estado_rfq('00000000-0000-4000-8000-0000000c2210', 'cerrar',
    jsonb_build_object('motivo', 'El cliente desistió',
      'actualizado_en', (SELECT actualizado_en FROM public.pipeline
                         WHERE id = '00000000-0000-4000-8000-0000000c2210')),
    '00000000-0000-4000-8000-0000000c2201'),
  'CLOSED', 'cerrar no exige próxima acción');
SELECT results_eq(
  $$SELECT proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion, responsable_proxima_accion_id
    FROM public.pipeline WHERE id = '00000000-0000-4000-8000-0000000c2210'$$,
  $$VALUES (NULL::text, NULL::text, NULL::date, NULL::uuid)$$,
  'el estado terminal limpia la próxima acción pendiente');
SELECT is(
  (SELECT count(*)::integer FROM public.rfq_eventos WHERE rfq_id = '00000000-0000-4000-8000-0000000c2210'),
  2, 'solo las transiciones exitosas dejan evento');

SELECT * FROM finish();
ROLLBACK;
