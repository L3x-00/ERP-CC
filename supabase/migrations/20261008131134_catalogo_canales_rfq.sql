-- =============================================================================
-- Observaciones cliente DC-02 — catálogo configurable de canales RFQ
--
-- Aditiva y compatible con valores históricos:
--   * catálogo versionado, sin DELETE y con lectura RLS;
--   * semillas WhatsApp, Correo, Teléfono, Visita, Referido y Otro;
--   * `pipeline.canal_detalle` conserva el detalle de Otro;
--   * valores legacy que ya existen pueden seguir leyéndose/actualizándose,
--     pero toda selección nueva debe pertenecer al catálogo activo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.catalogo_canales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  es_otro boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_canales_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT catalogo_canales_nombre_no_vacio CHECK (
    char_length(btrim(nombre)) BETWEEN 2 AND 120
  ),
  CONSTRAINT catalogo_canales_orden_valido CHECK (orden >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_canales_otro
  ON public.catalogo_canales (es_otro) WHERE es_otro;

COMMENT ON TABLE public.catalogo_canales IS
  'DC-02: canales configurables del RFQ; las bajas son lógicas y los códigos históricos permanecen legibles.';
COMMENT ON COLUMN public.catalogo_canales.es_otro IS
  'Solo un canal puede habilitar detalle libre obligatorio en el RFQ.';

ALTER TABLE public.catalogo_canales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalogo_canales FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.catalogo_canales TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_canales TO service_role;

DROP POLICY IF EXISTS catalogo_canales_seleccionar ON public.catalogo_canales;
CREATE POLICY catalogo_canales_seleccionar
  ON public.catalogo_canales FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP TRIGGER IF EXISTS trigger_catalogo_canales_version ON public.catalogo_canales;
CREATE TRIGGER trigger_catalogo_canales_version
  BEFORE INSERT OR UPDATE ON public.catalogo_canales
  FOR EACH ROW EXECUTE FUNCTION privado.registrar_version_catalogo();

DROP TRIGGER IF EXISTS trigger_catalogo_canales_sin_borrado ON public.catalogo_canales;
CREATE TRIGGER trigger_catalogo_canales_sin_borrado
  BEFORE DELETE ON public.catalogo_canales
  FOR EACH ROW EXECUTE FUNCTION privado.impedir_borrado_catalogo();

CREATE OR REPLACE FUNCTION privado.impedir_cambio_codigo_canal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'codigo_canal_inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_catalogo_canales_codigo_inmutable ON public.catalogo_canales;
CREATE TRIGGER trigger_catalogo_canales_codigo_inmutable
  BEFORE UPDATE OF codigo ON public.catalogo_canales
  FOR EACH ROW EXECUTE FUNCTION privado.impedir_cambio_codigo_canal();

REVOKE ALL ON FUNCTION privado.impedir_cambio_codigo_canal()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.catalogo_canales (codigo, nombre, es_otro, orden) VALUES
  ('WHATSAPP', 'WhatsApp', false, 10),
  ('CORREO',   'Correo',   false, 20),
  ('TELEFONO', 'Teléfono', false, 30),
  ('VISITA',   'Visita',   false, 40),
  ('REFERIDO', 'Referido', false, 50),
  ('OTRO',     'Otro',     true,  60)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS canal_detalle text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pipeline_canal_detalle_valido'
      AND conrelid = 'public.pipeline'::regclass
  ) THEN
    ALTER TABLE public.pipeline
      ADD CONSTRAINT pipeline_canal_detalle_valido CHECK (
        canal_detalle IS NULL OR char_length(btrim(canal_detalle)) BETWEEN 1 AND 300
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.pipeline.canal IS
  'DC-02: código de catalogo_canales para capturas nuevas; valores legacy se conservan por grandfathering.';
COMMENT ON COLUMN public.pipeline.canal_detalle IS
  'DC-02: texto obligatorio cuando el canal seleccionado tiene es_otro=true.';

CREATE OR REPLACE FUNCTION privado.validar_canal_rfq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_canal public.catalogo_canales%ROWTYPE;
  v_cambio boolean;
BEGIN
  NEW.canal := NULLIF(btrim(NEW.canal), '');
  NEW.canal_detalle := NULLIF(btrim(NEW.canal_detalle), '');

  IF NEW.canal IS NULL THEN
    NEW.canal_detalle := NULL;
    RETURN NEW;
  END IF;

  v_cambio := CASE
    WHEN TG_OP = 'INSERT' THEN true
    ELSE NEW.canal IS DISTINCT FROM OLD.canal
  END;

  SELECT c.* INTO v_canal
  FROM public.catalogo_canales AS c
  WHERE c.codigo = upper(NEW.canal)
     OR upper(c.nombre) = upper(NEW.canal)
  ORDER BY (c.codigo = upper(NEW.canal)) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Un valor ya persistido antes de DC-02 puede acompañar otras ediciones;
    -- no se permite elegir un valor nuevo fuera del catálogo.
    IF NOT v_cambio THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'canal_rfq_no_catalogado' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_cambio := NOT (
      OLD.canal IS NOT NULL
      AND (
        upper(OLD.canal) = v_canal.codigo
        OR upper(OLD.canal) = upper(v_canal.nombre)
      )
    );
  END IF;

  IF v_cambio AND NOT v_canal.activo THEN
    RAISE EXCEPTION 'canal_rfq_inactivo' USING ERRCODE = '23514';
  END IF;

  -- Compatibilidad con capturas antiguas como `correo` o `Teléfono`:
  -- todo valor reconocido queda persistido con el código canónico estable.
  NEW.canal := v_canal.codigo;

  IF v_canal.es_otro THEN
    IF NEW.canal_detalle IS NULL THEN
      RAISE EXCEPTION 'canal_otro_requiere_detalle' USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.canal_detalle := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.validar_canal_rfq() IS
  'DC-02: valida canal activo al cambiarlo, exige detalle para Otro y conserva valores legacy/inactivos ya usados.';

DROP TRIGGER IF EXISTS trigger_pipeline_validar_canal_rfq ON public.pipeline;
CREATE TRIGGER trigger_pipeline_validar_canal_rfq
  BEFORE INSERT OR UPDATE OF canal, canal_detalle ON public.pipeline
  FOR EACH ROW EXECUTE FUNCTION privado.validar_canal_rfq();

REVOKE ALL ON FUNCTION privado.validar_canal_rfq()
  FROM PUBLIC, anon, authenticated, service_role;
