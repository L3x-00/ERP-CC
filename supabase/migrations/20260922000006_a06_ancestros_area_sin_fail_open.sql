-- =============================================================================
-- A06 — La jerarquía de tres niveles deja de omitir la restricción de área.
--
-- Hallazgo (auditoría global 2026-09-22): `privado.area_planeacion_catalogo`
-- miraba UN solo padre. Con METAL_MECANICA → subárea → proceso (macroárea solo
-- en la raíz) devolvía NULL para el proceso y, como el helper trataba el NULL
-- como "sin nada que restringir", `privado.operador_habilitado_area` devolvía
-- true para un operador de ACABADOS: el modelo permite tres niveles pero el
-- control de acceso solo entendía dos, y su fallo abría el paso.
--
-- Reglas de esta migración:
--   1. `area_planeacion_catalogo` recorre la cadena COMPLETA de ancestros con
--      `WITH RECURSIVE`, con control de ciclos (lista de visitados) y tope de
--      profundidad. Un catálogo con un ciclo devuelve NULL y termina; nunca
--      entra en bucle.
--   2. `operador_habilitado_area` deja de abrirse cuando el área no resuelve
--      macro. Excepciones históricas que SÍ se conservan, porque son el
--      contrato vigente y no un fallo:
--        - partida SIN área (`p_area_codigo IS NULL`): no hay nada que
--          restringir;
--        - operador SIN restricciones configuradas: sin filas en
--          `operadores_areas` no hay restricción (transición).
--      Con restricciones configuradas y un código no NULL que no resuelve
--      macro (desconocido, huérfano o en ciclo), el acceso se concede solo si
--      ese código exacto está asignado al operador. Antes se concedía a todos.
--   3. `asignar_operador_a_partida_op` e `iniciar_sesion_trabajo_operador` no
--      se redefinen: ya llaman a este helper y heredan la corrección sin tocar
--      sus locks, validaciones ni efectos.
--
-- Aditiva e idempotente. No cambia RLS ni grants (los helpers siguen sin
-- EXECUTE para PUBLIC/anon/authenticated/service_role). La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Área macro de un código: primer ancestro con `area_planeacion`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.area_planeacion_catalogo(p_codigo text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE cadena AS (
    SELECT
      propia.codigo,
      propia.padre_codigo,
      propia.area_planeacion,
      1 AS nivel,
      ARRAY[propia.codigo] AS visitados
    FROM public.areas_trabajo_config AS propia
    WHERE propia.codigo = p_codigo

    UNION ALL

    SELECT
      padre.codigo,
      padre.padre_codigo,
      padre.area_planeacion,
      cadena.nivel + 1,
      cadena.visitados || padre.codigo
    FROM cadena
    INNER JOIN public.areas_trabajo_config AS padre
      ON padre.codigo = cadena.padre_codigo
    -- Corta en cuanto encuentra macro, ante un ciclo y ante una cadena absurda.
    WHERE cadena.area_planeacion IS NULL
      AND NOT (padre.codigo = ANY (cadena.visitados))
      AND cadena.nivel < 32
  )
  SELECT cadena.area_planeacion
  FROM cadena
  WHERE cadena.area_planeacion IS NOT NULL
  ORDER BY cadena.nivel
  LIMIT 1;
$$;

COMMENT ON FUNCTION privado.area_planeacion_catalogo(text) IS
  'A06/OBS-14: área macro de Planeación de un código del catálogo, resuelta por la cadena completa de ancestros con control de ciclos. NULL si el código no existe, no tiene macro en ningún ancestro o su cadena forma un ciclo.';

REVOKE EXECUTE ON FUNCTION privado.area_planeacion_catalogo(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. ¿El operador puede atender un trabajo del área indicada?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.operador_habilitado_area(
  p_operador_id uuid,
  p_area_codigo text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH trabajo AS (
    SELECT privado.area_planeacion_catalogo(p_area_codigo) AS macro
  ), asignadas AS (
    SELECT
      asignada.area_codigo,
      privado.area_planeacion_catalogo(asignada.area_codigo) AS macro
    FROM public.operadores_areas AS asignada
    WHERE asignada.operador_id = p_operador_id
  )
  SELECT
    -- Partida sin área: no hay nada que restringir (histórico).
    p_area_codigo IS NULL
    -- Operador sin áreas configuradas: sin restricción (transición).
    OR NOT EXISTS (SELECT 1 FROM asignadas)
    OR EXISTS (
      SELECT 1
      FROM asignadas
      WHERE
        -- Código exacto asignado: vale aunque no resuelva macro.
        asignadas.area_codigo = p_area_codigo
        -- Misma familia. Si el trabajo no resuelve macro, no hay familia que
        -- comparar y el acceso NO se concede por omisión.
        OR (
          (SELECT trabajo.macro FROM trabajo) IS NOT NULL
          AND asignadas.macro = (SELECT trabajo.macro FROM trabajo)
        )
    );
$$;

COMMENT ON FUNCTION privado.operador_habilitado_area(uuid, text) IS
  'A06/OBS-09/PRD-11: el operador con áreas configuradas solo atiende su familia de áreas (macro resuelta por ancestros) o un código asignado exactamente. Excepciones vigentes: partida sin área y operador sin áreas configuradas.';

REVOKE EXECUTE ON FUNCTION privado.operador_habilitado_area(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
