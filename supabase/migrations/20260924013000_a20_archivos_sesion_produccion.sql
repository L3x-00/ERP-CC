-- PRD-17: metadatos inmutables de archivos asociados a un intervalo de trabajo.
-- Los binarios viven en bucket privado; la aplicación firma cargas/lecturas
-- después de verificar permiso y pertenencia de la sesión.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archivos-sesion-produccion', 'archivos-sesion-produccion', false,
  20 * 1024 * 1024,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
-- No se conceden políticas sobre storage.objects: solo service_role firma URLs.

CREATE TABLE public.archivos_sesion_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL REFERENCES public.sesiones_trabajo(id) ON DELETE RESTRICT,
  clase text NOT NULL DEFAULT 'sesion' CHECK (clase IN ('sesion', 'salida_final')),
  ruta text NOT NULL UNIQUE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 180),
  mime text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/octet-stream')),
  tamano integer NOT NULL CHECK (tamano BETWEEN 1 AND 20971520),
  creado_por uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ruta_archivo_sesion_formato CHECK (
    ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp|dxf|dwg|step|stp|igs|iges|eps|ai)$'
  ),
  CONSTRAINT ruta_archivo_sesion_propietario CHECK (
    split_part(ruta, '/', 1) = sesion_id::text
    AND split_part(ruta, '/', 2) = creado_por::text
  )
);
CREATE INDEX archivos_sesion_produccion_sesion_fecha_idx
  ON public.archivos_sesion_produccion (sesion_id, clase, creado_en DESC, id DESC);

REVOKE ALL ON public.archivos_sesion_produccion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.archivos_sesion_produccion TO authenticated;
GRANT ALL ON public.archivos_sesion_produccion TO service_role;
ALTER TABLE public.archivos_sesion_produccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY archivos_sesion_produccion_seleccionar
  ON public.archivos_sesion_produccion FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sesiones_trabajo s WHERE s.id = sesion_id
    )
    AND ((SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion')))
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'archivos_sesion_produccion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.archivos_sesion_produccion;
  END IF;
END $$;
