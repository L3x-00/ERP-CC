-- SII-B1.10 — Actividad: correlation_id, privilegios, etiquetas y paginación.
-- Verifica: columna/índice, RPC solo service_role, guardas de actor,
-- contexto solo admin, resolución de etiquetas y cursor sin duplicados.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(35);

-- -----------------------------------------------------------------------------
-- Actores de prueba (el rol se actualiza sobre el perfil creado por el trigger)
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b101', 'sii-b1-act-admin@prueba.local'),
  ('00000000-0000-4000-8000-00000000b102', 'sii-b1-act-gerente@prueba.local'),
  ('00000000-0000-4000-8000-00000000b103', 'sii-b1-act-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin Actividad B1'
WHERE id = '00000000-0000-4000-8000-00000000b101';
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente Actividad B1'
WHERE id = '00000000-0000-4000-8000-00000000b102';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor Actividad B1'
WHERE id = '00000000-0000-4000-8000-00000000b103';

-- -----------------------------------------------------------------------------
-- Fixtures de negocio para resolver etiquetas
-- -----------------------------------------------------------------------------
INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000b104', 'Cliente Etiqueta SA de CV', 'Etiqueta', 'activo');

INSERT INTO public.pipeline (id, folio_op, folio_cnc, folio_rfq, nombre_contacto, empresa, vendedor_id) VALUES
  ('00000000-0000-4000-8000-00000000b105', 'OP-B1ACT-TEST', 'CNC-1124-9001', 'RFQ-1026_90',
   'Contacto Etiqueta', 'Empresa Etiqueta', '00000000-0000-4000-8000-00000000b101');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000b106', 'OP-990001',
   '00000000-0000-4000-8000-00000000b104', 'borrador', now());

INSERT INTO public.propuestas (
  id, rfq_id, cliente_id, folio_cnc, responsable_id, creado_por
) VALUES (
  '00000000-0000-4000-8000-00000000b107',
  '00000000-0000-4000-8000-00000000b105',
  '00000000-0000-4000-8000-00000000b104',
  'CNC-1026_90',
  '00000000-0000-4000-8000-00000000b101',
  '00000000-0000-4000-8000-00000000b101'
);
INSERT INTO public.propuesta_revisiones (
  id, propuesta_id, letra, folio_revision, creado_por
) VALUES (
  '00000000-0000-4000-8000-00000000b108',
  '00000000-0000-4000-8000-00000000b107',
  'A', 'CNC-1026_90-A', '00000000-0000-4000-8000-00000000b101'
);

INSERT INTO public.cuentas_bancarias (
  id, banco, numero_cuenta, moneda, titular, tipo
) VALUES (
  '00000000-0000-4000-8000-00000000b109',
  'Banco Prueba', '00001234', 'MXN', 'ORCA Prueba', 'banco'
);
INSERT INTO public.movimientos_tesoreria (
  id, cuenta_id, tipo, monto, moneda, creado_por
) VALUES (
  '00000000-0000-4000-8000-00000000b10a',
  '00000000-0000-4000-8000-00000000b109',
  'TRANSFERENCIA_SALIDA', 100, 'MXN', '00000000-0000-4000-8000-00000000b101'
);

-- Logs de etiquetas/contexto: pipeline, cliente, orden y un recurso libre (UUID sin tabla)
INSERT INTO public.logs (
  id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id, creado_en
) VALUES
  ('00000000-0000-4000-8000-00000000b111', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'pipeline',
   '00000000-0000-4000-8000-00000000b105', '{"canal":"prueba"}',
   '00000000-0000-4000-8000-00000000b1e1', '2026-10-01T09:00:00+00'),
  ('00000000-0000-4000-8000-00000000b112', '00000000-0000-4000-8000-00000000b102',
   'Gerente Actividad B1', 'gerente', 'actualizar', 'clientes',
   '00000000-0000-4000-8000-00000000b104', '{"dato":"sensible"}',
   '00000000-0000-4000-8000-00000000b1e1', '2026-10-01T09:00:01+00'),
  ('00000000-0000-4000-8000-00000000b113', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'liberar', 'ordenes',
   '00000000-0000-4000-8000-00000000b106', NULL,
   NULL, '2026-10-01T09:00:02+00'),
  ('00000000-0000-4000-8000-00000000b114', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'configurar', 'sistema',
   '00000000-0000-4000-8000-00000000b1ff', '{"clave":"valor"}',
   NULL, '2026-10-01T09:00:03+00'),
  ('00000000-0000-4000-8000-00000000b115', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'enviar_revision', 'propuestas',
   '00000000-0000-4000-8000-00000000b108', NULL,
   NULL, '2026-10-01T09:00:04+00'),
  ('00000000-0000-4000-8000-00000000b116', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'registrar_inspeccion', 'produccion',
   '00000000-0000-4000-8000-00000000b106', NULL,
   NULL, '2026-10-01T09:00:05+00'),
  ('00000000-0000-4000-8000-00000000b117', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'registrar_saldo_inicial', 'tesoreria',
   '00000000-0000-4000-8000-00000000b109', NULL,
   NULL, '2026-10-01T09:00:06+00'),
  ('00000000-0000-4000-8000-00000000b118', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'registrar_transferencia', 'tesoreria',
   '00000000-0000-4000-8000-00000000b10a', NULL,
   NULL, '2026-10-01T09:00:07+00');

