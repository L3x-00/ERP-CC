-- A20/ORD-06: alta administrativa de trabajo histórico (excepción D-01/OBS-15).
-- Captura ID previo único, datos comerciales/técnicos y partidas, deja la orden
-- en Bandeja y crea una AR no cobrable (borrador D-04) sin consumir folio RFQ.
-- -----------------------------------------------------------------------------

ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS id_historico text,
  ADD COLUMN IF NOT EXISTS referencia_externa text,
  ADD COLUMN IF NOT EXISTS condicion_pago text,
  ADD COLUMN IF NOT EXISTS monto_sin_iva numeric(12,4),
  ADD COLUMN IF NOT EXISTS monto_iva numeric(12,4),
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS fecha_trabajo date,
  ADD COLUMN IF NOT EXISTS horas_estimadas numeric(10,2);

ALTER TABLE public.ordenes_produccion
  DROP CONSTRAINT IF EXISTS ordenes_produccion_historica_coherente;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_historica_coherente CHECK (
    (id_historico IS NULL OR (
      length(btrim(id_historico)) BETWEEN 1 AND 40
      AND monto_sin_iva IS NOT NULL AND monto_iva IS NOT NULL
      AND monto_sin_iva + monto_iva > 0
      AND fecha_trabajo IS NOT NULL
      AND condicion_pago IS NOT NULL
    ))
    AND (monto_sin_iva IS NULL) = (monto_iva IS NULL)
    AND (monto_sin_iva IS NULL OR (monto_sin_iva >= 0 AND monto_iva >= 0))
    AND (referencia_externa IS NULL
      OR length(btrim(referencia_externa)) BETWEEN 1 AND 120)
    AND (condicion_pago IS NULL
      OR condicion_pago IN ('contado', '15_dias', '30_dias', 'credito'))
    AND (notas IS NULL OR length(notas) <= 2000)
    AND (horas_estimadas IS NULL
      OR (horas_estimadas >= 0 AND horas_estimadas <= 999999.99))
  );

-- El ID previo es único sin importar mayúsculas ni espacios accidentales.
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_produccion_id_historico_unico
  ON public.ordenes_produccion (lower(btrim(id_historico)))
  WHERE id_historico IS NOT NULL;

COMMENT ON COLUMN public.ordenes_produccion.id_historico IS
  'ORD-06: identificador del sistema anterior; su presencia distingue el trabajo heredado.';

-- -----------------------------------------------------------------------------
-- Archivos del trabajo histórico: bucket privado y metadatos; el binario viaja
-- directo a Storage con URL firmada y la tabla solo guarda la referencia.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('archivos-orden-historica', 'archivos-orden-historica', false, 20971520)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.archivos_orden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE CASCADE,
  ruta text NOT NULL,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 250),
  mime text NOT NULL,
  tamano bigint NOT NULL CHECK (tamano > 0 AND tamano <= 20971520),
  creado_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archivos_orden_ruta_unica UNIQUE (ruta)
);

CREATE INDEX IF NOT EXISTS idx_archivos_orden_orden
  ON public.archivos_orden(orden_id, creado_en DESC);

ALTER TABLE public.archivos_orden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.archivos_orden FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.archivos_orden TO authenticated;
GRANT ALL ON TABLE public.archivos_orden TO service_role;
DROP POLICY IF EXISTS archivos_orden_lectura ON public.archivos_orden;
CREATE POLICY archivos_orden_lectura ON public.archivos_orden
  FOR SELECT TO authenticated USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'archivos_orden') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.archivos_orden;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Alta transaccional: orden + partidas + AR no cobrable. El folio OP lo genera
