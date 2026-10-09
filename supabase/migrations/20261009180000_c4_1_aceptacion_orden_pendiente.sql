-- =============================================================================
-- C4.1 — Aceptación durable y «Orden pendiente» (DC-09, CONTRATOS-CORTE-0 §6)
--
--   * `aceptar_revision` exige `fecha_compromiso_comercial` y, en la MISMA
--     transacción, acepta la revisión exacta, congela la fecha y crea una
--     solicitud durable y única de Orden (`solicitudes_orden`, PENDING).
--   * `procesar_solicitud_orden` intenta crear la Orden (idempotente): si un
--     gate falla (crédito, tipo de cambio, cliente…), la aceptación se
--     conserva y la solicitud queda BLOCKED con la causa; el reintento usa la
--     misma solicitud y converge en exactamente una Orden (además del índice
--     único existente de `ordenes_produccion.propuesta_revision_id`).
--   * La copia de la fecha compromiso comercial a la Orden se cablea en C4.2.
--
-- Aditiva. Aplicar solo en local hasta autorización del PO.
-- =============================================================================

ALTER TABLE public.propuesta_revisiones
  ADD COLUMN IF NOT EXISTS fecha_compromiso_comercial date;

COMMENT ON COLUMN public.propuesta_revisiones.fecha_compromiso_comercial IS
  'C4.1/DC-09: fecha prometida al cliente, confirmada al aceptar. No se deriva de la fecha requerida.';

CREATE TABLE IF NOT EXISTS public.solicitudes_orden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL UNIQUE REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  propuesta_id uuid NOT NULL REFERENCES public.propuestas (id) ON DELETE CASCADE,
  fecha_compromiso_comercial date NOT NULL,
  estado text NOT NULL DEFAULT 'PENDING' CHECK (estado IN ('PENDING', 'BLOCKED', 'CREATED')),
  causa_codigo text,
  causa_detalle text,
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  orden_id uuid REFERENCES public.ordenes_produccion (id),
  creado_por uuid REFERENCES public.usuarios (id),
  ultimo_intento_por uuid REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_orden_creada_con_orden CHECK ((estado = 'CREATED') = (orden_id IS NOT NULL))
);

COMMENT ON TABLE public.solicitudes_orden IS
  'C4.1/DC-09: solicitud durable y única de Orden por revisión aceptada (PENDING/BLOCKED/CREATED). La aceptación nunca se revierte por un fallo al crear la Orden.';

ALTER TABLE public.solicitudes_orden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS solicitudes_orden_seleccionar ON public.solicitudes_orden;
CREATE POLICY solicitudes_orden_seleccionar
  ON public.solicitudes_orden FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('propuesta_vista'))
      OR (SELECT privado.usuario_tiene_permiso('orden_liberar'))
    )
  );
REVOKE ALL ON TABLE public.solicitudes_orden FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.solicitudes_orden TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.solicitudes_orden TO service_role;

CREATE OR REPLACE FUNCTION public.aceptar_revision(
  p_revision_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_esperado timestamptz;
  v_canal text;
  v_destino text;
  v_fecha_compromiso date;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'propuesta_aceptar') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  -- C4.1/DC-09: la fecha compromiso comercial se confirma al aceptar.
  BEGIN
    v_fecha_compromiso := NULLIF(btrim(COALESCE(p_datos->>'fecha_compromiso_comercial', '')), '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'fecha_compromiso_invalida' USING ERRCODE = '22023';
  END;
  IF v_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = '22023';
  END IF;

  v_canal := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'canal'), '')), '');
  v_destino := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'destino'), '')), '');

  SELECT * INTO v_revision FROM public.propuesta_revisiones
  WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado NOT IN ('SENT', 'FOLLOW_UP') THEN
    RAISE EXCEPTION 'revision_estado_invalido' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_revision.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'revision_desactualizada' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('sii.b4_rpc', 'on', true);

  UPDATE public.propuesta_revisiones
  SET estado = 'ACCEPTED', fecha_compromiso_comercial = v_fecha_compromiso, actualizado_en = now()
  WHERE id = p_revision_id;

  -- La revisión aceptada es explícita: puede ser anterior a la última.
  UPDATE public.propuestas
  SET estado = 'ACCEPTED',
      accepted_revision_id = p_revision_id,
      revision_vigente_id = p_revision_id
  WHERE id = v_revision.propuesta_id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, canal, destino, actor_id, correlation_id
  ) VALUES (
    p_revision_id, v_revision.estado, 'ACCEPTED', 'aceptar_revision',
    v_canal, v_destino, p_actor, p_correlation_id
  );

  -- Misma transacción: solicitud durable y única de Orden para esta revisión.
  INSERT INTO public.solicitudes_orden (revision_id, propuesta_id, fecha_compromiso_comercial, creado_por)
  VALUES (p_revision_id, v_revision.propuesta_id, v_fecha_compromiso, p_actor)
  ON CONFLICT (revision_id) DO NOTHING;

  RETURN jsonb_build_object(
    'revisionId', p_revision_id,
    'estado', 'ACCEPTED',
    'acceptedRevisionId', p_revision_id,
    'fechaCompromisoComercial', v_fecha_compromiso,
    'solicitudOrden', 'PENDING'
  );