-- Logs de paginación estable (5 eventos con instantes crecientes)
INSERT INTO public.logs (
  id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, creado_en
) VALUES
  ('00000000-0000-4000-8000-00000000b121', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'b1act-paginacion', 'PAG-1', '2026-10-02T12:00:01+00'),
  ('00000000-0000-4000-8000-00000000b122', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'b1act-paginacion', 'PAG-2', '2026-10-02T12:00:02+00'),
  ('00000000-0000-4000-8000-00000000b123', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'b1act-paginacion', 'PAG-3', '2026-10-02T12:00:03+00'),
  ('00000000-0000-4000-8000-00000000b124', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'b1act-paginacion', 'PAG-4', '2026-10-02T12:00:04+00'),
  ('00000000-0000-4000-8000-00000000b125', '00000000-0000-4000-8000-00000000b101',
   'Admin Actividad B1', 'admin', 'crear', 'b1act-paginacion', 'PAG-5', '2026-10-02T12:00:05+00');

-- Logs de filtro por actor con comodín escapado
INSERT INTO public.logs (
  id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, creado_en
) VALUES
  ('00000000-0000-4000-8000-00000000b131', '00000000-0000-4000-8000-00000000b101',
   'Operador 100% Real', 'admin', 'crear', 'b1act-filtros', 'FIL-1', '2026-10-03T10:00:00+00'),
  ('00000000-0000-4000-8000-00000000b132', '00000000-0000-4000-8000-00000000b101',
   'Operador 100X Real', 'admin', 'crear', 'b1act-filtros', 'FIL-2', '2026-10-03T10:00:01+00');

-- -----------------------------------------------------------------------------
-- 1-3. Columna, índice y firma de la RPC
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'logs', 'correlation_id', 'logs expone correlation_id');
SELECT has_index('public', 'logs', 'ix_logs_correlation', 'Índice parcial de correlación');
SELECT ok(
  to_regprocedure('public.obtener_actividad(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)') IS NOT NULL,
  'Existe la RPC obtener_actividad con la firma esperada'
);

-- -----------------------------------------------------------------------------
-- 4-7. Privilegios
-- -----------------------------------------------------------------------------
SELECT ok(NOT has_function_privilege('authenticated',
  'public.obtener_actividad(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)',
  'EXECUTE'), 'authenticated no ejecuta la RPC');
SELECT ok(NOT has_function_privilege('anon',
  'public.obtener_actividad(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)',
  'EXECUTE'), 'anon no ejecuta la RPC');
SELECT ok(has_function_privilege('service_role',
  'public.obtener_actividad(uuid,uuid,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,uuid)',
  'EXECUTE'), 'service_role sí ejecuta la RPC');
SELECT ok(NOT has_column_privilege('authenticated', 'public.logs', 'correlation_id', 'SELECT'),
  'authenticated no lee correlation_id directamente (solo vía RPC)');

-- -----------------------------------------------------------------------------
-- 8-10. Guardas de actor
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT * FROM public.obtener_actividad('00000000-0000-4000-8000-00000000b103'::uuid)
$$, '42501', 'sin_permiso_actividad', 'Un vendedor sin permiso no consulta la actividad');

UPDATE public.usuarios SET activo = false WHERE id = '00000000-0000-4000-8000-00000000b102';
SELECT throws_ok($$
  SELECT * FROM public.obtener_actividad('00000000-0000-4000-8000-00000000b102'::uuid)
$$, '42501', 'sin_permiso_actividad', 'Un gerente inactivo pierde el acceso');
UPDATE public.usuarios SET activo = true WHERE id = '00000000-0000-4000-8000-00000000b102';

SELECT throws_ok($$
  SELECT * FROM public.obtener_actividad('00000000-0000-4000-8000-00000000b1ff'::uuid)
$$, '42501', 'sin_permiso_actividad', 'Un actor inexistente no consulta la actividad');

-- -----------------------------------------------------------------------------
-- 11-12. Contexto: admin ve `detalles`; con permiso sin admin recibe null
-- -----------------------------------------------------------------------------
SELECT isnt(
  (SELECT contexto FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b104') LIMIT 1),
  NULL, 'El admin recibe el contexto del evento');
SELECT is(
  (SELECT contexto FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b102'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b104') LIMIT 1),
  NULL, 'Gerente con actividad_vista recibe contexto null');

