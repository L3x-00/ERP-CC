-- =============================================================================
-- Fase 8: corrige validación de valores numéricos especiales.
-- Las migraciones iniciales se mantienen reproducibles; este parche reemplaza
-- las funciones ya aplicadas en remoto sin alterar datos ni historiales.
-- =============================================================================

DO $$
DECLARE
  v_definicion text;
BEGIN
  SELECT pg_get_functiondef(
    'public.abrir_cuenta_por_cobrar(uuid, numeric, text, numeric, timestamptz, text)'::regprocedure
  ) INTO v_definicion;

  v_definicion := replace(
    v_definicion,
    E'p_monto_total IS NULL OR p_monto_total <= 0\n     OR p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0',
    E'p_monto_total IS NULL OR p_monto_total <= 0\n     OR p_monto_total IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric)\n     OR p_tipo_cambio_origen IS NULL OR p_tipo_cambio_origen <= 0\n     OR p_tipo_cambio_origen IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric)'
  );
  EXECUTE v_definicion;

  SELECT pg_get_functiondef(
    'public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid)'::regprocedure
  ) INTO v_definicion;

  v_definicion := replace(
    v_definicion,
    E'p_monto_pagado IS NULL OR p_monto_pagado <= 0\n     OR p_tipo_cambio_pago IS NULL OR p_tipo_cambio_pago <= 0',
    E'p_monto_pagado IS NULL OR p_monto_pagado <= 0\n     OR p_monto_pagado IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric)\n     OR p_tipo_cambio_pago IS NULL OR p_tipo_cambio_pago <= 0\n     OR p_tipo_cambio_pago IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric)'
  );
  v_definicion := replace(
    v_definicion,
    E'NOT isfinite(v_equivalente_ar::double precision) OR v_equivalente_ar <= 0',
    E'v_equivalente_ar IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric)\n     OR v_equivalente_ar <= 0'
  );
  EXECUTE v_definicion;

  SELECT pg_get_functiondef(
    'public.aplicar_saldo_favor_ar(uuid, uuid, numeric, uuid, uuid)'::regprocedure
  ) INTO v_definicion;

  v_definicion := replace(
    v_definicion,
    E'p_monto_mxn IS NULL OR p_monto_mxn <= 0 THEN',
    E'p_monto_mxn IS NULL OR p_monto_mxn <= 0\n     OR p_monto_mxn IN (\'NaN\'::numeric, \'Infinity\'::numeric, \'-Infinity\'::numeric) THEN'
  );
  EXECUTE v_definicion;
END;
$$;
