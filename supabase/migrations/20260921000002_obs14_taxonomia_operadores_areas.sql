-- Bloque 3 · OBS-14 (taxonomía de taller) + OBS-09/PRD-11 (operadores por área).
--
-- 1) `areas_trabajo_config` gana jerarquía y clasificación:
--      - `tipo`: area | subarea | proceso (D-13).
--      - `padre_codigo`: subárea/proceso dentro de un área.
--      - `area_planeacion`: vínculo con las 4 áreas macro de Planeación
--        (sheet_metal | taller | acabados | ext) para que Comercial, Planeación y
--        Producción hablen del mismo taller sin romper el CHECK existente de
--        `recursos_planeacion.area`.
--    Se siembra el mapa propuesto por defecto (Metal mecánica / Fabricación
--    digital / Acabados / Externo) y se clasifican los códigos ya conocidos solo
--    si el administrador no los clasificó antes.
--
-- 2) `operadores_areas`: relación N:M operador↔área (recomendación del plan:
--    un operador puede cubrir más de un área y un área tiene varios operadores).
--
-- 3) RPC de asignación y de inicio de sesión: un operador con áreas
--    configuradas no puede tomar trabajo de otra área macro. Sin áreas
--    configuradas no hay restricción (transición): así el endurecimiento no
--    bloquea operadores aún no clasificados.
--
-- Aditiva e idempotente. La aplica el PO en remoto.

-- -----------------------------------------------------------------------------
-- 1. Taxonomía configurable (OBS-14)
-- -----------------------------------------------------------------------------
ALTER TABLE public.areas_trabajo_config
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'area',
  ADD COLUMN IF NOT EXISTS padre_codigo text,
  ADD COLUMN IF NOT EXISTS area_planeacion text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_trabajo_config_tipo_valido'
  ) THEN
    ALTER TABLE public.areas_trabajo_config
      ADD CONSTRAINT areas_trabajo_config_tipo_valido
      CHECK (tipo IN ('area', 'subarea', 'proceso'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_trabajo_config_area_planeacion_valida'
  ) THEN
    ALTER TABLE public.areas_trabajo_config
      ADD CONSTRAINT areas_trabajo_config_area_planeacion_valida
      CHECK (
        area_planeacion IS NULL
        OR area_planeacion IN ('sheet_metal', 'taller', 'acabados', 'ext')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_trabajo_config_padre_fk'
  ) THEN
    ALTER TABLE public.areas_trabajo_config
      ADD CONSTRAINT areas_trabajo_config_padre_fk
      FOREIGN KEY (padre_codigo) REFERENCES public.areas_trabajo_config (codigo)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_trabajo_config_padre_no_auto'
  ) THEN
    ALTER TABLE public.areas_trabajo_config
      ADD CONSTRAINT areas_trabajo_config_padre_no_auto
      CHECK (padre_codigo IS NULL OR padre_codigo <> codigo);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_areas_trabajo_config_padre
  ON public.areas_trabajo_config (padre_codigo);

COMMENT ON COLUMN public.areas_trabajo_config.tipo IS
  'OBS-14/D-13: clasificación del catálogo de taller (area, subarea o proceso).';
COMMENT ON COLUMN public.areas_trabajo_config.padre_codigo IS
  'OBS-14: área contenedora; NULL para las áreas raíz.';
COMMENT ON COLUMN public.areas_trabajo_config.area_planeacion IS
  'OBS-14: área macro de Planeación (sheet_metal|taller|acabados|ext); los hijos heredan la del padre si es NULL.';

-- Mapa propuesto por defecto (idempotente): las 4 áreas raíz de OBS-14.
INSERT INTO public.areas_trabajo_config (codigo, nombre, tipo, area_planeacion, es_externo, orden)
VALUES
  ('METAL_MECANICA', 'Metal mecánica', 'area', 'sheet_metal', false, 10),
  ('FABRICACION_DIGITAL', 'Fabricación digital', 'area', 'taller', false, 20),
  ('ACABADOS', 'Acabados', 'area', 'acabados', false, 30),
  ('EXTERNO', 'Externo', 'area', 'ext', true, 40)
