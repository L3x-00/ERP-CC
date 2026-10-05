-- =============================================================================
-- SII-B1.8 — Versionado y auditoría de catálogos
-- Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.8
-- Documento del cliente: §15.1 ("configurables, activos/inactivos, versionados
-- y auditados"; los valores históricos inactivos permanecen visibles)
--
--   * `versiones_catalogo` guarda un snapshot completo por mutación.
--   * `privado.registrar_version_catalogo()` (BEFORE INSERT OR UPDATE) calcula
--     version = max+1 con lock lógico por entidad/fila y captura el actor:
--     primero `app.actor_id` (GUC que puede fijar una RPC futura), luego
--     `auth.uid()`; con service_role directo queda NULL y la traza del actor
--     vive en `logs` (registrarLog). Nunca lanza por actor desconocido.
--   * `privado.impedir_borrado_catalogo()` materializa la regla de oro:
--     los catálogos no se borran, solo se desactivan.
--   * Backfill idempotente de la versión 1 de las filas sembradas.
-- Aplicación: SOLO la aplica el Product Owner. La terminal A no ejecuta migraciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de versiones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.versiones_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad text NOT NULL,
  entidad_id uuid NOT NULL,
  version integer NOT NULL,
  datos jsonb NOT NULL,
  actor_id uuid REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versiones_catalogo_entidad_no_vacia CHECK (char_length(btrim(entidad)) BETWEEN 2 AND 80),
  CONSTRAINT versiones_catalogo_version_positiva CHECK (version > 0),
  CONSTRAINT versiones_catalogo_entidad_version_unica UNIQUE (entidad, entidad_id, version)
);

COMMENT ON TABLE public.versiones_catalogo IS
  'SII-B1.8: historial append-only de cada catálogo; snapshot completo de la fila por versión.';
COMMENT ON COLUMN public.versiones_catalogo.actor_id IS
  'Actor de la mutación cuando llega con JWT; NULL en escrituras service_role (la traza nominal queda en `logs`).';

CREATE INDEX IF NOT EXISTS idx_versiones_catalogo_entidad
  ON public.versiones_catalogo (entidad, entidad_id, version DESC);

ALTER TABLE public.versiones_catalogo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.versiones_catalogo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.versiones_catalogo TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.versiones_catalogo TO service_role;

DROP POLICY IF EXISTS versiones_catalogo_seleccionar ON public.versiones_catalogo;
CREATE POLICY versiones_catalogo_seleccionar
  ON public.versiones_catalogo FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

-- -----------------------------------------------------------------------------
-- 2. Trigger de versionado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.registrar_version_catalogo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version integer;
  v_actor uuid;
BEGIN
  -- Lock lógico por entidad+fila: evita versiones duplicadas si dos
  -- transacciones mutan la misma fila a la vez (el UNIQUE es la red final).
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || NEW.id::text, 0));

  SELECT coalesce(max(version), 0) + 1
  INTO v_version
  FROM public.versiones_catalogo
  WHERE entidad = TG_TABLE_NAME AND entidad_id = NEW.id;

  BEGIN
    v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor := NULL;
  END;

  IF v_actor IS NULL THEN
    BEGIN
      v_actor := auth.uid();
    EXCEPTION WHEN others THEN
      v_actor := NULL;
    END;
  END IF;

  -- El snapshot nunca debe tumbar la mutación del catálogo: si el actor no
  -- tiene perfil en `usuarios`, se guarda NULL (la FK lo exige).
  IF v_actor IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.usuarios AS u WHERE u.id = v_actor) THEN
    v_actor := NULL;
  END IF;

  INSERT INTO public.versiones_catalogo (entidad, entidad_id, version, datos, actor_id)
  VALUES (TG_TABLE_NAME, NEW.id, v_version, to_jsonb(NEW), v_actor);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.registrar_version_catalogo() IS
  'SII-B1.8: inserta snapshot completo (version = max+1) en cada INSERT/UPDATE de una tabla de catálogo.';

-- -----------------------------------------------------------------------------
-- 3. Guardia de no-borrado (regla de oro: solo activo=false)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.impedir_borrado_catalogo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'catalogo_sin_borrado'
    USING ERRCODE = 'P0001', DETAIL = 'usa activo=false en su lugar';
END;
$$;

COMMENT ON FUNCTION privado.impedir_borrado_catalogo() IS
  'SII-B1.8: rechaza DELETE sobre tablas de catálogo (incluido service_role); la baja es activo=false.';

-- -----------------------------------------------------------------------------
-- 4. Enlace de triggers en las 6 tablas de catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'catalogo_materiales',
    'catalogo_espesores',
    'catalogo_procesos',
    'grupos_equipo',
    'grupos_planeados',
    'catalogo_proximas_acciones'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trigger_%1$s_version ON public.%1$I',
      v_tabla
    );
    EXECUTE format(
      'CREATE TRIGGER trigger_%1$s_version BEFORE INSERT OR UPDATE ON public.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION privado.registrar_version_catalogo()',
      v_tabla
    );

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trigger_%1$s_sin_borrado ON public.%1$I',
      v_tabla
    );
    EXECUTE format(
      'CREATE TRIGGER trigger_%1$s_sin_borrado BEFORE DELETE ON public.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION privado.impedir_borrado_catalogo()',
      v_tabla
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION privado.registrar_version_catalogo()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION privado.impedir_borrado_catalogo()
  FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Backfill: las filas sembradas (o preexistentes) arrancan con versión 1.
--    Idempotente: solo inserta lo que aún no tiene historial.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'catalogo_materiales',
    'catalogo_espesores',
    'catalogo_procesos',
    'grupos_equipo',
    'grupos_planeados',
    'catalogo_proximas_acciones'
  ]
  LOOP
    EXECUTE format(
      $f$
        INSERT INTO public.versiones_catalogo (entidad, entidad_id, version, datos)
        SELECT %L, t.id, 1, to_jsonb(t)
        FROM public.%I AS t
        WHERE NOT EXISTS (
          SELECT 1 FROM public.versiones_catalogo AS v
          WHERE v.entidad = %L AND v.entidad_id = t.id
        )
      $f$,
      v_tabla, v_tabla, v_tabla
    );
  END LOOP;
END;
$$;
