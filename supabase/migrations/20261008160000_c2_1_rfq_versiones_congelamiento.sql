-- =============================================================================
-- C2.1 — Versiones del RFQ y congelamiento al crear Propuesta Rev A
-- (DC-04, DC-05, CONTRATOS-CORTE-0 §3.3, hallazgo CV-01)
--
--   * `rfq_versiones`: snapshot append-only de cabecera + ítems (activos y
--     cancelados, con operaciones). No copia blobs ni seguimientos.
--   * `public.registrar_version_rfq`: versión por guardado de cabecera/ítems,
--     con actor, causa y correlation_id; numeración serializada por RFQ.
--   * Crear Rev A (`crear_propuesta` → evento CONVERTED) revalida el RFQ y
--     registra la versión final en la MISMA transacción.
--   * Después de esa versión final, la definición del RFQ (cabecera e ítems)
--     queda congelada con el código estable `rfq_congelado`. RFQ legados
--     convertidos antes de C2.1 no tienen versión final y no se bloquean.
--   * CV-01: `READY_FOR_PROPOSAL` deja de bloquear la edición de ítems; la
--     frontera de inmutabilidad es crear Rev A.
--
-- Orden de locks: pipeline (FOR UPDATE) → rfq_versiones.
-- Aditiva e idempotente. Aplicar solo en Supabase local hasta autorización.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla append-only
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.pipeline (id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  causa text NOT NULL CHECK (causa IN ('CABECERA', 'ITEM', 'CREAR_REV_A')),
  snapshot_cabecera jsonb NOT NULL,
  snapshot_items jsonb NOT NULL,
  actor_id uuid REFERENCES public.usuarios (id),
  correlation_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_versiones_numero_unico UNIQUE (rfq_id, numero)
);

COMMENT ON TABLE public.rfq_versiones IS
  'C2.1/DC-04: snapshot append-only de cabecera + ítems del RFQ por guardado y versión final al crear Rev A. Sin blobs ni seguimientos.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rfq_versiones_final
  ON public.rfq_versiones (rfq_id) WHERE causa = 'CREAR_REV_A';

ALTER TABLE public.rfq_versiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfq_versiones_seleccionar ON public.rfq_versiones;
CREATE POLICY rfq_versiones_seleccionar
  ON public.rfq_versiones FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS p
      WHERE p.id = rfq_versiones.rfq_id
        AND (
          p.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

REVOKE ALL ON TABLE public.rfq_versiones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.rfq_versiones TO authenticated;
GRANT SELECT, INSERT ON TABLE public.rfq_versiones TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.rfq_versiones FROM service_role;

-- Las funciones trigger son SECURITY DEFINER: la app escribe como service_role,
-- que no tiene USAGE sobre el esquema `privado`.
-- Append-only incluso para el owner: solo el borrado en cascada del RFQ padre
-- (limpieza de fixtures) puede retirar versiones.
CREATE OR REPLACE FUNCTION privado.rfq_versiones_inmutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.pipeline AS p WHERE p.id = OLD.rfq_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'rfq_version_inmutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_versiones_inmutables ON public.rfq_versiones;
CREATE TRIGGER trg_rfq_versiones_inmutables
  BEFORE UPDATE OR DELETE ON public.rfq_versiones
  FOR EACH ROW EXECUTE FUNCTION privado.rfq_versiones_inmutables();

CREATE OR REPLACE FUNCTION privado.rfq_versiones_sin_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'rfq_version_inmutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_versiones_sin_truncate ON public.rfq_versiones;
CREATE TRIGGER trg_rfq_versiones_sin_truncate
  BEFORE TRUNCATE ON public.rfq_versiones
  FOR EACH STATEMENT EXECUTE FUNCTION privado.rfq_versiones_sin_truncate();

-- -----------------------------------------------------------------------------
-- 2. Snapshot e inserción serializada
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.insertar_version_rfq(
  p_rfq_id uuid,
  p_causa text,
  p_actor_id uuid,
  p_correlation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq public.pipeline%ROWTYPE;
  v_numero integer;
  v_items jsonb;
BEGIN
  -- El llamador puede tener ya el lock; tomarlo de nuevo es inocuo.
  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'codigo', i.codigo,
      'numero', i.numero,
      'estado', i.estado,
      'descripcion', i.descripcion,
      'cantidad', i.cantidad,
      'material_id', i.material_id,
      'espesor_id', i.espesor_id,
      'acabado', i.acabado,
      'notas', i.notas,
      'operaciones', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('proceso_id', o.proceso_id, 'orden', o.orden)
                         ORDER BY o.orden, o.id)
        FROM public.rfq_item_operaciones AS o
        WHERE o.rfq_item_id = i.id
      ), '[]'::jsonb)
    ) ORDER BY i.numero
  ), '[]'::jsonb)
  INTO v_items
  FROM public.rfq_items AS i
  WHERE i.rfq_id = p_rfq_id;

  SELECT COALESCE(max(v.numero), 0) + 1 INTO v_numero
  FROM public.rfq_versiones AS v
  WHERE v.rfq_id = p_rfq_id;

  INSERT INTO public.rfq_versiones (
    rfq_id, numero, causa, snapshot_cabecera, snapshot_items, actor_id, correlation_id
  ) VALUES (
    p_rfq_id,
    v_numero,
    p_causa,
    jsonb_build_object(
      'folio_rfq', v_rfq.folio_rfq,
      'estado_rfq', v_rfq.estado_rfq,
      'cliente_id', v_rfq.cliente_id,
      'contacto_id', v_rfq.contacto_id,
      'empresa', v_rfq.empresa,
      'nombre_contacto', v_rfq.nombre_contacto,
      'canal', v_rfq.canal,
      'canal_detalle', v_rfq.canal_detalle,
      'fecha_solicitud', v_rfq.fecha_solicitud,
      'fecha_requerida', v_rfq.fecha_requerida,
      'descripcion_general', v_rfq.descripcion_general,
      'responsable_id', v_rfq.responsable_id,
      'moneda', v_rfq.moneda,
      'actualizado_en', v_rfq.actualizado_en
    ),
    v_items,
    p_actor_id,
    p_correlation_id
  );

  RETURN v_numero;
