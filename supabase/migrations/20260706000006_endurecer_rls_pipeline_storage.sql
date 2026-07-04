-- =============================================================================
-- Migración: endurecimiento de RLS del pipeline y storage (post-revisión Fase 2)
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP). Idempotente.
--
-- Cierra hallazgos de la revisión de seguridad:
--  MEDIA-1: adjuntos accesibles por cualquier autenticado (cross-vendor).
--  MEDIA-2: un vendedor podía cambiar etapa/folio/cliente por escritura directa
--           (PostgREST con su JWT) saltándose las Server Actions.
--  BAJA-3 : clientes duplicados por falta de unicidad efectiva en correo.
--  INFO-7 : funciones de folio ejecutables por cualquier autenticado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MEDIA-2a: la RLS de UPDATE de pipeline no restringía columnas. Un trigger
-- impide que un cliente NO-service_role cambie las columnas controladas
-- (etapa, folios, cliente_id). Esos cambios solo ocurren vía Server Actions con
-- cliente admin (service_role), que ya verifican permisos/reglas de transición.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_proteger_columnas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- service_role = escritura desde una Server Action con cliente admin (confiable).
  IF coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.etapa IS DISTINCT FROM OLD.etapa
     OR NEW.folio_op IS DISTINCT FROM OLD.folio_op
     OR NEW.folio_cnc IS DISTINCT FROM OLD.folio_cnc
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'etapa/folio/cliente_id solo se modifican vía las acciones del servidor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_pipeline_proteger_columnas ON public.pipeline;
CREATE TRIGGER trigger_pipeline_proteger_columnas
  BEFORE UPDATE ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.pipeline_proteger_columnas();

-- -----------------------------------------------------------------------------
-- MEDIA-2b: la RLS de INSERT solo exigía vendedor_id propio. Un cliente directo
-- podía insertar una fila ya en 'ganada' con folio/cliente arbitrarios. Se
-- restringe a alta de prospecto limpio. Las Server Actions insertan con cliente
-- admin (service_role), que no pasa por esta política.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pipeline_insertar ON public.pipeline;
CREATE POLICY pipeline_insertar
  ON public.pipeline
  FOR INSERT
  TO authenticated
  WITH CHECK (
    vendedor_id = auth.uid()
    AND etapa = 'prospecto'
    AND folio_cnc IS NULL
    AND cliente_id IS NULL
  );

-- -----------------------------------------------------------------------------
-- MEDIA-1: adjuntos acotados por carpeta = pipeline_id, heredando el acceso a
-- la oportunidad padre (dueño / permiso de equipo / admin). La ruta siempre es
-- '<pipeline_id>/<archivo>' (el nombre se sanea en la acción).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS adjuntos_seleccionar ON storage.objects;
CREATE POLICY adjuntos_seleccionar
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_insertar ON storage.objects;
CREATE POLICY adjuntos_insertar
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_eliminar ON storage.objects;
CREATE POLICY adjuntos_eliminar
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.vendedor_id = auth.uid()
          OR public.es_admin()
          OR public.usuario_tiene_permiso('ver_pipeline_equipo')
        )
    )
  );

-- -----------------------------------------------------------------------------
-- BAJA-3: unicidad efectiva del correo de cliente (case-insensitive), para que
-- la promoción no cree duplicados ni bajo concurrencia. La promoción maneja el
-- conflicto reconsultando.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_correo
  ON public.clientes (lower(correo))
  WHERE correo IS NOT NULL;

-- -----------------------------------------------------------------------------
-- INFO-7: las funciones de folio se llaman solo desde Server Actions con cliente
-- admin. Se revoca su ejecución a los roles de cliente para que un autenticado
-- no pueda inflar el contador por RPC directa.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generar_folio_op() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_folio_cnc() FROM anon, authenticated;
