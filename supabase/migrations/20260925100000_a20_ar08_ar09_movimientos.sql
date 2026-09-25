-- A20/AR-08 y AR-09: corrección trazable de pagos (reverso, no edición
-- destructiva) y representación única del anticipo heredado no estructurado.
-- -----------------------------------------------------------------------------

-- AR-09: anticipo heredado, separado de los pagos estructurados y correctibles.
ALTER TABLE public.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS abono_heredado numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abono_heredado_notas text,
  ADD COLUMN IF NOT EXISTS abono_heredado_en timestamptz;

ALTER TABLE public.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_abono_heredado_coherente;
ALTER TABLE public.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_abono_heredado_coherente CHECK (
    abono_heredado >= 0
    AND abono_heredado <= monto_total - saldo_pendiente
    AND (abono_heredado_notas IS NULL OR length(abono_heredado_notas) <= 300)
  );

COMMENT ON COLUMN public.cuentas_por_cobrar.abono_heredado IS
  'AR-09: anticipo del sistema anterior ya aplicado; se cuenta una sola vez y no se corrige con AR-08.';

-- AR-08: un reverso por pago; el pago original permanece intacto.
CREATE TABLE IF NOT EXISTS public.reversos_pago_ar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id uuid NOT NULL REFERENCES public.pagos_ar (id) ON DELETE RESTRICT,
  ar_id uuid NOT NULL REFERENCES public.cuentas_por_cobrar (id) ON DELETE RESTRICT,
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 300),
  monto_aplicado_reverso numeric(12,4) NOT NULL CHECK (monto_aplicado_reverso >= 0),
  monto_sobrepago_reverso numeric(12,4) NOT NULL DEFAULT 0 CHECK (monto_sobrepago_reverso >= 0),
  monedero_revertido_mxn numeric(12,4) NOT NULL DEFAULT 0 CHECK (monedero_revertido_mxn >= 0),
  creado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reversos_pago_ar_pago_unico UNIQUE (pago_id)
);

CREATE INDEX IF NOT EXISTS idx_reversos_pago_ar_cuenta
  ON public.reversos_pago_ar(ar_id, creado_en DESC);

ALTER TABLE public.reversos_pago_ar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reversos_pago_ar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reversos_pago_ar TO authenticated;
GRANT ALL ON TABLE public.reversos_pago_ar TO service_role;
DROP POLICY IF EXISTS reversos_pago_ar_lectura ON public.reversos_pago_ar;
CREATE POLICY reversos_pago_ar_lectura ON public.reversos_pago_ar
  FOR SELECT TO authenticated USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
    OR (SELECT privado.usuario_tiene_permiso('registrar_pagos'))
  );