ON CONFLICT (codigo) DO NOTHING;

-- Clasificación de los códigos ya sembrados/históricos, solo si el
-- administrador no los clasificó todavía (padre_codigo IS NULL).
UPDATE public.areas_trabajo_config
SET tipo = 'proceso', padre_codigo = 'METAL_MECANICA', area_planeacion = 'sheet_metal'
WHERE codigo IN ('LASER', 'DOB', 'SOLD', 'PINT') AND padre_codigo IS NULL;

UPDATE public.areas_trabajo_config
SET tipo = 'proceso', padre_codigo = 'FABRICACION_DIGITAL', area_planeacion = 'taller'
WHERE codigo IN ('CNC', 'ROUTER', 'LASER_CO2', 'GRABADO', 'IMPRESION', 'ESCANEO', 'CARPINTERIA')
  AND padre_codigo IS NULL;

UPDATE public.areas_trabajo_config
SET tipo = 'proceso', padre_codigo = 'ACABADOS', area_planeacion = 'acabados'
WHERE codigo IN ('PREPARADO', 'ACABADO') AND padre_codigo IS NULL;

UPDATE public.areas_trabajo_config
SET tipo = 'proceso', padre_codigo = 'EXTERNO', area_planeacion = 'ext'
WHERE codigo = 'EXT' AND padre_codigo IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Operadores por área (OBS-09/PRD-11)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operadores_areas (
  operador_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  area_codigo text NOT NULL REFERENCES public.areas_trabajo_config (codigo) ON DELETE CASCADE,
  creado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operador_id, area_codigo)
);

CREATE INDEX IF NOT EXISTS idx_operadores_areas_area
  ON public.operadores_areas (area_codigo);

COMMENT ON TABLE public.operadores_areas IS
  'OBS-09/PRD-11: áreas/subáreas/procesos que un operador puede atender. Sin filas = sin restricción (transición).';

ALTER TABLE public.operadores_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operadores_areas_seleccionar ON public.operadores_areas;
CREATE POLICY operadores_areas_seleccionar
  ON public.operadores_areas FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('configuracion'))
  );