END;
$$;

REVOKE ALL ON FUNCTION privado.insertar_version_rfq(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- RPC del servidor: versión por guardado de cabecera o ítems.
CREATE OR REPLACE FUNCTION public.registrar_version_rfq(
  p_rfq_id uuid,
  p_causa text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_causa NOT IN ('CABECERA', 'ITEM') THEN
    RAISE EXCEPTION 'rfq_version_causa_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_actor_id IS NULL
     OR NOT (
       privado.actor_con_permiso(p_actor_id, 'rfq_editar')
       OR privado.actor_con_permiso(p_actor_id, 'rfq_item_editar')
     ) THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;
  RETURN privado.insertar_version_rfq(p_rfq_id, p_causa, p_actor_id, p_correlation_id);
END;
$$;

COMMENT ON FUNCTION public.registrar_version_rfq(uuid, text, uuid, uuid) IS
  'C2.1/DC-04: registra un snapshot de cabecera + ítems tras un guardado. Solo service_role; revalida el permiso del actor.';

REVOKE ALL ON FUNCTION public.registrar_version_rfq(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_version_rfq(uuid, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Frontera Rev A: revalidar y registrar la versión final en la misma
--    transacción que `crear_propuesta` (que inserta el evento CONVERTED).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.congelar_rfq_en_rev_a()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_validacion jsonb;
BEGIN
  -- Editar en READY_FOR_PROPOSAL ya es posible (CV-01): si el RFQ se editó
  -- desde la aplicación (tiene versiones de guardado), debe seguir completo
  -- justo al congelarse. RFQ legados sin versiones conservan la validación que
  -- recibieron al marcarse listos.
  IF EXISTS (SELECT 1 FROM public.rfq_versiones AS v WHERE v.rfq_id = NEW.rfq_id) THEN
    v_validacion := public.validar_rfq_listo(NEW.rfq_id);
    IF (v_validacion->>'listo')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'rfq_no_listo' USING ERRCODE = '23514',
        DETAIL = v_validacion::text;
    END IF;
  END IF;

  PERFORM privado.insertar_version_rfq(NEW.rfq_id, 'CREAR_REV_A', NEW.actor_id, NEW.correlation_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.congelar_rfq_en_rev_a() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rfq_congelar_en_rev_a ON public.rfq_eventos;
CREATE TRIGGER trg_rfq_congelar_en_rev_a
  AFTER INSERT ON public.rfq_eventos
  FOR EACH ROW
  WHEN (NEW.estado_nuevo = 'CONVERTED' AND NEW.accion = 'crear_propuesta')
  EXECUTE FUNCTION privado.congelar_rfq_en_rev_a();

-- -----------------------------------------------------------------------------
-- 4. Congelamiento: tras la versión final, la definición del RFQ no cambia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.rfq_congelado(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Exigir el padre vivo permite el borrado en cascada del RFQ completo, sea
  -- cual sea el orden en que Postgres recorra las tablas hijas.
  SELECT EXISTS (SELECT 1 FROM public.pipeline AS p WHERE p.id = p_rfq_id)
    AND EXISTS (
      SELECT 1 FROM public.rfq_versiones AS v
      WHERE v.rfq_id = p_rfq_id AND v.causa = 'CREAR_REV_A'
    );
$$;

REVOKE ALL ON FUNCTION privado.rfq_congelado(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION privado.proteger_cabecera_rfq_congelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (
       NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.canal IS DISTINCT FROM OLD.canal
       OR NEW.canal_detalle IS DISTINCT FROM OLD.canal_detalle
       OR NEW.fecha_solicitud IS DISTINCT FROM OLD.fecha_solicitud
       OR NEW.fecha_requerida IS DISTINCT FROM OLD.fecha_requerida
       OR NEW.descripcion_general IS DISTINCT FROM OLD.descripcion_general
     )
     AND privado.rfq_congelado(OLD.id) THEN
    RAISE EXCEPTION 'rfq_congelado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_cabecera_congelada ON public.pipeline;
CREATE TRIGGER trg_rfq_cabecera_congelada
  BEFORE UPDATE ON public.pipeline
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_cabecera_rfq_congelada();

CREATE OR REPLACE FUNCTION privado.proteger_items_rfq_congelado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'rfq_items' THEN
    IF TG_OP = 'DELETE' THEN
      v_rfq_id := OLD.rfq_id;
    ELSE
      v_rfq_id := NEW.rfq_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT i.rfq_id INTO v_rfq_id FROM public.rfq_items AS i WHERE i.id = OLD.rfq_item_id;
  ELSE
    SELECT i.rfq_id INTO v_rfq_id FROM public.rfq_items AS i WHERE i.id = NEW.rfq_item_id;
  END IF;

  -- Sin padre (borrado en cascada del RFQ) no hay nada que proteger.
  IF v_rfq_id IS NOT NULL AND privado.rfq_congelado(v_rfq_id) THEN
    RAISE EXCEPTION 'rfq_congelado' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfq_items_congelados ON public.rfq_items;
CREATE TRIGGER trg_rfq_items_congelados
  BEFORE INSERT OR UPDATE OR DELETE ON public.rfq_items
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_items_rfq_congelado();

DROP TRIGGER IF EXISTS trg_rfq_item_operaciones_congeladas ON public.rfq_item_operaciones;
CREATE TRIGGER trg_rfq_item_operaciones_congeladas
  BEFORE INSERT OR UPDATE OR DELETE ON public.rfq_item_operaciones
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_items_rfq_congelado();

-- -----------------------------------------------------------------------------
-- 5. CV-01: READY_FOR_PROPOSAL admite editar ítems hasta crear Rev A.
--    Se reescribe solo la guarda de estado de las cuatro RPC de ítems; el
--    resto de su cuerpo queda idéntico. Falla cerrado si el texto no coincide.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_firma text;
  v_definicion text;
  v_original constant text :=
    $g$v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL')$g$;
  v_nueva constant text :=
    $g$v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL')$g$;
BEGIN
  FOREACH v_firma IN ARRAY ARRAY[
    'public.crear_item_rfq(uuid, jsonb, uuid, uuid)',
    'public.actualizar_item_rfq',
    'public.cancelar_item_rfq',
    'public.reemplazar_operaciones_item'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_definicion
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = split_part(split_part(v_firma, '.', 2), '(', 1);

    IF v_definicion IS NULL THEN
      RAISE EXCEPTION 'C2.1: no existe %', v_firma;
    END IF;
    IF position(v_nueva IN v_definicion) > 0 THEN
      CONTINUE;  -- ya migrada (idempotente)
    END IF;
    IF (length(v_definicion) - length(replace(v_definicion, v_original, ''))) / length(v_original) <> 1 THEN
      RAISE EXCEPTION 'C2.1: la guarda de estado de % no coincide con lo esperado', v_firma;
    END IF;
    EXECUTE replace(v_definicion, v_original, v_nueva);
  END LOOP;
END;
$$;
