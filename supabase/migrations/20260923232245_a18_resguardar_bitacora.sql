-- A18: la consulta administrativa expone solo columnas de presentación.
-- Antes, un usuario inactivo conservaba lectura de sus logs con un JWT previo,
-- y SELECT de tabla permitía obtener el JSONB `detalles` por la Data API.
-- El historial no se modifica; service_role sigue insertando y consultando.

REVOKE ALL ON TABLE public.logs FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, creado_en
) ON TABLE public.logs TO authenticated;

DROP POLICY IF EXISTS logs_seleccionar ON public.logs;
CREATE POLICY logs_seleccionar
  ON public.logs FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      (SELECT privado.es_admin())
      OR usuario_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_logs_orden_estable
  ON public.logs (creado_en DESC, id DESC);