REVOKE ALL ON TABLE public.operadores_areas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.operadores_areas TO authenticated;
GRANT ALL ON TABLE public.operadores_areas TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Helper: área macro de un código del catálogo (propia o del padre).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.area_planeacion_catalogo(p_codigo text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(propia.area_planeacion, padre.area_planeacion)
  FROM public.areas_trabajo_config AS propia
  LEFT JOIN public.areas_trabajo_config AS padre ON padre.codigo = propia.padre_codigo
  WHERE propia.codigo = p_codigo;
$$;

REVOKE EXECUTE ON FUNCTION privado.area_planeacion_catalogo(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Helper: ¿el operador puede atender un trabajo del área indicada?
--    - Sin área en la partida: no hay nada que restringir.
--    - Operador sin áreas configuradas: sin restricción (transición).
--    - Con áreas: la macro del trabajo debe estar entre las macros del operador.
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
  WITH area AS (
    SELECT privado.area_planeacion_catalogo(p_area_codigo) AS macro
  )
  SELECT
    (SELECT macro FROM area) IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.operadores_areas AS asignada
      WHERE asignada.operador_id = p_operador_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.operadores_areas AS asignada
      WHERE asignada.operador_id = p_operador_id
        AND privado.area_planeacion_catalogo(asignada.area_codigo) = (SELECT macro FROM area)
    );
$$;

REVOKE EXECUTE ON FUNCTION privado.operador_habilitado_area(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Asignación de operador: respeta el área configurada del operador.
--    Base: 20260911000002 (mismas validaciones y locks).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asignar_operador_a_partida_op(
  p_partida_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  operador_asignado_id uuid,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_area_codigo text;
BEGIN
  SELECT partida.orden_id, partida.area_trabajo_codigo
  INTO v_orden_id, v_area_codigo
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_asignable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.partida_id = p_partida_id
    AND sesion.estado_sesion = 'activa'
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'partida_con_sesion_activa' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- OBS-09: el operador debe tener habilitada el área del trabajo.
  IF NOT privado.operador_habilitado_area(p_operador_id, v_area_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET operador_asignado_id = p_operador_id
  WHERE partida.id = p_partida_id
  RETURNING partida.id, partida.operador_asignado_id, partida.actualizado_en;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Inicio de sesión del operador: misma regla de área.
--    Base: 20260814044733 (mismas validaciones, locks y efectos).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.iniciar_sesion_trabajo_operador(
  p_orden_id uuid,
  p_partida_id uuid,
  p_programacion_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  programacion_id uuid,
  operador_id uuid,
  fecha_inicio timestamptz,
  estado_sesion text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_area_codigo text;
  v_estado_orden text;
  v_programacion public.programacion_areas%ROWTYPE;
  v_recurso_activo boolean;
BEGIN
  IF p_orden_id IS NULL OR p_partida_id IS NULL OR p_programacion_id IS NULL OR p_operador_id IS NULL THEN
    RAISE EXCEPTION 'inicio_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id, partida.area_trabajo_codigo
  INTO v_orden_id, v_operador_asignado_id, v_area_codigo
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND OR v_orden_id <> p_orden_id THEN
    RAISE EXCEPTION 'orden_partida_inconsistente' USING ERRCODE = 'check_violation';
  END IF;
  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT orden.estado
  INTO v_estado_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND OR v_estado_orden NOT IN ('programada', 'pausada', 'en_proceso') THEN
    RAISE EXCEPTION 'orden_no_iniciable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- OBS-09/PRD-11: el operador debe tener habilitada el área del trabajo.
  IF NOT privado.operador_habilitado_area(p_operador_id, v_area_codigo) THEN
    RAISE EXCEPTION 'operador_area_no_asignada' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_programacion
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = p_programacion_id
    AND programacion.orden_id = p_orden_id
    AND programacion.partida_id = p_partida_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'programacion_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_programacion.estado_planeacion <> 'en_preparacion' THEN
    RAISE EXCEPTION 'programacion_no_preparada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.programacion_areas AS previa
  WHERE previa.partida_id = p_partida_id
    AND previa.secuencia < v_programacion.secuencia
    AND previa.estado_planeacion NOT IN ('completada', 'cancelada')
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'secuencia_previa_pendiente' USING ERRCODE = 'check_violation';
  END IF;

  SELECT recurso.activo INTO v_recurso_activo
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = v_programacion.recurso_id
  FOR UPDATE;
  IF NOT FOUND OR v_recurso_activo = false THEN
    RAISE EXCEPTION 'recurso_no_disponible' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.operador_id = p_operador_id AND sesion.estado_sesion = 'activa'
  ) THEN
    RAISE EXCEPTION 'operador_con_sesion_activa' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.programacion_areas AS programacion
  SET estado_planeacion = 'en_proceso'
  WHERE programacion.id = p_programacion_id;
  UPDATE public.ordenes_produccion AS orden
  SET estado = 'en_proceso', fecha_inicio = coalesce(orden.fecha_inicio, now())
  WHERE orden.id = p_orden_id;

  RETURN QUERY
  WITH nueva_sesion AS (
    INSERT INTO public.sesiones_trabajo (orden_id, partida_id, programacion_id, operador_id)
    VALUES (p_orden_id, p_partida_id, p_programacion_id, p_operador_id)
    RETURNING *
  ), marca AS (
    INSERT INTO public.registros_tiempo_operador (partida_id, operador_id, accion, notas)
    VALUES (p_partida_id, p_operador_id, 'inicio', 'Sesión de producción iniciada')
  )
  SELECT
    nueva_sesion.id, nueva_sesion.orden_id, nueva_sesion.partida_id,
    nueva_sesion.programacion_id, nueva_sesion.operador_id, nueva_sesion.fecha_inicio,
    nueva_sesion.estado_sesion, nueva_sesion.creado_en, nueva_sesion.actualizado_en
  FROM nueva_sesion;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'operador_o_programacion_con_sesion_activa' USING ERRCODE = 'unique_violation';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_sesion_trabajo_operador(uuid, uuid, uuid, uuid)
  TO service_role;