END;
$$;

COMMENT ON FUNCTION public.aceptar_revision(uuid, jsonb, uuid, uuid) IS
  'SII-B4.10 + C4.1: acepta la revisión exacta (puede ser anterior), exige y congela la fecha compromiso comercial y crea la solicitud única de Orden en la misma transacción. Solo service_role.';

-- -----------------------------------------------------------------------------
-- Procesar / reintentar la solicitud de Orden (idempotente)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_solicitud_orden(
  p_revision_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_solicitud public.solicitudes_orden%ROWTYPE;
  v_orden record;
  v_codigo text;
  v_detalle text;
BEGIN
  -- Reintentar es una acción explícita con permiso propio: un actor sin
  -- permiso no marca la solicitud como bloqueada.
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_liberar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_solicitud FROM public.solicitudes_orden AS s
  WHERE s.revision_id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud_orden_inexistente' USING ERRCODE = '22023';
  END IF;

  IF v_solicitud.estado = 'CREATED' THEN
    RETURN (
      SELECT jsonb_build_object('estado', 'CREATED', 'ordenId', o.id, 'folio', o.folio,
        'folioSii', o.folio_sii, 'yaExistia', true)
      FROM public.ordenes_produccion AS o WHERE o.id = v_solicitud.orden_id
    );
  END IF;

  BEGIN
    SELECT * INTO v_orden
    FROM public.crear_orden_desde_revision(p_revision_id, p_actor_id, p_correlation_id);

    UPDATE public.solicitudes_orden
    SET estado = 'CREATED', orden_id = v_orden.id, causa_codigo = NULL, causa_detalle = NULL,
        intentos = intentos + 1, ultimo_intento_por = p_actor_id, actualizado_en = now()
    WHERE id = v_solicitud.id;

    RETURN jsonb_build_object('estado', 'CREATED', 'ordenId', v_orden.id, 'folio', v_orden.folio,
      'folioSii', v_orden.folio_sii, 'yaExistia', v_orden.ya_existia);
  EXCEPTION WHEN others THEN
    -- El intento fallido se revierte completo (subtransacción); la aceptación
    -- y la solicitud permanecen, con la causa para reintentar.
    GET STACKED DIAGNOSTICS v_codigo = MESSAGE_TEXT, v_detalle = PG_EXCEPTION_DETAIL;
    UPDATE public.solicitudes_orden
    SET estado = 'BLOCKED', causa_codigo = left(v_codigo, 120), causa_detalle = left(v_detalle, 2000),
        intentos = intentos + 1, ultimo_intento_por = p_actor_id, actualizado_en = now()
    WHERE id = v_solicitud.id;
    RETURN jsonb_build_object('estado', 'BLOCKED', 'causa', left(v_codigo, 120), 'detalle', v_detalle);
  END;
END;
$$;

COMMENT ON FUNCTION public.procesar_solicitud_orden(uuid, uuid, uuid) IS
  'C4.1/DC-09: crea (o recupera) la Orden de una solicitud; si falla un gate deja BLOCKED con causa sin revertir la aceptación. Idempotente; exige orden_liberar. Solo service_role.';

REVOKE ALL ON FUNCTION public.procesar_solicitud_orden(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_solicitud_orden(uuid, uuid, uuid) TO service_role;

-- Backfill: revisiones ya aceptadas antes de C4.1 obtienen su solicitud con
-- el estado real (CREATED si ya tienen Orden). La fecha compromiso se toma de
-- la Orden existente o, si no hay, de la fecha de aceptación: es un dato
-- histórico, no una derivación nueva desde la fecha requerida.
INSERT INTO public.solicitudes_orden (revision_id, propuesta_id, fecha_compromiso_comercial, estado, orden_id)
SELECT r.id, r.propuesta_id,
       COALESCE(o.fecha_compromiso::date, r.actualizado_en::date),
       CASE WHEN o.id IS NULL THEN 'PENDING' ELSE 'CREATED' END,
       o.id
FROM public.propuesta_revisiones AS r
LEFT JOIN public.ordenes_produccion AS o ON o.propuesta_revision_id = r.id
WHERE r.estado IN ('ACCEPTED', 'SALE_CONFIRMED')
ON CONFLICT (revision_id) DO NOTHING;
