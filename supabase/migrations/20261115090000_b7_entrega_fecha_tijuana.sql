-- =============================================================================
-- B7 — La fecha de entrega se valida contra el "hoy" del negocio
--
-- Pendiente anotado en el corte AUD-12: el CHECK `notas_entrega_fecha_entrega_valida`
-- y `actualizar_fecha_entrega` comparaban fechas con `::date` sobre timestamptz,
-- que usa el huso de la sesión (UTC en Supabase). Una nota generada o corregida
-- por la tarde en Tijuana se rechazaba como "anterior al día de generación"
-- (o como futura) al capturar el hoy local.
--
-- Ahora ambas comparan `(instante AT TIME ZONE 'America/Tijuana')::date`.
-- Aditiva: CHECK + redefinición de la RPC sin cambiar su firma ni permisos.
-- Aplicar solo en local.
-- =============================================================================

ALTER TABLE public.notas_entrega
  DROP CONSTRAINT IF EXISTS notas_entrega_fecha_entrega_valida;

ALTER TABLE public.notas_entrega
  ADD CONSTRAINT notas_entrega_fecha_entrega_valida
  CHECK (
    (fecha_entrega AT TIME ZONE 'America/Tijuana')::date
      >= (creado_en AT TIME ZONE 'America/Tijuana')::date
  ) NOT VALID;

ALTER TABLE public.notas_entrega
  VALIDATE CONSTRAINT notas_entrega_fecha_entrega_valida;

CREATE OR REPLACE FUNCTION public.actualizar_fecha_entrega(
  p_nota_id uuid,
  p_fecha_entrega timestamptz,
  p_actualizado_en_esperado timestamptz,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, fecha_entrega timestamptz, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nota public.notas_entrega%ROWTYPE;
  v_hoy date := (now() AT TIME ZONE 'America/Tijuana')::date;
  v_fecha date;
BEGIN
  IF p_nota_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'datos_fecha_entrega_invalidos' USING ERRCODE = '23514';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'entrega_generar') THEN
    RAISE EXCEPTION 'sin_permiso_entrega' USING ERRCODE = '42501';
  END IF;
  IF p_fecha_entrega IS NULL OR p_actualizado_en_esperado IS NULL THEN
    RAISE EXCEPTION 'datos_fecha_entrega_invalidos' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_nota
  FROM public.notas_entrega AS nota
  WHERE nota.id = p_nota_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_nota.actualizado_en IS DISTINCT FROM p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'entrega_desactualizada' USING ERRCODE = '23514';
  END IF;

  -- AUD-12: el día de la entrega es el del taller, no el de UTC.
  v_fecha := (p_fecha_entrega AT TIME ZONE 'America/Tijuana')::date;
  IF v_fecha < (v_nota.creado_en AT TIME ZONE 'America/Tijuana')::date THEN
    RAISE EXCEPTION 'fecha_entrega_invalida' USING ERRCODE = '23514';
  END IF;
  IF v_fecha > v_hoy THEN
    RAISE EXCEPTION 'fecha_entrega_futura' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  UPDATE public.notas_entrega AS nota
  SET fecha_entrega = p_fecha_entrega
  WHERE nota.id = p_nota_id
  RETURNING nota.id, nota.fecha_entrega, nota.actualizado_en;
END;
$$;

COMMENT ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid) IS
  'B7: corrige la fecha de entrega con CAS y permiso entrega_generar; no anterior al día de generación ni posterior a hoy, ambos en America/Tijuana (AUD-12). Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_fecha_entrega(uuid, timestamptz, timestamptz, uuid, uuid)
  TO service_role;