-- -----------------------------------------------------------------------------
-- 13-20. Resolución de etiquetas legibles (sin UUID crudo)
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b105') LIMIT 1),
  'RFQ-1026_90', 'RFQ resuelve primero al folio RFQ vigente');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b105') LIMIT 1),
  'pipeline', 'Pipeline se marca como entidad pipeline');
SELECT matches(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b104') LIMIT 1),
  '^CLI-[0-9]{4,}$', 'Cliente resuelve a su folio visible');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b104') LIMIT 1),
  'cliente', 'Cliente se marca como entidad cliente');
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b106',
    p_modulo => 'ordenes') LIMIT 1),
  'OP-990001', 'Orden resuelve al folio');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b106',
    p_modulo => 'ordenes') LIMIT 1),
  'orden', 'Orden se marca como entidad orden');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b1ff') LIMIT 1),
  'otro', 'Un UUID sin tabla conocida queda como otro');
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b1ff') LIMIT 1),
  NULL, 'Sin etiqueta resoluble no se inventa texto');

SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b108') LIMIT 1),
  'CNC-1026_90-A', 'Propuestas resuelve una revisión a su folio visible');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b108') LIMIT 1),
  'propuesta', 'La revisión se marca como entidad propuesta');
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b106',
    p_modulo => 'produccion') LIMIT 1),
  'OP-990001', 'Producción resuelve la orden al folio visible');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b106',
    p_modulo => 'produccion') LIMIT 1),
  'produccion', 'El evento de piso se marca como entidad produccion');
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b109') LIMIT 1),
  'Banco Prueba · •••1234 · MXN', 'Tesorería resuelve una cuenta sin exponer el número completo');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b109') LIMIT 1),
  'tesoreria', 'La cuenta se marca como entidad tesoreria');
SELECT is(
  (SELECT recurso_etiqueta FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b10a') LIMIT 1),
  'Transferencia Salida · Banco Prueba · •••1234',
  'Tesorería resuelve una transferencia a su cuenta y tipo legibles');
SELECT is(
  (SELECT entidad FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_recurso_id => '00000000-0000-4000-8000-00000000b10a') LIMIT 1),
  'tesoreria', 'La transferencia se marca como entidad tesoreria');

-- -----------------------------------------------------------------------------
-- 21. Cursor incompleto rechazado
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT * FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_cursor_creado => '2026-10-02T12:00:05+00'::timestamptz)
$$, '22023', 'cursor_invalido', 'El cursor exige (creado_en, id) completos');

-- -----------------------------------------------------------------------------
-- 22-25. Paginación estable por cursor, sin duplicados
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE act_pag1 AS
SELECT * FROM public.obtener_actividad(
  '00000000-0000-4000-8000-00000000b101'::uuid,
  p_modulo => 'b1act-paginacion', p_limite => 2);

CREATE TEMP TABLE act_pag2 AS
SELECT * FROM public.obtener_actividad(
  '00000000-0000-4000-8000-00000000b101'::uuid,
  p_modulo => 'b1act-paginacion', p_limite => 2,
  p_cursor_creado => (SELECT creado_en FROM act_pag1 ORDER BY creado_en ASC, id ASC LIMIT 1),
  p_cursor_id => (SELECT id FROM act_pag1 ORDER BY creado_en ASC, id ASC LIMIT 1));

CREATE TEMP TABLE act_pag3 AS
SELECT * FROM public.obtener_actividad(
  '00000000-0000-4000-8000-00000000b101'::uuid,
  p_modulo => 'b1act-paginacion', p_limite => 2,
  p_cursor_creado => (SELECT creado_en FROM act_pag2 ORDER BY creado_en ASC, id ASC LIMIT 1),
  p_cursor_id => (SELECT id FROM act_pag2 ORDER BY creado_en ASC, id ASC LIMIT 1));

SELECT is((SELECT count(*) FROM act_pag1), 2::bigint, 'Primera página respeta el límite');
SELECT is((SELECT bool_and(hay_mas) FROM act_pag1), true, 'Primera página anuncia que hay más');
SELECT is(
  (SELECT count(*) FROM (
    SELECT id FROM act_pag1 UNION SELECT id FROM act_pag2 UNION SELECT id FROM act_pag3
  ) AS recorrido), 5::bigint, 'El recorrido por cursor no duplica eventos');
SELECT is((SELECT bool_and(NOT hay_mas) FROM act_pag3), true, 'Última página cierra el cursor');

-- -----------------------------------------------------------------------------
-- 26-27. Límites y filtro por actor
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_modulo => 'b1act-paginacion', p_limite => 0)),
  1::bigint, 'El límite se acota al rango 1..100');
SELECT is(
  (SELECT count(*) FROM public.obtener_actividad(
    '00000000-0000-4000-8000-00000000b101'::uuid,
    p_modulo => 'b1act-filtros', p_actor_texto => '100%')),
  1::bigint, 'El filtro de actor escapa comodines de ILIKE');

SELECT * FROM finish();
ROLLBACK;
