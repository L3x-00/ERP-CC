-- =============================================================================
-- SII-B1.9 — Archivos: modelo único privado con metadatos y versionado
-- Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.9 (ADR-SII-06)
-- Documento del cliente: §15.2 (archivos), §6 (integridad)
--
-- Entrega:
--   * tabla `archivos` (entidad/revisión/ítem + clase + tema + versión)
--   * trigger de versionado: reemplazar no borra, encadena `reemplaza_a`
--   * RLS de lectura por permiso de la entidad (helper privado)
--   * backfill idempotente de: documentos_cliente, archivos_sesion_produccion,
--     archivos_orden y adjuntos de `adjuntos-cotizacion`
--   * límites de tamaño/MIME por bucket (documentos-cliente, adjuntos-cotizacion)
-- Idempotente y no destructiva. Aplicar SOLO local hasta autorización.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla `archivos`
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad text NOT NULL CHECK (entidad IN (
    'cliente','rfq','rfq_item','propuesta','propuesta_revision','propuesta_item',
    'orden','sesion_produccion','entrega','gasto','inspeccion_calidad'
  )),
  entidad_id uuid NOT NULL,
  tema_codigo text,
  clase text NOT NULL,
  nombre_original text NOT NULL,
  nombre_erp text,
  bucket text NOT NULL,
  ruta_storage text NOT NULL UNIQUE,
  mime text NOT NULL,
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0),
  hash_sha256 text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reemplaza_a uuid REFERENCES public.archivos (id),
  vigente boolean NOT NULL DEFAULT true,
  subido_por uuid REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_archivos_entidad ON public.archivos (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS ix_archivos_vigente ON public.archivos (entidad, entidad_id) WHERE vigente;

-- Un solo archivo vigente por (entidad, entidad_id, tema, nombre ERP).
CREATE UNIQUE INDEX IF NOT EXISTS ux_archivo_vigente
  ON public.archivos (entidad, entidad_id, coalesce(tema_codigo, ''), nombre_erp)
  WHERE vigente;

COMMENT ON TABLE public.archivos IS
  'Metadata única de archivos privados: vínculo explícito a entidad/revisión/ítem, versión y reemplazo trazado (ADR-SII-06).';
COMMENT ON COLUMN public.archivos.ruta_storage IS
  'Ruta exacta en el bucket; nunca se infiere por nombre de archivo.';
COMMENT ON COLUMN public.archivos.nombre_erp IS
  'Nombre normalizado del ERP; repetirlo dispara una nueva versión (no sobrescribe).';

-- -----------------------------------------------------------------------------
-- 2. Trigger de versionado (reemplazo trazado, sin borrado silencioso)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.versionar_archivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previo record;
BEGIN
  IF new.vigente IS TRUE AND new.nombre_erp IS NOT NULL THEN
    SELECT id, version INTO v_previo
    FROM public.archivos
    WHERE entidad = new.entidad
      AND entidad_id = new.entidad_id
      AND coalesce(tema_codigo, '') = coalesce(new.tema_codigo, '')
      AND nombre_erp = new.nombre_erp
      AND vigente
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.archivos SET vigente = false WHERE id = v_previo.id;
      new.version := v_previo.version + 1;
      new.reemplaza_a := v_previo.id;
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS versionar_archivo ON public.archivos;
CREATE TRIGGER versionar_archivo
  BEFORE INSERT ON public.archivos
  FOR EACH ROW EXECUTE FUNCTION privado.versionar_archivo();

-- -----------------------------------------------------------------------------
-- 3. RLS: lectura por permiso de la entidad
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.puede_ver_archivo(p_entidad text, p_entidad_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT privado.usuario_activo() THEN false
    WHEN privado.es_admin() THEN true
    WHEN p_entidad = 'cliente'
      THEN public.usuario_tiene_permiso('ver_clientes') OR public.usuario_tiene_permiso('cliente_vista')
    WHEN p_entidad IN ('rfq', 'rfq_item')
      -- No se amplía el acceso: dueño del RFQ o `ver_pipeline_equipo`
      -- (mismas reglas que la RLS histórica de storage para adjuntos).
      THEN public.usuario_tiene_permiso('ver_pipeline_equipo')
        OR (p_entidad = 'rfq' AND EXISTS (
          SELECT 1 FROM public.pipeline p
          WHERE p.id = p_entidad_id AND p.vendedor_id = auth.uid()
        ))
        OR (p_entidad = 'rfq_item' AND public.usuario_tiene_permiso('rfq_vista'))
    WHEN p_entidad IN ('propuesta', 'propuesta_revision', 'propuesta_item')
      THEN public.usuario_tiene_permiso('propuesta_vista')
    WHEN p_entidad = 'orden'
      THEN public.usuario_tiene_permiso('orden_vista')
        OR public.usuario_tiene_permiso('gestionar_produccion')
        OR public.usuario_tiene_permiso('ver_planeacion')
    WHEN p_entidad = 'sesion_produccion'
      THEN public.usuario_tiene_permiso('gestionar_produccion') OR public.usuario_tiene_permiso('produccion_operar')
    WHEN p_entidad = 'entrega'
      THEN public.usuario_tiene_permiso('entrega_generar')
        OR public.usuario_tiene_permiso('orden_vista')
        OR public.usuario_tiene_permiso('ver_finanzas')
    WHEN p_entidad = 'gasto'
      THEN public.usuario_tiene_permiso('ver_finanzas') OR public.usuario_tiene_permiso('registrar_gastos')
    WHEN p_entidad = 'inspeccion_calidad'
      THEN public.usuario_tiene_permiso('calidad_inspeccionar') OR public.usuario_tiene_permiso('gestionar_produccion')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION privado.puede_ver_archivo(text, uuid) IS
  'Permiso de lectura de un archivo según su entidad e id (RLS de `archivos`).';

ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archivos_seleccionar ON public.archivos;
CREATE POLICY archivos_seleccionar
  ON public.archivos
  FOR SELECT
  TO authenticated
  USING (privado.puede_ver_archivo(entidad, entidad_id));

REVOKE ALL ON TABLE public.archivos FROM anon, authenticated;
GRANT SELECT ON TABLE public.archivos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.archivos TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Backfill idempotente de metadatos existentes
--    (no copia blobs; los buckets se conservan)
-- -----------------------------------------------------------------------------

-- 4a. documentos_cliente → entidad 'cliente'
INSERT INTO public.archivos (
  entidad, entidad_id, tema_codigo, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes, subido_por, creado_en
)
SELECT
  'cliente', dc.cliente_id, dc.tipo, 'documento', dc.nombre_archivo, dc.nombre_archivo,
  'documentos-cliente', dc.ruta_storage,
  coalesce(o.metadata->>'mimetype', 'application/octet-stream'),
  coalesce((o.metadata->>'size')::bigint, 1),
  dc.subido_por, dc.creado_en
FROM public.documentos_cliente dc
JOIN storage.objects o
  ON o.bucket_id = 'documentos-cliente' AND o.name = dc.ruta_storage
WHERE NOT EXISTS (SELECT 1 FROM public.archivos a WHERE a.ruta_storage = dc.ruta_storage)
ON CONFLICT (ruta_storage) DO NOTHING;

-- 4b. archivos_sesion_produccion → entidad 'sesion_produccion'
INSERT INTO public.archivos (
  entidad, entidad_id, tema_codigo, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes, subido_por, creado_en
)
SELECT
  'sesion_produccion', asp.sesion_id, null, asp.clase, asp.nombre, asp.nombre,
  'archivos-sesion-produccion', asp.ruta, asp.mime, asp.tamano, asp.creado_por, asp.creado_en
FROM public.archivos_sesion_produccion asp
WHERE NOT EXISTS (SELECT 1 FROM public.archivos a WHERE a.ruta_storage = asp.ruta)
ON CONFLICT (ruta_storage) DO NOTHING;

-- 4c. archivos_orden (histórica ORD-06) → entidad 'orden'
INSERT INTO public.archivos (
  entidad, entidad_id, tema_codigo, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes, subido_por, creado_en
)
SELECT
  'orden', ao.orden_id, null, 'general', ao.nombre, ao.nombre,
  'archivos-orden-historica', ao.ruta, ao.mime, ao.tamano, ao.creado_por, ao.creado_en
FROM public.archivos_orden ao
WHERE NOT EXISTS (SELECT 1 FROM public.archivos a WHERE a.ruta_storage = ao.ruta)
ON CONFLICT (ruta_storage) DO NOTHING;

-- 4d. adjuntos del bucket `adjuntos-cotizacion` → entidad 'rfq'
--     Ruta: <pipelineId>/<timestamp>-<nombre>
WITH candidatos AS (
  SELECT
    o.name,
    o.metadata,
    CASE
      WHEN split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN split_part(o.name, '/', 1)::uuid
      ELSE NULL
    END AS rfq_id,
    regexp_replace(substring(o.name FROM position('/' IN o.name) + 1), '^[0-9]+-', '') AS nombre_archivo
  FROM storage.objects o
  WHERE o.bucket_id = 'adjuntos-cotizacion'
)
INSERT INTO public.archivos (
  entidad, entidad_id, tema_codigo, clase, nombre_original, nombre_erp,
  bucket, ruta_storage, mime, tamano_bytes, creado_en
)
SELECT
  'rfq', c.rfq_id, null, 'OTROS', c.nombre_archivo, c.nombre_archivo,
  'adjuntos-cotizacion', c.name,
  coalesce(c.metadata->>'mimetype', 'application/octet-stream'),
  (c.metadata->>'size')::bigint, now()
FROM candidatos c
WHERE c.rfq_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.pipeline p WHERE p.id = c.rfq_id)
  AND coalesce((c.metadata->>'size')::bigint, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.archivos a WHERE a.ruta_storage = c.name)
ON CONFLICT (ruta_storage) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Límites de tamaño/MIME a nivel bucket (defensa en Storage, no solo en app)
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
WHERE id = 'documentos-cliente';

UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/octet-stream',
      'image/vnd.dxf', 'application/dxf', 'application/acad', 'image/vnd.dwg',
      'application/step', 'model/step', 'application/iges', 'model/iges',
      'application/postscript', 'application/illustrator', 'application/eps',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'adjuntos-cotizacion';
