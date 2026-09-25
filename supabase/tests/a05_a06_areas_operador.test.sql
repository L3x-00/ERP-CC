-- A05/A06: el reemplazo de áreas de un operador es atómico (un fallo conserva la
-- asignación anterior) y la jerarquía de tres niveles no abre el paso a un
-- operador ajeno ni entra en bucle ante un ciclo del catálogo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(44);

-- -----------------------------------------------------------------------------
-- Fixtures: actor administrador y cinco operadores (el trigger de auth crea el
-- perfil en public.usuarios; aquí solo se ajusta rol y estado).
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000a0501', 'a05-actor@prueba.local', '{"nombre_completo":"Actor A05"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0502', 'a05-operador@prueba.local', '{"nombre_completo":"Operador A05"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0503', 'a06-sheet@prueba.local', '{"nombre_completo":"Operador Sheet"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0504', 'a06-acabados@prueba.local', '{"nombre_completo":"Operador Acabados"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0505', 'a06-sin-areas@prueba.local', '{"nombre_completo":"Operador Sin Areas"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0506', 'a06-ciclo@prueba.local', '{"nombre_completo":"Operador Ciclo"}'::jsonb),
  ('00000000-0000-4000-8000-0000000a0507', 'a05-gerente@prueba.local', '{"nombre_completo":"Gerente A05"}'::jsonb);

UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a0501';
UPDATE public.usuarios SET rol = 'gerente', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a0507';

UPDATE public.usuarios SET rol = 'operador', activo = true
WHERE id IN (
  '00000000-0000-4000-8000-0000000a0502',
  '00000000-0000-4000-8000-0000000a0503',
  '00000000-0000-4000-8000-0000000a0504',
  '00000000-0000-4000-8000-0000000a0505',
  '00000000-0000-4000-8000-0000000a0506'
);

-- Catálogo propio: tres niveles con macroárea solo en la raíz, un área de otra
-- macro, un área inactiva y un ciclo padre↔hijo.
INSERT INTO public.areas_trabajo_config (codigo, nombre, tipo, padre_codigo, area_planeacion, activo, orden) VALUES
  ('A06_RAIZ', 'A06 Metal mecánica', 'area', NULL, 'sheet_metal', true, 900),
  ('A06_SUB', 'A06 Subárea', 'subarea', 'A06_RAIZ', NULL, true, 901),
  ('A06_PROC', 'A06 Proceso', 'proceso', 'A06_SUB', NULL, true, 902),
  ('A06_ACAB', 'A06 Acabados', 'area', NULL, 'acabados', true, 903),
  ('A06_INACTIVA', 'A06 Inactiva', 'area', NULL, 'taller', false, 904),
  ('A06_CICLO_A', 'A06 Ciclo A', 'area', NULL, NULL, true, 905),
  ('A06_CICLO_B', 'A06 Ciclo B', 'subarea', 'A06_CICLO_A', NULL, true, 906);

-- El ciclo se cierra después del alta: nada en el modelo lo impide, así que el
-- helper tiene que sobrevivirlo.
UPDATE public.areas_trabajo_config SET padre_codigo = 'A06_CICLO_B' WHERE codigo = 'A06_CICLO_A';

INSERT INTO public.operadores_areas (operador_id, area_codigo, creado_por) VALUES
  ('00000000-0000-4000-8000-0000000a0503', 'A06_RAIZ', '00000000-0000-4000-8000-0000000a0501'),
  ('00000000-0000-4000-8000-0000000a0504', 'A06_ACAB', '00000000-0000-4000-8000-0000000a0501'),
  ('00000000-0000-4000-8000-0000000a0506', 'A06_CICLO_B', '00000000-0000-4000-8000-0000000a0501');

-- Trabajo real de taller sobre el proceso de tercer nivel.
INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000a0510', 'Cliente A06', 'Cliente A06 SA de CV');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000a0520', 'OP-990501',
        '00000000-0000-4000-8000-0000000a0510', 'programada', now() + interval '10 days');

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, area_trabajo_codigo
) VALUES (
  '00000000-0000-4000-8000-0000000a0530', '00000000-0000-4000-8000-0000000a0520',
  'A06-PIEZA-1', 10, 'pieza', 'A06_PROC'
);

INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, activo)
VALUES ('00000000-0000-4000-8000-0000000a0540', 'A06-REC', 'sheet_metal', 'Recurso A06', true);

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000a0550', '00000000-0000-4000-8000-0000000a0520',
  '00000000-0000-4000-8000-0000000a0530', '00000000-0000-4000-8000-0000000a0540',
  1, 'en_preparacion', current_date, 'matutino', 4
);

-- =============================================================================
-- A05 · Reemplazo atómico (1-20)
-- =============================================================================
SELECT lives_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_RAIZ'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, 'Un administrador guarda un área válida');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'La asignación inicial queda almacenada'
);

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_RAIZ', 'a06_raiz'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '23505', 'areas_duplicadas',
  'Dos variantes del mismo código (ACABADOS/acabados) se rechazan');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'El rechazo por duplicados NO borra la asignación anterior'
);

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_RAIZ', 'A06_NO_EXISTE'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '23503', 'area_inexistente_o_inactiva',
  'Un código inexistente rechaza el lote completo');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'El rechazo por código inexistente NO borra la asignación anterior'
);

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_INACTIVA'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '23503', 'area_inexistente_o_inactiva',
  'Un área inactiva del catálogo no se puede asignar');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'El rechazo por área inactiva NO borra la asignación anterior'
);

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_ACAB'],
    '00000000-0000-4000-8000-0000000a0503'::uuid
  )
