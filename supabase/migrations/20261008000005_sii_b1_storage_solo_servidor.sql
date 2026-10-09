-- =============================================================================
-- SII-B1 / H-B1-32 y H-B1-33 -- Storage privado, escritura solo por servidor
--
-- Los binarios historicos no se eliminan y los clientes autenticados dejan de
-- subir/borrar directamente en los buckets transversales. Las cargas nuevas
-- usan URL firmada de un solo objeto y se confirman en servidor. La lectura de
-- adjuntos conserva RLS y reconoce rutas legacy `<rfq_id>/...` y nuevas
-- `rfq/<rfq_id>/...`.
-- Aplicar SOLO local hasta autorizacion del PO.
-- =============================================================================

DROP POLICY IF EXISTS adjuntos_insertar ON storage.objects;
DROP POLICY IF EXISTS adjuntos_eliminar ON storage.objects;
DROP POLICY IF EXISTS documentos_cliente_storage_insertar ON storage.objects;
DROP POLICY IF EXISTS documentos_cliente_storage_eliminar ON storage.objects;

DROP POLICY IF EXISTS adjuntos_seleccionar ON storage.objects;
CREATE POLICY adjuntos_seleccionar
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1
      FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = CASE
          WHEN (storage.foldername(name))[1] = 'rfq'
            THEN (storage.foldername(name))[2]
          ELSE (storage.foldername(name))[1]
        END
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

-- No se usa COMMENT ON POLICY sobre storage.objects: Supabase administra la
-- tabla con un owner distinto al rol de migraciones y esa operación cosmética
-- impediría una instalación fresca. La descripción funcional vive arriba.