-- PostgreSQL; no se toca la serie RFQ/CNC del flujo comercial.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_historica(
  p_cliente_id uuid,
  p_actor_id uuid,
  p_id_historico text,
  p_fecha_trabajo date,
  p_fecha_compromiso timestamptz,
  p_condicion_pago text,
  p_referencia_externa text,
  p_monto_sin_iva numeric,
  p_monto_iva numeric,
  p_horas_estimadas numeric,
  p_notas text,
  p_partidas jsonb
)
RETURNS TABLE (id uuid, folio text, cuenta_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id_historico text := lower(btrim(coalesce(p_id_historico, '')));
  v_condicion text := nullif(btrim(coalesce(p_condicion_pago, '')), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia_externa, '')), '');
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_subtotal numeric := round(p_monto_sin_iva, 4);
  v_iva numeric := round(p_monto_iva, 4);
  v_orden_id uuid;
  v_folio text;
  v_cuenta_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_cliente_id IS NULL OR p_fecha_trabajo IS NULL
     OR p_fecha_compromiso IS NULL
     OR length(v_id_historico) NOT BETWEEN 1 AND 40
     OR p_monto_sin_iva IS NULL OR p_monto_iva IS NULL
     OR p_monto_sin_iva < 0 OR p_monto_iva < 0
     OR p_monto_sin_iva + p_monto_iva <= 0
     OR scale(p_monto_sin_iva) > 4 OR scale(p_monto_iva) > 4
     OR p_monto_sin_iva + p_monto_iva > 99999999.9999
     OR v_condicion IS NULL
     OR v_condicion NOT IN ('contado', '15_dias', '30_dias', 'credito')
     OR (v_referencia IS NOT NULL AND length(v_referencia) > 120)
     OR (v_notas IS NOT NULL AND length(v_notas) > 2000)
     OR (p_horas_estimadas IS NOT NULL AND (
          p_horas_estimadas < 0 OR p_horas_estimadas > 999999.99
          OR scale(p_horas_estimadas) > 2))
     OR p_partidas IS NULL OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'orden_historica_invalida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS actor
  JOIN public.permisos_rol AS permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_orden_historica' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.clientes AS cliente
  WHERE cliente.id = p_cliente_id AND cliente.estado = 'activo'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ordenes_produccion AS orden
    WHERE lower(btrim(orden.id_historico)) = v_id_historico
  ) THEN
    RAISE EXCEPTION 'id_historico_duplicado' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    p_cliente_id, NULL, p_fecha_compromiso, 'normal', p_partidas
  ) AS creada;

  UPDATE public.ordenes_produccion AS orden
  SET
    id_historico = v_id_historico,
    referencia_externa = v_referencia,
    condicion_pago = v_condicion,
    monto_sin_iva = v_subtotal,
    monto_iva = v_iva,
    notas = v_notas,
    fecha_trabajo = p_fecha_trabajo,
    horas_estimadas = p_horas_estimadas,
    estado = 'programada'
  WHERE orden.id = v_orden_id;

  -- AR no cobrable (D-04): exigible al entregar, admite anticipos mientras tanto.
  INSERT INTO public.cuentas_por_cobrar (
    orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
    tipo_cambio_origen, estado, monto_subtotal, monto_iva
  ) VALUES (
    v_orden_id, p_cliente_id, v_subtotal + v_iva, v_subtotal + v_iva, 'MXN',
    1, 'pendiente', v_subtotal, v_iva
  )
  RETURNING cuentas_por_cobrar.id INTO v_cuenta_id;

  RETURN QUERY SELECT v_orden_id, v_folio, v_cuenta_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'id_historico_duplicado' USING ERRCODE = 'unique_violation';
END;
$$;

COMMENT ON FUNCTION public.crear_orden_historica(
  uuid, uuid, text, date, timestamptz, text, text, numeric, numeric, numeric, text, jsonb
) IS 'ORD-06: orden heredada con AR no cobrable y folio OP; solo service_role.';

REVOKE EXECUTE ON FUNCTION public.crear_orden_historica(
  uuid, uuid, text, date, timestamptz, text, text, numeric, numeric, numeric, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_historica(
  uuid, uuid, text, date, timestamptz, text, text, numeric, numeric, numeric, text, jsonb
) TO service_role;