$$, '42501', 'actor_no_autorizado',
  'Un operador no puede reconfigurar las áreas de otro operador');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'El rechazo por actor no autorizado NO borra la asignación anterior'
);

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0501'::uuid,
    ARRAY['A06_RAIZ'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '23514', 'operador_no_activo',
  'El destinatario debe ser un operador activo');

SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    NULL,
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '23514', 'areas_operador_entrada_invalida',
  'Una lista NULL no se interpreta como lista vacía');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_RAIZ'],
  'La entrada inválida NO borra la asignación anterior'
);

SELECT lives_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['  a06_sub  '],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, 'Los códigos se normalizan con trim y mayúsculas');

SELECT is(
  (SELECT array_agg(asignada.area_codigo ORDER BY asignada.area_codigo)
     FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_SUB'],
  'El reemplazo válido deja exactamente el conjunto nuevo'
);

SELECT lives_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY[]::text[],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, 'La lista vacía explícita sigue siendo válida (transición)');

SELECT is(
  (SELECT count(*)::integer FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = '00000000-0000-4000-8000-0000000a0502'),
  0,
  'La lista vacía explícita deja al operador sin restricciones'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.reemplazar_areas_operador(uuid, text[], uuid)', 'EXECUTE'),
  'La RPC no es ejecutable por authenticated'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.reemplazar_areas_operador(uuid, text[], uuid)', 'EXECUTE'),
  'La RPC no es ejecutable anónimamente'
);
SELECT ok(
  has_function_privilege('service_role', 'public.reemplazar_areas_operador(uuid, text[], uuid)', 'EXECUTE'),
  'La RPC sigue disponible para el servidor'
);

-- =============================================================================
-- A06 · Ancestros, ciclos y rechazo del operador ajeno (21-38)
-- =============================================================================
SELECT lives_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_ACAB'],
    '00000000-0000-4000-8000-0000000a0507'::uuid
  )
