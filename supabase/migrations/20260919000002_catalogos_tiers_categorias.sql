-- =============================================================================
-- Migración: catálogos comerciales configurables — tiers (CFG-08) y categorías
-- de gasto (CFG-09). ORCA MFG ERP — Configuración / Clientes / Gastos.
--
-- 1. `configuracion_sistema.tiers_json`: umbrales y descuentos por tier con los
--    valores actuales del código como default (Bronce 0/0, Plata 50000/3,
--    Oro 150000/5, Platino 300000/8) y días de vigencia del tier manual (90).
-- 2. `configuracion_sistema.categorias_gasto_json`: las 9 categorías vigentes
--    como default; la app valida capturas nuevas contra el catálogo y conserva
--    la lectura de gastos históricos con categorías retiradas.
-- 3. `actualizar_configuracion_seccion` acepta las secciones `tiers` y
--    `categorias` (CREATE OR REPLACE con firma idéntica → conserva grants).
-- 4. `gastos.categoria` deja de tener un CHECK de lista fija (impedía
--    categorías configurables) y pasa a validar formato; el valor lo valida la
--    app contra el catálogo configurado.
--
-- Aditivo e idempotente. La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas de catálogo en el singleton (defaults = valores vigentes).
-- -----------------------------------------------------------------------------
ALTER TABLE public.configuracion_sistema
  ADD COLUMN IF NOT EXISTS tiers_json jsonb NOT NULL DEFAULT '{"diasManual":90,"tiers":[{"clave":"bronce","umbralMxn":0,"descuentoPorcentaje":0},{"clave":"plata","umbralMxn":50000,"descuentoPorcentaje":3},{"clave":"oro","umbralMxn":150000,"descuentoPorcentaje":5},{"clave":"platino","umbralMxn":300000,"descuentoPorcentaje":8}]}'::jsonb,
  ADD COLUMN IF NOT EXISTS categorias_gasto_json jsonb NOT NULL DEFAULT '{"categorias":["materia_prima","consumibles","herramentental","maquila_externa","logistica","servicios_generales","nomina","mantenimiento","otros"]}'::jsonb;

COMMENT ON COLUMN public.configuracion_sistema.tiers_json IS
  'CFG-08: tiers configurables {tiers:[{clave,umbralMxn,descuentoPorcentaje}],diasManual}.';
COMMENT ON COLUMN public.configuracion_sistema.categorias_gasto_json IS
  'CFG-09: categorías de gasto configurables {categorias:[...]}.';

-- -----------------------------------------------------------------------------
-- 2. Formato de categoría (reemplaza la lista fija por formato).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_nombre text;
BEGIN
  SELECT conname INTO v_nombre
  FROM pg_constraint
  WHERE conrelid = 'public.gastos'::regclass
    AND contype = 'c'
    AND conname <> 'gastos_categoria_formato'
    AND pg_get_constraintdef(oid) ILIKE '%categoria%'
  LIMIT 1;
  IF v_nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gastos DROP CONSTRAINT %I', v_nombre);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gastos_categoria_formato'
      AND conrelid = 'public.gastos'::regclass
  ) THEN
    ALTER TABLE public.gastos
      ADD CONSTRAINT gastos_categoria_formato
      CHECK (categoria ~ '^[a-z0-9_]{2,40}$');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. RPC de configuración con las secciones nuevas.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.actualizar_configuracion_seccion(
  p_seccion text,
  p_datos jsonb,
  p_valor numeric,
  p_actualizado_por uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_configuracion public.configuracion_sistema%ROWTYPE;
  v_actor_permitido boolean;
  v_seccion text := lower(btrim(coalesce(p_seccion, '')));
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS usuario
    WHERE usuario.id = p_actualizado_por
      AND usuario.activo = true
      AND (
        usuario.rol = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.permisos_rol AS permiso
          WHERE permiso.rol = usuario.rol
            AND permiso.permiso = 'configuracion'
        )
      )
  )
  INTO v_actor_permitido;

  IF NOT v_actor_permitido THEN
    RAISE EXCEPTION 'configuracion_sin_permiso' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- La fila se bloquea antes de combinar JSONB para que dos administradores no
  -- pierdan cambios de secciones distintas por un read-modify-write cliente.
  SELECT *
  INTO v_configuracion
  FROM public.configuracion_sistema
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.configuracion_sistema (id)
    VALUES ('main')
    ON CONFLICT (id) DO NOTHING;

    SELECT *
    INTO v_configuracion
    FROM public.configuracion_sistema
    WHERE id = 'main'
    FOR UPDATE;
  END IF;

  IF v_seccion IN ('empresa', 'tarifas', 'plantillas') THEN
    IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
      RAISE EXCEPTION 'configuracion_json_invalido' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.configuracion_sistema
    SET empresa_json = CASE WHEN v_seccion = 'empresa' THEN p_datos ELSE empresa_json END,
        tarifas_json = CASE WHEN v_seccion = 'tarifas' THEN p_datos ELSE tarifas_json END,
        -- Las plantillas se actualizan por clave para que dos administradores
        -- puedan modificar T1 y otra plantilla sin perderse mutuamente.
        plantillas_doc_json = CASE
          WHEN v_seccion = 'plantillas' THEN plantillas_doc_json || p_datos
          ELSE plantillas_doc_json
        END,
        actualizado_por = p_actualizado_por
    WHERE id = 'main'
    RETURNING * INTO v_configuracion;
  ELSIF v_seccion IN ('tiers', 'categorias') THEN
    -- CFG-08/09: catálogos comerciales configurables. Se guardan como JSONB; la
    -- forma fina la valida la app (Zod) y aquí solo se exige un objeto JSON.
    IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
      RAISE EXCEPTION 'configuracion_json_invalido' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.configuracion_sistema
    SET tiers_json = CASE WHEN v_seccion = 'tiers' THEN p_datos ELSE tiers_json END,
        categorias_gasto_json = CASE
          WHEN v_seccion = 'categorias' THEN p_datos
          ELSE categorias_gasto_json
        END,
        actualizado_por = p_actualizado_por
    WHERE id = 'main'
    RETURNING * INTO v_configuracion;
  ELSIF v_seccion = 'tipo_cambio' THEN
    IF p_valor IS NULL OR p_valor <= 0
       OR p_valor IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'tipo_cambio_invalido' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.configuracion_sistema
    SET tipo_cambio_usd = round(p_valor, 4), actualizado_por = p_actualizado_por
    WHERE id = 'main'
    RETURNING * INTO v_configuracion;
  ELSIF v_seccion = 'iva' THEN
    IF p_valor IS NULL OR p_valor < 0 OR p_valor > 100
       OR p_valor IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
      RAISE EXCEPTION 'iva_invalido' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.configuracion_sistema
    SET iva_porcentaje_default = round(p_valor, 2), actualizado_por = p_actualizado_por
    WHERE id = 'main'
    RETURNING * INTO v_configuracion;
  ELSE
    RAISE EXCEPTION 'configuracion_seccion_invalida' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN to_jsonb(v_configuracion);
END;
$$;

COMMENT ON FUNCTION public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid) IS
  'Actualiza una sección de configuración bajo bloqueo de fila y valida al actor administrativo.';

REVOKE ALL ON FUNCTION public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid)
  TO service_role;
