-- A20/AR-02: adjuntar la factura fiscal a la AR existente (D-04).
-- No crea una segunda AR ni modifica importe, saldo, pagos o cobrabilidad.
CREATE OR REPLACE FUNCTION public.registrar_factura_ar(
  p_ar_id uuid,
  p_actualizado_en_esperado timestamptz,
  p_folio_factura text,
  p_fecha_vencimiento timestamptz,
  p_actor_id uuid
)
RETURNS TABLE (
  cuenta_id uuid,
  version_nueva timestamptz,
  folio_factura text,
  fecha_vencimiento timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_folio text := nullif(btrim(p_folio_factura), '');
BEGIN
  IF p_ar_id IS NULL OR p_actor_id IS NULL OR p_actualizado_en_esperado IS NULL
     OR v_folio IS NULL OR length(v_folio) > 60 THEN
    RAISE EXCEPTION 'datos_factura_invalidos' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo
    AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_factura' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar cuenta
  WHERE cuenta.id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.actualizado_en <> p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'cuenta_desactualizada' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_cuenta.cobrable_desde IS NULL AND p_fecha_vencimiento IS NOT NULL)
     OR (v_cuenta.cobrable_desde IS NOT NULL AND p_fecha_vencimiento IS NULL) THEN
    RAISE EXCEPTION 'vencimiento_no_corresponde_cobrabilidad' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.cuentas_por_cobrar cuenta
  SET folio_factura_remision = v_folio,
      fecha_vencimiento = p_fecha_vencimiento
  WHERE cuenta.id = p_ar_id
  RETURNING cuenta.id, cuenta.actualizado_en, cuenta.folio_factura_remision, cuenta.fecha_vencimiento;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_factura_ar(uuid, timestamptz, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_factura_ar(uuid, timestamptz, text, timestamptz, uuid)
  TO service_role;