-- -----------------------------------------------------------------------------
-- AR-09: registrar el anticipo heredado una sola vez, sin pagos estructurados.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_abono_heredado_ar(
  p_ar_id uuid,
  p_monto numeric,
  p_notas text,
  p_actor_id uuid
)
RETURNS TABLE (ar_id uuid, saldo_pendiente numeric, estado text, abono_heredado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_monto numeric := round(p_monto, 4);
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_saldo numeric;
BEGIN
  IF p_ar_id IS NULL OR p_actor_id IS NULL OR p_monto IS NULL
     OR p_monto <= 0 OR scale(p_monto) > 4 THEN
    RAISE EXCEPTION 'abono_heredado_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_registrar_pagos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.id = p_ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
  END IF;
  IF v_cuenta.abono_heredado > 0 THEN
    RAISE EXCEPTION 'abono_heredado_ya_registrado' USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pagos_ar AS pago WHERE pago.ar_id = p_ar_id) THEN
    RAISE EXCEPTION 'cuenta_con_pagos_estructurados' USING ERRCODE = 'check_violation';
  END IF;
  IF v_monto > v_cuenta.monto_total THEN
    RAISE EXCEPTION 'abono_heredado_excede_total' USING ERRCODE = 'check_violation';
  END IF;

  v_saldo := v_cuenta.monto_total - v_monto;
  UPDATE public.cuentas_por_cobrar AS cuenta
  SET
    abono_heredado = v_monto,
    abono_heredado_notas = v_notas,
    abono_heredado_en = now(),
    saldo_pendiente = v_saldo,
    estado = CASE WHEN v_saldo <= 0 THEN 'pagado' ELSE 'parcial' END
  WHERE cuenta.id = p_ar_id;

  RETURN QUERY
  SELECT cuenta.id, cuenta.saldo_pendiente, cuenta.estado, cuenta.abono_heredado
  FROM public.cuentas_por_cobrar AS cuenta WHERE cuenta.id = p_ar_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- AR-08: reverso atómico de un pago; restituye saldo/estado y monedero.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reversar_pago_ar(
  p_pago_id uuid,
  p_motivo text,
  p_actor_id uuid
)
RETURNS TABLE (
  pago_id uuid,
  ar_id uuid,
  folio_recibo text,
  saldo_pendiente numeric,
  estado_ar text,
  monedero_revertido_mxn numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pago public.pagos_ar%ROWTYPE;
  v_cuenta public.cuentas_por_cobrar%ROWTYPE;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_credito_mxn numeric;
  v_saldo numeric;
  v_estado text;
BEGIN
  IF p_pago_id IS NULL OR p_actor_id IS NULL
     OR length(v_motivo) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'reverso_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'registrar_pagos'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_registrar_pagos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_pago FROM public.pagos_ar AS pago
  WHERE pago.id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pago_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reversos_pago_ar AS reverso WHERE reverso.pago_id = p_pago_id) THEN
    RAISE EXCEPTION 'pago_ya_reversado' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_por_cobrar AS cuenta
  WHERE cuenta.id = v_pago.ar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cuenta_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_cuenta.estado = 'cancelado' THEN
    RAISE EXCEPTION 'cuenta_cancelada' USING ERRCODE = 'check_violation';
  END IF;

  -- El sobrepago se acreditó al monedero en MXN; el reverso exige ese crédito.
  v_credito_mxn := round(coalesce(v_pago.monto_sobrepago_ar, 0) * v_cuenta.tipo_cambio_origen, 4);
  IF v_credito_mxn > 0 THEN
    PERFORM 1 FROM public.clientes AS cliente
    WHERE cliente.id = v_cuenta.cliente_id AND cliente.saldo_a_favor >= v_credito_mxn
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'saldo_favor_insuficiente' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.clientes AS cliente
    SET saldo_a_favor = cliente.saldo_a_favor - v_credito_mxn
    WHERE cliente.id = v_cuenta.cliente_id;
    INSERT INTO public.movimientos_saldo_favor (
      cliente_id, ar_id_origen, monto, moneda, tipo, descripcion, creado_por
    ) VALUES (
      v_cuenta.cliente_id, v_cuenta.id, -v_credito_mxn, 'MXN', 'ajuste_manual',
      'Reverso de ' || v_pago.folio_recibo, p_actor_id
    );
  END IF;

  v_saldo := least(round(v_cuenta.saldo_pendiente + v_pago.monto_aplicado_ar, 4), v_cuenta.monto_total);
  v_estado := CASE
    WHEN v_saldo <= 0 THEN 'pagado'
    WHEN v_saldo < v_cuenta.monto_total THEN 'parcial'
    ELSE 'pendiente'
  END;

  UPDATE public.cuentas_por_cobrar AS cuenta
  SET saldo_pendiente = v_saldo, estado = v_estado
  WHERE cuenta.id = v_cuenta.id;

  INSERT INTO public.reversos_pago_ar (
    pago_id, ar_id, motivo, monto_aplicado_reverso, monto_sobrepago_reverso,
    monedero_revertido_mxn, creado_por
  ) VALUES (
    v_pago.id, v_cuenta.id, v_motivo, v_pago.monto_aplicado_ar,
    v_pago.monto_sobrepago_ar, v_credito_mxn, p_actor_id
  );

  RETURN QUERY SELECT v_pago.id, v_cuenta.id, v_pago.folio_recibo, v_saldo, v_estado, v_credito_mxn;
END;
$$;

COMMENT ON FUNCTION public.registrar_abono_heredado_ar(uuid, numeric, text, uuid) IS
  'AR-09: registra una sola vez el anticipo heredado y ajusta saldo/estado; solo service_role.';
COMMENT ON FUNCTION public.reversar_pago_ar(uuid, text, uuid) IS
  'AR-08: revierte un pago con motivo y restituye saldo/estado/monedero sin borrarlo; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_abono_heredado_ar(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reversar_pago_ar(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_abono_heredado_ar(uuid, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reversar_pago_ar(uuid, text, uuid) TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'reversos_pago_ar') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reversos_pago_ar;
  END IF;
END $$;
