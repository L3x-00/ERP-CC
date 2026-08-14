-- La duración bruta se mide entre instantes absolutos. La pausa de comida se
-- conserva como intervalo de horario local del taller (America/Tijuana).
-- Esto evita sumar o restar una hora artificial en cambios de horario estacional.
CREATE OR REPLACE FUNCTION privado.calcular_horas_sesion_trabajo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS TABLE (horas_brutas numeric, horas_netas numeric)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_inicio_local timestamp;
  v_fin_local timestamp;
  v_descuento_comida numeric;
  v_horas_brutas numeric;
BEGIN
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'rango_sesion_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_inicio_local := p_fecha_inicio AT TIME ZONE 'America/Tijuana';
  v_fin_local := p_fecha_fin AT TIME ZONE 'America/Tijuana';
  v_horas_brutas := extract(epoch FROM (p_fecha_fin - p_fecha_inicio)) / 3600::numeric;

  WITH dias AS (
    SELECT generate_series(
      v_inicio_local::date,
      v_fin_local::date,
      interval '1 day'
    )::date AS fecha
  )
  SELECT coalesce(sum(
    extract(epoch FROM (
      least(v_fin_local, dias.fecha + time '13:00')
      - greatest(v_inicio_local, dias.fecha + time '12:00')
    )) / 3600::numeric
  ), 0::numeric)
  INTO v_descuento_comida
  FROM dias
  WHERE least(v_fin_local, dias.fecha + time '13:00')
    > greatest(v_inicio_local, dias.fecha + time '12:00');

  RETURN QUERY SELECT
    round(v_horas_brutas, 2),
    round(greatest(v_horas_brutas - v_descuento_comida, 0::numeric), 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION privado.calcular_horas_sesion_trabajo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
