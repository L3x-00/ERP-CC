-- =============================================================================
-- Fase 11.1: configuración maestra y catálogos operativos.
--
-- La configuración global se mantiene como un singleton (id = main). Los
-- bloques JSONB permiten evolucionar plantillas sin migrar por cada etiqueta,
-- mientras que los valores que participan en cálculos permanecen tipados en
-- columnas numéricas. Las mutaciones se hacen por Server Actions y por la RPC
-- de sección, nunca desde el navegador.
-- =============================================================================

-- El gerente puede administrar configuración únicamente mediante el permiso
-- granular. El administrador conserva todos los permisos por can().
INSERT INTO public.permisos_rol (rol, permiso)
VALUES ('gerente', 'configuracion')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Singleton de configuración del sistema.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
  id text PRIMARY KEY DEFAULT 'main',
  empresa_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tarifas_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  plantillas_doc_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tipo_cambio_usd numeric(10, 4) NOT NULL DEFAULT 20.0000,
  iva_porcentaje_default numeric(5, 2) NOT NULL DEFAULT 16.00,
  actualizado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configuracion_sistema_id_main CHECK (id = 'main'),
  CONSTRAINT configuracion_sistema_empresa_objeto CHECK (jsonb_typeof(empresa_json) = 'object'),
  CONSTRAINT configuracion_sistema_tarifas_objeto CHECK (jsonb_typeof(tarifas_json) = 'object'),
  CONSTRAINT configuracion_sistema_plantillas_objeto CHECK (jsonb_typeof(plantillas_doc_json) = 'object'),
  CONSTRAINT configuracion_sistema_tipo_cambio_valido CHECK (
    tipo_cambio_usd > 0
    AND tipo_cambio_usd NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT configuracion_sistema_iva_valido CHECK (
    iva_porcentaje_default >= 0
    AND iva_porcentaje_default <= 100
    AND iva_porcentaje_default NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  )
);

COMMENT ON TABLE public.configuracion_sistema IS
  'Singleton de parámetros globales de ORCA MFG ERP; la fila válida siempre es main.';

INSERT INTO public.configuracion_sistema (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Cuentas bancarias y áreas de trabajo configurables.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco text NOT NULL,
  numero_cuenta text NOT NULL,
  clabe text,
  moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('USD', 'MXN')),
  titular text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cuentas_bancarias_banco_no_vacio CHECK (char_length(btrim(banco)) BETWEEN 2 AND 120),
  CONSTRAINT cuentas_bancarias_numero_no_vacio CHECK (char_length(btrim(numero_cuenta)) BETWEEN 4 AND 50),
  CONSTRAINT cuentas_bancarias_clabe_valida CHECK (
    clabe IS NULL OR btrim(clabe) ~ '^[0-9]{18}$'
  ),
  CONSTRAINT cuentas_bancarias_titular_no_vacio CHECK (char_length(btrim(titular)) BETWEEN 2 AND 160),
  CONSTRAINT cuentas_bancarias_banco_numero_moneda_unico UNIQUE (banco, numero_cuenta, moneda)
);

CREATE TABLE IF NOT EXISTS public.areas_trabajo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  color_hex text NOT NULL DEFAULT '#3B82F6',
  costo_hora_interno numeric(10, 2) NOT NULL DEFAULT 0.00,
  tarifa_hora_venta numeric(10, 2) NOT NULL DEFAULT 0.00,
  es_externo boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT areas_trabajo_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT areas_trabajo_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT areas_trabajo_color_valido CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT areas_trabajo_costo_interno_valido CHECK (
    costo_hora_interno >= 0
    AND costo_hora_interno NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT areas_trabajo_tarifa_venta_valida CHECK (
    tarifa_hora_venta >= 0
    AND tarifa_hora_venta NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT areas_trabajo_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.cuentas_bancarias IS
  'Cuentas destino de cobros y pagos; la consulta se limita a usuarios con configuración.';
COMMENT ON TABLE public.areas_trabajo_config IS
  'Tarifas vigentes por área; los históricos de producción conservan su propia instantánea.';

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_activas
  ON public.cuentas_bancarias (activa, banco);
CREATE INDEX IF NOT EXISTS idx_areas_trabajo_config_orden
  ON public.areas_trabajo_config (activo, orden, nombre);

-- -----------------------------------------------------------------------------
-- 3. Triggers de timestamps, privilegios mínimos y RLS.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_configuracion_sistema_actualizado_en
  ON public.configuracion_sistema;
CREATE TRIGGER trigger_configuracion_sistema_actualizado_en
  BEFORE UPDATE ON public.configuracion_sistema
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_cuentas_bancarias_actualizado_en
  ON public.cuentas_bancarias;
CREATE TRIGGER trigger_cuentas_bancarias_actualizado_en
  BEFORE UPDATE ON public.cuentas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_areas_trabajo_config_actualizado_en
  ON public.areas_trabajo_config;
CREATE TRIGGER trigger_areas_trabajo_config_actualizado_en
  BEFORE UPDATE ON public.areas_trabajo_config
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

REVOKE ALL PRIVILEGES ON TABLE public.configuracion_sistema
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cuentas_bancarias
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.areas_trabajo_config
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.configuracion_sistema TO authenticated;
GRANT SELECT ON TABLE public.cuentas_bancarias TO authenticated;
GRANT SELECT ON TABLE public.areas_trabajo_config TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.configuracion_sistema TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.cuentas_bancarias TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.areas_trabajo_config TO service_role;

ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas_trabajo_config ENABLE ROW LEVEL SECURITY;

-- La información de configuración y cuentas contiene datos administrativos;
-- lectura y mutación quedan limitadas al permiso `configuracion` (admin pasa
-- por la función de ayuda). No existen políticas de escritura para el cliente.
DROP POLICY IF EXISTS configuracion_sistema_seleccionar ON public.configuracion_sistema;
CREATE POLICY configuracion_sistema_seleccionar
  ON public.configuracion_sistema FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('configuracion'))
  );

DROP POLICY IF EXISTS cuentas_bancarias_seleccionar ON public.cuentas_bancarias;
CREATE POLICY cuentas_bancarias_seleccionar
  ON public.cuentas_bancarias FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('configuracion'))
  );

DROP POLICY IF EXISTS areas_trabajo_config_seleccionar ON public.areas_trabajo_config;
CREATE POLICY areas_trabajo_config_seleccionar
  ON public.areas_trabajo_config FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('configuracion'))
  );

-- -----------------------------------------------------------------------------
-- 4. Actualización atómica de una sola sección del singleton.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.actualizar_configuracion_seccion(text, jsonb, numeric, uuid);

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

-- -----------------------------------------------------------------------------
-- 5. Publicación Realtime: los clientes reciben solo una señal y vuelven a
--    consultar mediante sus políticas RLS.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'configuracion_sistema',
    'cuentas_bancarias',
    'areas_trabajo_config'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabla);
    END IF;
  END LOOP;
END;
$$;
