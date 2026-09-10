-- =============================================================================
-- Fase 12.1: comentarios por registro y notificaciones.
--
-- El comentario se vincula a una entidad permitida mediante una pareja
-- (entidad_tipo, entidad_id); la autorización de esa pareja vive en una
-- función RLS estable, no en un filtro de la interfaz. Las notificaciones se
-- generan en la misma transacción del comentario mediante un trigger.
-- =============================================================================

-- ---------------------------------------------------------------------------- -
-- 1. Tipo de entidad e infraestructura de autorización.
-- ---------------------------------------------------------------------------- -
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS tipo
    INNER JOIN pg_namespace AS esquema ON esquema.oid = tipo.typnamespace
    WHERE esquema.nspname = 'public'
      AND tipo.typname = 'tipo_entidad_comentario'
  ) THEN
    CREATE TYPE public.tipo_entidad_comentario AS ENUM ('orden', 'cotizacion', 'cliente');
  END IF;
END;
$$;

GRANT USAGE ON TYPE public.tipo_entidad_comentario TO authenticated, service_role;
REVOKE USAGE ON TYPE public.tipo_entidad_comentario FROM anon;

CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA privado TO authenticated;

-- Comprueba que el usuario puede ver la entidad antes de permitir que una
-- política RLS exponga o cree comentarios. La función consulta las tablas con
-- privilegios de propietario, pero conserva auth.uid() del usuario invocante.
CREATE OR REPLACE FUNCTION privado.puede_ver_entidad_comentario(
  p_entidad_tipo text,
  p_entidad_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS usuario
    WHERE usuario.id = (SELECT auth.uid())
      AND usuario.activo = true
  )
  AND CASE lower(btrim(coalesce(p_entidad_tipo, '')))
    WHEN 'orden' THEN
      EXISTS (
        SELECT 1
        FROM public.ordenes_produccion AS orden
        WHERE orden.id = p_entidad_id
      )
      AND (
        (SELECT privado.es_admin())
        OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
        OR (SELECT privado.usuario_tiene_permiso('aprobar_ordenes'))
        OR (SELECT privado.usuario_tiene_permiso('ver_planeacion'))
        OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
        OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
      )
    WHEN 'cotizacion' THEN
      EXISTS (
        SELECT 1
        FROM public.pipeline AS pipeline
        WHERE pipeline.id = p_entidad_id
          AND (
            pipeline.vendedor_id = (SELECT auth.uid())
            OR (SELECT privado.es_admin())
            OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
          )
      )
    WHEN 'cliente' THEN
      EXISTS (
        SELECT 1
        FROM public.clientes AS cliente
        WHERE cliente.id = p_entidad_id
      )
      AND (
        (SELECT privado.es_admin())
        OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
      )
    ELSE false
  END;
$$;

COMMENT ON FUNCTION privado.puede_ver_entidad_comentario(text, uuid) IS
  'Autoriza comentarios únicamente sobre entidades que el usuario activo puede consultar.';

REVOKE ALL ON FUNCTION privado.puede_ver_entidad_comentario(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.puede_ver_entidad_comentario(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------- -
-- 2. Comentarios y notificaciones.
-- ---------------------------------------------------------------------------- -
CREATE TABLE IF NOT EXISTS public.comentarios_registro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_tipo public.tipo_entidad_comentario NOT NULL,
  entidad_id uuid NOT NULL,
  autor_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  contenido text NOT NULL,
  menciones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  archivos_adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  editado boolean NOT NULL DEFAULT false,
  eliminado boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comentarios_registro_contenido_no_vacio
    CHECK (char_length(btrim(contenido)) BETWEEN 1 AND 2000),
  CONSTRAINT comentarios_registro_contenido_sin_html
    CHECK (contenido !~ '[<>]'),
  CONSTRAINT comentarios_registro_menciones_array
    CHECK (jsonb_typeof(menciones_json) = 'array' AND jsonb_array_length(menciones_json) <= 30),
  CONSTRAINT comentarios_registro_adjuntos_array
    CHECK (jsonb_typeof(archivos_adjuntos) = 'array' AND jsonb_array_length(archivos_adjuntos) <= 20)
);

COMMENT ON TABLE public.comentarios_registro IS
  'Hilos de conversación vinculados a órdenes, cotizaciones o clientes; el texto se almacena sin etiquetas HTML.';

CREATE TABLE IF NOT EXISTS public.notificaciones_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE CASCADE,
  emisor_id uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('mencion', 'comentario_orden', 'estado_orden', 'alerta_sistema')),
  titulo text NOT NULL,
  mensaje text NOT NULL,
  enlace text,
  leida boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_usuario_titulo_no_vacio
    CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 160),
  CONSTRAINT notificaciones_usuario_mensaje_no_vacio
    CHECK (char_length(btrim(mensaje)) BETWEEN 1 AND 500),
  CONSTRAINT notificaciones_usuario_enlace_interno
    CHECK (
      enlace IS NULL
      OR enlace ~ '^/(ordenes|pipeline|clientes)(\?.*)?$'
    )
);

COMMENT ON TABLE public.notificaciones_usuario IS
  'Notificaciones privadas por usuario; las menciones se insertan dentro de la transacción del comentario.';