$$, 'Un gerente activo con permiso configuracion puede reemplazar áreas');
SELECT is(
  (SELECT array_agg(area_codigo ORDER BY area_codigo) FROM public.operadores_areas
    WHERE operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_ACAB'],
  'La rama de permiso no admin deja el conjunto solicitado completo'
);
UPDATE public.usuarios SET activo = false WHERE id = '00000000-0000-4000-8000-0000000a0501';
SELECT throws_ok($$
  SELECT * FROM public.reemplazar_areas_operador(
    '00000000-0000-4000-8000-0000000a0502'::uuid,
    ARRAY['A06_RAIZ'],
    '00000000-0000-4000-8000-0000000a0501'::uuid
  )
$$, '42501', 'actor_no_autorizado', 'El administrador desactivado no conserva acceso');
SELECT is(
  (SELECT array_agg(area_codigo ORDER BY area_codigo) FROM public.operadores_areas
    WHERE operador_id = '00000000-0000-4000-8000-0000000a0502'),
  ARRAY['A06_ACAB'],
  'El rechazo del actor desactivado conserva las áreas anteriores'
);
UPDATE public.usuarios SET activo = true WHERE id = '00000000-0000-4000-8000-0000000a0501';
SELECT ok(NOT has_function_privilege('authenticated', 'privado.area_planeacion_catalogo(text)', 'EXECUTE'),
  'El helper de ancestros no es ejecutable por authenticated');
SELECT ok(NOT has_function_privilege('service_role', 'privado.operador_habilitado_area(uuid, text)', 'EXECUTE'),
  'El helper de autorización no es ejecutable directamente por service_role');

SELECT is(
  privado.area_planeacion_catalogo('A06_PROC'),
  'sheet_metal',
  'Área → subárea → proceso hereda la macroárea de la raíz'
);

SELECT ok(
  privado.area_planeacion_catalogo('A06_CICLO_B') IS NULL,
  'Un ciclo del catálogo devuelve NULL y termina (sin bucle)'
);

SELECT ok(
  privado.area_planeacion_catalogo('A06_DESCONOCIDA') IS NULL,
  'Un código fuera del catálogo no resuelve macroárea'
);

SELECT ok(
  privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0503'::uuid, 'A06_PROC'),
  'El operador de la macroárea correcta atiende el proceso de tercer nivel'
);

SELECT ok(
  NOT privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0504'::uuid, 'A06_PROC'),
  'El operador de otra macroárea NO atiende el proceso de tercer nivel'
);

SELECT ok(
  privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0503'::uuid, NULL::text),
  'Partida sin área: excepción histórica preservada'
);

SELECT ok(
  privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0505'::uuid, 'A06_PROC'),
  'Operador sin áreas configuradas: sin restricción (transición)'
);

SELECT ok(
  NOT privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0503'::uuid, 'A06_DESCONOCIDA'),
  'Un código que no resuelve macro no convierte la restricción en libre acceso'
);

SELECT ok(
  privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0506'::uuid, 'A06_CICLO_B'),
  'El código exacto asignado habilita aunque su cadena forme un ciclo'
);

SELECT ok(
  NOT privado.operador_habilitado_area(
    '00000000-0000-4000-8000-0000000a0503'::uuid, 'A06_CICLO_B'),
  'El ciclo no habilita a un operador que no lo tiene asignado'
);

-- Asignación mediante la RPC real.
SELECT throws_ok($$
  SELECT * FROM public.asignar_operador_a_partida_op(
    '00000000-0000-4000-8000-0000000a0530'::uuid,
    '00000000-0000-4000-8000-0000000a0504'::uuid
  )
$$, '23514', 'operador_area_no_asignada',
  'La asignación rechaza a un operador de otra área');

SELECT ok(
  (SELECT partida.operador_asignado_id IS NULL
     FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = '00000000-0000-4000-8000-0000000a0530'),
  'La partida sigue sin operador tras el rechazo'
);

SELECT lives_ok($$
  SELECT * FROM public.asignar_operador_a_partida_op(
    '00000000-0000-4000-8000-0000000a0530'::uuid,
    '00000000-0000-4000-8000-0000000a0503'::uuid
  )
$$, 'La asignación acepta al operador de la macroárea correcta');

SELECT is(
  (SELECT partida.operador_asignado_id
     FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = '00000000-0000-4000-8000-0000000a0530'),
  '00000000-0000-4000-8000-0000000a0503'::uuid,
  'La partida queda asignada al operador permitido'
);

-- Inicio de sesión: el operador ajeno se rechaza aunque figure como asignado
-- (asignación forzada fuera de la RPC).
UPDATE public.partidas_orden_produccion
SET operador_asignado_id = '00000000-0000-4000-8000-0000000a0504'
WHERE id = '00000000-0000-4000-8000-0000000a0530';

SELECT throws_ok($$
  SELECT * FROM public.iniciar_sesion_trabajo_operador(
    '00000000-0000-4000-8000-0000000a0520'::uuid,
    '00000000-0000-4000-8000-0000000a0530'::uuid,
    '00000000-0000-4000-8000-0000000a0550'::uuid,
    '00000000-0000-4000-8000-0000000a0504'::uuid
  )
$$, '23514', 'operador_area_no_asignada',
  'El inicio de sesión rechaza a un operador de otra área');

SELECT is(
  (SELECT count(*)::integer FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = '00000000-0000-4000-8000-0000000a0530'),
  0,
  'El rechazo del inicio no deja sesión abierta'
);

UPDATE public.partidas_orden_produccion
SET operador_asignado_id = '00000000-0000-4000-8000-0000000a0503'
WHERE id = '00000000-0000-4000-8000-0000000a0530';

SELECT lives_ok($$
  SELECT * FROM public.iniciar_sesion_trabajo_operador(
    '00000000-0000-4000-8000-0000000a0520'::uuid,
    '00000000-0000-4000-8000-0000000a0530'::uuid,
    '00000000-0000-4000-8000-0000000a0550'::uuid,
    '00000000-0000-4000-8000-0000000a0503'::uuid
  )
$$, 'El inicio de sesión acepta al operador de la macroárea correcta');

SELECT is(
  (SELECT count(*)::integer FROM public.sesiones_trabajo AS sesion
    WHERE sesion.partida_id = '00000000-0000-4000-8000-0000000a0530'
      AND sesion.estado_sesion = 'activa'),
  1,
  'El operador permitido abre exactamente una sesión'
);

SELECT * FROM finish();
ROLLBACK;
