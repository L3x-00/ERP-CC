-- =============================================================================
-- C11 - Notificación de solicitud de programación al reclamar una orden.
--
-- El operador que reclama una orden avisa a quienes pueden programar para que
-- la orden entre a Planeación. El enlace interno de la notificación debe poder
-- apuntar a /planeacion.
-- =============================================================================

ALTER TABLE public.notificaciones_usuario
  DROP CONSTRAINT IF EXISTS notificaciones_usuario_enlace_interno;

ALTER TABLE public.notificaciones_usuario
  ADD CONSTRAINT notificaciones_usuario_enlace_interno
  CHECK (
    enlace IS NULL
    OR enlace ~ '^/(ordenes|pipeline|clientes|planeacion)(\?.*)?$'
  );
