-- =============================================================================
-- A09 — Un token ya emitido de un usuario desactivado deja de leer y escribir
-- su propio pipeline, sus líneas de cotización y sus adjuntos en Storage.
--
-- Hallazgo: `privado.es_admin()` y `privado.usuario_tiene_permiso()` ya exigen
-- `usuarios.activo = true`, pero la rama de propiedad (`vendedor_id =
-- auth.uid()`) no comprobaba nada. Al desactivar a un vendedor, la aplicación
-- bloqueaba la sesión, pero su JWT vigente seguía leyendo por PostgREST hasta
-- expirar.
--
-- Corrección: se añade `privado.usuario_activo()` y se recrean las políticas
-- afectadas exigiendo identidad activa en BD (no en claims ni en pantalla) en
-- TODAS las ramas. Las ramas de admin/equipo ya lo exigían, así que el `AND`
-- externo no les cambia el alcance: conserva el acceso del vendedor activo a lo
-- suyo y el del admin/gerente autorizado.
--
-- No se relaja ninguna escritura: la misma condición se aplica a INSERT/UPDATE/
-- DELETE directos del cliente. Las RPC de servidor corren con `service_role`,
-- que no evalúa RLS, así que los flujos con actor validado no cambian.
--
-- Migración nueva e idempotente; no se edita ninguna histórica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: ¿la identidad del token sigue activa en `public.usuarios`?
--    SECURITY DEFINER para leer `usuarios` desde una política sin recursión de
--    RLS (mismo patrón que `privado.es_admin`). Vive en `privado`, que no está
--    expuesto por la Data API.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.usuario_activo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = (SELECT auth.uid())
      AND activo = true
  );
$$;

COMMENT ON FUNCTION privado.usuario_activo() IS
  'A09: true si la identidad del JWT sigue activa en public.usuarios. Uso exclusivo en políticas RLS; un token emitido antes de la desactivación deja de pasar.';

REVOKE ALL ON FUNCTION privado.usuario_activo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.usuario_activo() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. `public.pipeline`: identidad activa en las cuatro operaciones.
--    DELETE ya dependía solo de `es_admin()` (que comprueba `activo`); se
--    recrea igualmente para dejar el contrato explícito en un solo lugar.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS pipeline_seleccionar ON public.pipeline;
CREATE POLICY pipeline_seleccionar
  ON public.pipeline FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      vendedor_id = (SELECT auth.uid())
      OR (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
    )
  );

DROP POLICY IF EXISTS pipeline_insertar ON public.pipeline;
CREATE POLICY pipeline_insertar
  ON public.pipeline FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT privado.usuario_activo())
    AND vendedor_id = (SELECT auth.uid())
    AND etapa = 'prospecto'
    AND folio_cnc IS NULL
    AND cliente_id IS NULL
  );

DROP POLICY IF EXISTS pipeline_actualizar ON public.pipeline;
CREATE POLICY pipeline_actualizar
  ON public.pipeline FOR UPDATE TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      vendedor_id = (SELECT auth.uid())
      OR (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
    )
  )
  WITH CHECK (
    (SELECT privado.usuario_activo())
    AND (
      vendedor_id = (SELECT auth.uid())
      OR (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
    )
  );

DROP POLICY IF EXISTS pipeline_eliminar ON public.pipeline;
CREATE POLICY pipeline_eliminar
  ON public.pipeline FOR DELETE TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (SELECT privado.es_admin())
  );

-- -----------------------------------------------------------------------------
-- 3. `public.cotizacion_lineas`: heredan el alcance de la oportunidad padre, y
--    con él la exigencia de identidad activa.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS cotizacion_lineas_seleccionar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_seleccionar
  ON public.cotizacion_lineas FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_insertar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_insertar
  ON public.cotizacion_lineas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_actualizar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_actualizar
  ON public.cotizacion_lineas FOR UPDATE TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  )
  WITH CHECK (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_eliminar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_eliminar
  ON public.cotizacion_lineas FOR DELETE TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Adjuntos de cotización en `storage.objects` (bucket `adjuntos-cotizacion`).
--    Solo se tocan estas tres políticas: las de `documentos-cliente` dependen
--    de `es_admin()`/`usuario_tiene_permiso()`, que ya exigen identidad activa,
--    y su contrato se conserva sin cambios.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS adjuntos_seleccionar ON storage.objects;
CREATE POLICY adjuntos_seleccionar
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_insertar ON storage.objects;
CREATE POLICY adjuntos_insertar
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'adjuntos-cotizacion'
    AND (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_eliminar ON storage.objects;
CREATE POLICY adjuntos_eliminar
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );
