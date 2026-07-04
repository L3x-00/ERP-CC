-- =============================================================================
-- Migración: bucket de Storage para adjuntos de cotización + RLS
-- Fase 2 — Pipeline / CRM (ORCA MFG ERP)
-- Idempotente.
--
-- Los adjuntos se guardan bajo la ruta '<pipeline_id>/<archivo>', de modo que
-- listar los adjuntos de una oportunidad es listar el prefijo <pipeline_id>/ —
-- sin tabla de metadatos aparte. Bucket privado (no público).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('adjuntos-cotizacion', 'adjuntos-cotizacion', false)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- RLS sobre storage.objects, acotado a este bucket.
-- Autenticado puede leer/subir/eliminar dentro del bucket. La granularidad por
-- oportunidad (que solo el dueño del prospecto acceda a SUS adjuntos) es un
-- refinamiento de Fase 2b/3; por ahora las subidas pasan por Server Action.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS adjuntos_seleccionar ON storage.objects;
CREATE POLICY adjuntos_seleccionar
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'adjuntos-cotizacion');

DROP POLICY IF EXISTS adjuntos_insertar ON storage.objects;
CREATE POLICY adjuntos_insertar
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'adjuntos-cotizacion');

DROP POLICY IF EXISTS adjuntos_eliminar ON storage.objects;
CREATE POLICY adjuntos_eliminar
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'adjuntos-cotizacion');