CREATE INDEX IF NOT EXISTS idx_comentarios_entidad
  ON public.comentarios_registro (entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_entidad_creado
  ON public.comentarios_registro (entidad_tipo, entidad_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_autor
  ON public.comentarios_registro (autor_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida
  ON public.notificaciones_usuario (usuario_id, leida, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_creado
  ON public.notificaciones_usuario (usuario_id, creado_en DESC);

DROP TRIGGER IF EXISTS trigger_comentarios_registro_actualizado_en
  ON public.comentarios_registro;
CREATE TRIGGER trigger_comentarios_registro_actualizado_en
  BEFORE UPDATE ON public.comentarios_registro
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- La política RLS autoriza al autor (o a un administrador), pero no debe
-- permitir que un JWT modifique la identidad o el contexto del comentario.
-- Las acciones del servidor usan service_role para operaciones controladas.
CREATE OR REPLACE FUNCTION public.comentarios_proteger_columnas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.entidad_tipo IS DISTINCT FROM OLD.entidad_tipo
     OR NEW.entidad_id IS DISTINCT FROM OLD.entidad_id
     OR NEW.autor_id IS DISTINCT FROM OLD.autor_id
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN
    RAISE EXCEPTION 'identidad y entidad del comentario solo se modifican vía las acciones del servidor';
  END IF;

  IF OLD.eliminado AND NOT NEW.eliminado THEN
    RAISE EXCEPTION 'un comentario eliminado no puede reactivarse';
  END IF;
  IF OLD.editado AND NOT NEW.editado THEN
    RAISE EXCEPTION 'la marca de edición no puede revertirse';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.comentarios_proteger_columnas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_comentarios_proteger_columnas
  ON public.comentarios_registro;
CREATE TRIGGER trigger_comentarios_proteger_columnas
  BEFORE UPDATE ON public.comentarios_registro
  FOR EACH ROW EXECUTE FUNCTION public.comentarios_proteger_columnas();

-- ---------------------------------------------------------------------------- -
-- 3. Menciones: notificación atómica e idempotente dentro del INSERT.
-- ---------------------------------------------------------------------------- -
CREATE OR REPLACE FUNCTION public.procesar_menciones_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enlace text;
BEGIN
  v_enlace := CASE NEW.entidad_tipo::text
    WHEN 'orden' THEN '/ordenes?ordenId=' || NEW.entidad_id::text
    WHEN 'cotizacion' THEN '/pipeline?cotizacionId=' || NEW.entidad_id::text
    WHEN 'cliente' THEN '/clientes?clienteId=' || NEW.entidad_id::text
    ELSE NULL
  END;

  INSERT INTO public.notificaciones_usuario (
    usuario_id,
    emisor_id,
    tipo,
    titulo,
    mensaje,
    enlace
  )
  SELECT DISTINCT
    usuario.id,
    NEW.autor_id,
    'mencion',
    'Te mencionaron en un comentario',
    left(NEW.contenido, 500),
    v_enlace
  FROM jsonb_array_elements_text(NEW.menciones_json) AS mencion(valor)
  INNER JOIN public.usuarios AS usuario
    ON usuario.id = CASE
      WHEN mencion.valor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN mencion.valor::uuid
      ELSE NULL
    END
  WHERE usuario.activo = true
    AND usuario.id IS DISTINCT FROM NEW.autor_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.procesar_menciones_comentario() IS
  'Crea notificaciones de menciones en la misma transacción del comentario.';

REVOKE ALL ON FUNCTION public.procesar_menciones_comentario() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_comentarios_procesar_menciones
  ON public.comentarios_registro;
CREATE TRIGGER trigger_comentarios_procesar_menciones
  AFTER INSERT ON public.comentarios_registro
  FOR EACH ROW EXECUTE FUNCTION public.procesar_menciones_comentario();

-- ---------------------------------------------------------------------------- -
-- 4. Privilegios y RLS.
-- ---------------------------------------------------------------------------- -
ALTER TABLE public.comentarios_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_usuario ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.comentarios_registro
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.notificaciones_usuario
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.comentarios_registro TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.notificaciones_usuario TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.comentarios_registro TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.notificaciones_usuario TO service_role;

-- El navegador sólo lee. Las escrituras pasan por Server Actions, donde se
-- aplica sanitización, autorización de entidad y auditoría antes del cliente
-- privilegiado; las políticas UPDATE/INSERT quedan como defensa si se amplían
-- los grants en una migración futura.
REVOKE INSERT, UPDATE ON TABLE public.comentarios_registro FROM authenticated;
REVOKE UPDATE ON TABLE public.notificaciones_usuario FROM authenticated;

DROP POLICY IF EXISTS comentarios_registro_seleccionar ON public.comentarios_registro;
CREATE POLICY comentarios_registro_seleccionar
  ON public.comentarios_registro
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.puede_ver_entidad_comentario(entidad_tipo::text, entidad_id))
  );

DROP POLICY IF EXISTS comentarios_registro_insertar ON public.comentarios_registro;
CREATE POLICY comentarios_registro_insertar
  ON public.comentarios_registro
  FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = (SELECT auth.uid())
    AND (SELECT privado.puede_ver_entidad_comentario(entidad_tipo::text, entidad_id))
  );

DROP POLICY IF EXISTS comentarios_registro_actualizar ON public.comentarios_registro;
CREATE POLICY comentarios_registro_actualizar
  ON public.comentarios_registro
  FOR UPDATE TO authenticated
  USING (
    autor_id = (SELECT auth.uid()) OR (SELECT privado.es_admin())
  )
  WITH CHECK (
    autor_id = (SELECT auth.uid()) OR (SELECT privado.es_admin())
  );

DROP POLICY IF EXISTS notificaciones_usuario_seleccionar ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_seleccionar
  ON public.notificaciones_usuario
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notificaciones_usuario_actualizar ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_actualizar
  ON public.notificaciones_usuario
  FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

-- Realtime solo emite señales; las consultas posteriores vuelven a pasar por
-- RLS y por eso no se renderizan payloads recibidos desde el socket.
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['comentarios_registro', 'notificaciones_usuario']
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
