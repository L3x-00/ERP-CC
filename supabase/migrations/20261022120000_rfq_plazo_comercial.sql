-- =============================================================================
-- Obs. cliente 2026-10-21 (punto 6) — Plazo comercial del RFQ.
--
--   * Cuando el cliente no pide una fecha específica, el ERP no obliga a
--     inventarla: el RFQ guarda un plazo comercial en texto libre
--     (p. ej. «Fabricación 5-7 días») y la fecha compromiso comercial sigue
--     pendiente hasta que se confirma al aceptar la Propuesta (DC-09).
--   * `pipeline.plazo_comercial` es informativo y opcional. No alimenta
--     `fecha_compromiso` ni `fecha_operativa` de la Orden.
--   * Se versiona como el resto de la cabecera (snapshot de `rfq_versiones`) y
--     se congela con ella al crear la Rev A.
--   * Aditiva: una columna nullable y dos redefiniciones de función sin cambio
--     de firma. Las filas existentes quedan con plazo vacío.
-- =============================================================================

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS plazo_comercial text
    CONSTRAINT pipeline_plazo_comercial_largo
    CHECK (plazo_comercial IS NULL OR char_length(plazo_comercial) BETWEEN 1 AND 120);

COMMENT ON COLUMN public.pipeline.plazo_comercial IS
  'Obs. cliente 2026-10-21: plazo comercial ofrecido en texto libre (p. ej. «Fabricación 5-7 días») cuando el cliente no pide fecha. Informativo: no es la fecha compromiso comercial (se confirma al aceptar la Propuesta) ni la fecha operativa.';

-- -----------------------------------------------------------------------------
-- Snapshot de versión: incluye el plazo comercial.
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
      'plazo_comercial', v_rfq.plazo_comercial,
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

-- -----------------------------------------------------------------------------
-- Congelamiento: el plazo es parte de la cabecera y no cambia tras la Rev A.
-- -----------------------------------------------------------------------------
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
       OR NEW.plazo_comercial IS DISTINCT FROM OLD.plazo_comercial
       OR NEW.descripcion_general IS DISTINCT FROM OLD.descripcion_general
     )
     AND privado.rfq_congelado(OLD.id) THEN
    RAISE EXCEPTION 'rfq_congelado' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
