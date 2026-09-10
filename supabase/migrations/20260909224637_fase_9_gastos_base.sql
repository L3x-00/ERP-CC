-- =============================================================================
-- Fase 9.1: Gastos, tarifas históricas y folios atómicos.
--
-- El ingreso no se duplica en esta tabla: la fuente contable de ventas sigue
-- siendo cuentas_por_cobrar (ADR-0008/0009). Los importes de gasto se guardan
-- en su moneda original y el tipo_cambio expresa MXN por unidad.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_gasto START 1001;

CREATE OR REPLACE FUNCTION public.generar_folio_gasto(p_prefijo text DEFAULT 'GTO')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefijo text := upper(trim(coalesce(p_prefijo, '')));
BEGIN
  IF v_prefijo <> 'GTO' THEN
    RAISE EXCEPTION 'El prefijo de un gasto debe ser GTO'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN 'GTO-' || lpad(nextval('public.secuencia_folio_gasto')::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_gasto(text) IS
  'Genera folios GTO-NNNNNN de forma atómica; solo service_role puede invocarla.';

REVOKE ALL ON SEQUENCE public.secuencia_folio_gasto FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.secuencia_folio_gasto TO service_role;
REVOKE EXECUTE ON FUNCTION public.generar_folio_gasto(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_gasto(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE CHECK (folio ~ '^GTO-[0-9]{6}$'),
  orden_id uuid REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  proveedor_id uuid REFERENCES public.proveedores (id) ON DELETE RESTRICT,
  categoria text NOT NULL CHECK (categoria IN (
    'materia_prima',
    'consumibles',
    'herramentental',
    'maquila_externa',
    'logistica',
    'servicios_generales',
    'nomina',
    'mantenimiento',
    'otros'
  )),
  descripcion text NOT NULL CHECK (char_length(btrim(descripcion)) BETWEEN 3 AND 500),
  monto_subtotal numeric(12, 4) NOT NULL,
  monto_iva numeric(12, 4) NOT NULL DEFAULT 0,
  monto_total numeric(12, 4) NOT NULL,
  moneda text NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('USD', 'MXN')),
  tipo_cambio numeric(10, 4) NOT NULL DEFAULT 1,
  estado_pago text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_pago IN ('pendiente', 'pagado', 'cancelado')),
  fecha_gasto timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento timestamptz,
  comprobante_url text,
  folio_comprobante text,
  metodo_pago text CHECK (metodo_pago IS NULL OR metodo_pago IN (
    'transferencia',
    'efectivo',
    'cheque',
    'tarjeta',
    'credito_proveedor'
  )),
  datos_ocr_json jsonb,
  notas text,
  creado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gastos_importes_finitos CHECK (
    monto_subtotal NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND monto_iva NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND monto_total NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT gastos_importes_no_negativos CHECK (
    monto_subtotal >= 0 AND monto_iva >= 0 AND monto_total >= 0
  ),
  CONSTRAINT gastos_total_coherente CHECK (
    monto_total = round(monto_subtotal + monto_iva, 4)
  ),
  CONSTRAINT gastos_tipo_cambio_valido CHECK (
    tipo_cambio > 0
    AND tipo_cambio NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND (moneda <> 'MXN' OR tipo_cambio = 1)
  ),
  CONSTRAINT gastos_url_comprobante_segura CHECK (
    comprobante_url IS NULL OR comprobante_url ~* '^https?://[^[:space:]]+$'
  ),
  CONSTRAINT gastos_vencimiento_coherente CHECK (
    fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha_gasto
  )
);

COMMENT ON TABLE public.gastos IS
  'Gastos contables en moneda original; los ligados a orden se incorporan a rentabilidad solo si no están cancelados.';
COMMENT ON COLUMN public.gastos.datos_ocr_json IS
  'Resultado validado del OCR; no constituye aprobación contable ni reemplaza la confirmación del usuario.';

CREATE INDEX IF NOT EXISTS idx_gastos_orden_fecha
  ON public.gastos (orden_id, fecha_gasto DESC)
  WHERE orden_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor_fecha
  ON public.gastos (proveedor_id, fecha_gasto DESC)
  WHERE proveedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_estado_fecha
  ON public.gastos (estado_pago, fecha_gasto DESC);

-- Compatibilidad con una ejecución previa que hubiera creado las columnas como
-- DATE: la migración conserva la precisión temporal sin perder los valores.
DO $$
DECLARE
  v_tipo_gasto text;
  v_tipo_vencimiento text;
BEGIN
  SELECT data_type INTO v_tipo_gasto
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'fecha_gasto';
  IF v_tipo_gasto = 'date' THEN
    ALTER TABLE public.gastos
      ALTER COLUMN fecha_gasto TYPE timestamptz USING fecha_gasto::timestamptz;
  END IF;

  SELECT data_type INTO v_tipo_vencimiento
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'gastos' AND column_name = 'fecha_vencimiento';
  IF v_tipo_vencimiento = 'date' THEN
    ALTER TABLE public.gastos
      ALTER COLUMN fecha_vencimiento TYPE timestamptz USING fecha_vencimiento::timestamptz;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_gastos_actualizado_en ON public.gastos;
CREATE TRIGGER trigger_gastos_actualizado_en
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

REVOKE ALL PRIVILEGES ON TABLE public.gastos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gastos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.gastos TO service_role;

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gastos_seleccionar_finanzas ON public.gastos;
CREATE POLICY gastos_seleccionar_finanzas
  ON public.gastos
  FOR SELECT
  TO authenticated
  USING ((SELECT privado.usuario_tiene_permiso('ver_finanzas')));

-- -----------------------------------------------------------------------------
-- Tarifas internas: el recurso mantiene la tarifa vigente y cada sesión copia
-- una instantánea al insertarse. Así un cambio futuro no reescribe historia.
-- -----------------------------------------------------------------------------
ALTER TABLE public.recursos_planeacion
  ADD COLUMN IF NOT EXISTS costo_hora_interno numeric(12, 4) NOT NULL DEFAULT 0;
ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS costo_hora_interno numeric(12, 4) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recursos_planeacion'::regclass
      AND conname = 'recursos_planeacion_costo_hora_valido'
  ) THEN
    ALTER TABLE public.recursos_planeacion
      ADD CONSTRAINT recursos_planeacion_costo_hora_valido
      CHECK (
        costo_hora_interno >= 0
        AND costo_hora_interno NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sesiones_trabajo'::regclass
      AND conname = 'sesiones_trabajo_costo_hora_valido'
  ) THEN
    ALTER TABLE public.sesiones_trabajo
      ADD CONSTRAINT sesiones_trabajo_costo_hora_valido
      CHECK (
        costo_hora_interno >= 0
        AND costo_hora_interno NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.capturar_costo_hora_sesion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_costo numeric(12, 4);
BEGIN
  SELECT recurso.costo_hora_interno
  INTO v_costo
  FROM public.programacion_areas AS programacion
  INNER JOIN public.recursos_planeacion AS recurso ON recurso.id = programacion.recurso_id
  WHERE programacion.id = NEW.programacion_id;

  IF FOUND THEN
    NEW.costo_hora_interno := v_costo;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sesiones_trabajo_capturar_costo ON public.sesiones_trabajo;
CREATE TRIGGER trigger_sesiones_trabajo_capturar_costo
  BEFORE INSERT ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.capturar_costo_hora_sesion();

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['gastos']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$$;
