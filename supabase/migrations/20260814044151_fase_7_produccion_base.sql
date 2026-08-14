-- =============================================================================
-- Fase 7.1: base de Producción.
--
-- Las sesiones se relacionan con la programación concreta que toma el recurso.
-- Ninguna tabla concede escrituras al navegador; las mutaciones quedan en RPCs
-- de service_role de la sub-fase siguiente.
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_nota_entrega START 1001;

CREATE OR REPLACE FUNCTION public.generar_folio_nota_entrega(p_prefijo text DEFAULT 'NE')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_prefijo text := upper(trim(coalesce(p_prefijo, '')));
BEGIN
  IF v_prefijo <> 'NE' THEN
    RAISE EXCEPTION 'El prefijo de una nota de entrega debe ser NE'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN 'NE-' || lpad(nextval('public.secuencia_folio_nota_entrega')::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_nota_entrega(text) IS
  'Genera folios NE-NNNNNN de forma atómica; disponible solo para service_role.';

REVOKE ALL ON SEQUENCE public.secuencia_folio_nota_entrega FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.secuencia_folio_nota_entrega TO service_role;
REVOKE EXECUTE ON FUNCTION public.generar_folio_nota_entrega(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_nota_entrega(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.sesiones_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE CASCADE,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE CASCADE,
  programacion_id uuid NOT NULL REFERENCES public.programacion_areas (id) ON DELETE RESTRICT,
  operador_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  fecha_inicio timestamptz NOT NULL DEFAULT now(),
  fecha_fin timestamptz,
  horas_brutas numeric(8, 2) NOT NULL DEFAULT 0 CHECK (horas_brutas >= 0),
  horas_netas numeric(8, 2) NOT NULL DEFAULT 0 CHECK (horas_netas >= 0),
  piezas_producidas numeric(12, 4) NOT NULL DEFAULT 0 CHECK (piezas_producidas >= 0),
  motivo_pausa text CHECK (motivo_pausa IN (
    'falta_informacion',
    'material_pendiente',
    'aprobacion_cliente',
    'problema_tecnico',
    'mantenimiento',
    'otro'
  )),
  notas text,
  estado_sesion text NOT NULL DEFAULT 'activa'
    CHECK (estado_sesion IN ('activa', 'pausada', 'finalizada')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sesiones_trabajo_fechas_coherentes
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT sesiones_trabajo_estado_cierre_coherente
    CHECK (
      (estado_sesion = 'activa' AND fecha_fin IS NULL)
      OR (estado_sesion IN ('pausada', 'finalizada') AND fecha_fin IS NOT NULL)
    )
);

COMMENT ON TABLE public.sesiones_trabajo IS
  'Intervalos auditables de trabajo por operador, partida y programación de recurso.';

CREATE INDEX IF NOT EXISTS idx_sesiones_trabajo_orden ON public.sesiones_trabajo (orden_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_trabajo_partida ON public.sesiones_trabajo (partida_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_trabajo_programacion ON public.sesiones_trabajo (programacion_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_trabajo_operador_fecha
  ON public.sesiones_trabajo (operador_id, fecha_inicio DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sesiones_trabajo_operador_activa_unica
  ON public.sesiones_trabajo (operador_id) WHERE estado_sesion = 'activa';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sesiones_trabajo_programacion_activa_unica
  ON public.sesiones_trabajo (programacion_id) WHERE estado_sesion = 'activa';

CREATE OR REPLACE FUNCTION public.validar_sesion_trabajo_corresponde_programacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.programacion_areas AS programacion
  WHERE programacion.id = NEW.programacion_id
    AND programacion.orden_id = NEW.orden_id
    AND programacion.partida_id = NEW.partida_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_programacion_inconsistente' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sesiones_trabajo_programacion ON public.sesiones_trabajo;
CREATE TRIGGER trigger_sesiones_trabajo_programacion
  BEFORE INSERT OR UPDATE OF orden_id, partida_id, programacion_id ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.validar_sesion_trabajo_corresponde_programacion();

DROP TRIGGER IF EXISTS trigger_sesiones_trabajo_actualizado_en ON public.sesiones_trabajo;
CREATE TRIGGER trigger_sesiones_trabajo_actualizado_en
  BEFORE UPDATE ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

CREATE TABLE IF NOT EXISTS public.notas_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE CHECK (folio ~ '^NE-[0-9]{6}$'),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  es_parcial boolean NOT NULL DEFAULT false,
  firma_cliente_url text,
  recibido_por text NOT NULL CHECK (char_length(btrim(recibido_por)) >= 3),
  creado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notas_entrega IS
  'Documentos de entrega sin precios ni importes; el folio se asigna dentro de PostgreSQL.';

CREATE INDEX IF NOT EXISTS idx_notas_entrega_orden_creado
  ON public.notas_entrega (orden_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notas_entrega_creado_por ON public.notas_entrega (creado_por);

CREATE TABLE IF NOT EXISTS public.partidas_nota_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_entrega_id uuid NOT NULL REFERENCES public.notas_entrega (id) ON DELETE CASCADE,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  cantidad_solicitada numeric(12, 4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_entregada numeric(12, 4) NOT NULL
    CHECK (cantidad_entregada > 0 AND cantidad_entregada <= cantidad_solicitada),
  CONSTRAINT partidas_nota_entrega_partida_unica_por_nota UNIQUE (nota_entrega_id, partida_id)
);

COMMENT ON TABLE public.partidas_nota_entrega IS
  'Renglones inmutables de una nota de entrega; no contiene importes económicos.';

CREATE INDEX IF NOT EXISTS idx_partidas_nota_entrega_partida
  ON public.partidas_nota_entrega (partida_id);

REVOKE ALL PRIVILEGES ON TABLE public.sesiones_trabajo FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.notas_entrega FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.partidas_nota_entrega FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sesiones_trabajo TO authenticated;
GRANT SELECT ON TABLE public.notas_entrega TO authenticated;
GRANT SELECT ON TABLE public.partidas_nota_entrega TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.sesiones_trabajo TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.notas_entrega TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.partidas_nota_entrega TO service_role;

ALTER TABLE public.sesiones_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas_nota_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sesiones_trabajo_seleccionar ON public.sesiones_trabajo;
CREATE POLICY sesiones_trabajo_seleccionar ON public.sesiones_trabajo
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

DROP POLICY IF EXISTS notas_entrega_seleccionar ON public.notas_entrega;
CREATE POLICY notas_entrega_seleccionar ON public.notas_entrega
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

DROP POLICY IF EXISTS partidas_nota_entrega_seleccionar ON public.partidas_nota_entrega;
CREATE POLICY partidas_nota_entrega_seleccionar ON public.partidas_nota_entrega
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['sesiones_trabajo', 'notas_entrega', 'partidas_nota_entrega']
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
