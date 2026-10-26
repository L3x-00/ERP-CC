-- =============================================================================
-- Tipo de cambio diario (ACC-06 / E2E-02). ORCA MFG ERP — Configuración.
--
-- `configuracion_sistema.actualizado_en` cambia con CUALQUIER sección (tarifas,
-- empresa, plantillas…), por lo que no sirve para medir la vigencia del tipo de
-- cambio. Se agregan dos columnas dedicadas a la última captura explícita del
-- TC y la RPC de sección las actualiza solo cuando se guarda `tipo_cambio`.
--
-- Las filas existentes quedan con fecha nula a propósito: es preferible pedir
-- una confirmación del TC del día una sola vez a inventar una fecha que no
-- corresponde al valor vigente. La app trata la fecha nula como «sin registro».
--
-- Aditivo e idempotente. La aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fecha y actor de la última captura del tipo de cambio.
-- -----------------------------------------------------------------------------
ALTER TABLE public.configuracion_sistema
  ADD COLUMN IF NOT EXISTS tipo_cambio_actualizado_en timestamptz;

ALTER TABLE public.configuracion_sistema
  ADD COLUMN IF NOT EXISTS tipo_cambio_actualizado_por uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'configuracion_sistema_tipo_cambio_actualizado_por_fkey'
      AND conrelid = 'public.configuracion_sistema'::regclass
  ) THEN
    ALTER TABLE public.configuracion_sistema
      ADD CONSTRAINT configuracion_sistema_tipo_cambio_actualizado_por_fkey
      FOREIGN KEY (tipo_cambio_actualizado_por)
      REFERENCES public.usuarios (id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.configuracion_sistema.tipo_cambio_actualizado_en IS
  'Momento de la última captura explícita del tipo de cambio; NULL = sin registro.';
COMMENT ON COLUMN public.configuracion_sistema.tipo_cambio_actualizado_por IS
  'Administrador que confirmó por última vez el tipo de cambio del día.';

-- -----------------------------------------------------------------------------
-- 2. RPC de sección: `tipo_cambio` registra fecha y actor; otras secciones no
--    tocan esas columnas. Firma idéntica → CREATE OR REPLACE conserva grants.
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
    SET tipo_cambio_usd = round(p_valor, 4),
        -- Única sección que mueve la vigencia del TC: el registro es explícito.
        tipo_cambio_actualizado_en = now(),
        tipo_cambio_actualizado_por = p_actualizado_por,
        actualizado_por = p_actualizado_por
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
  'Actualiza una sección de configuración bajo bloqueo de fila, valida al actor administrativo y sella la vigencia del tipo de cambio.';

REVOKE ALL ON FUNCTION public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid)
  TO service_role;
