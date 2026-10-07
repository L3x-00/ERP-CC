-- =============================================================================
-- Decisión final del cliente D1-B — folios derivados con prefijo de origen
-- Plan: docs/plan-erp-sii/07-entregas.md, 08-finanzas.md §8.3; doc cliente §6.1.
--
-- Las entregas y recibos derivados de una orden conservan el prefijo de su
-- folio_sii (O-/OI-), de modo que una orden comercial `O-2610_05` y una interna
-- `OI-2610_05` del mismo mes no colisionan ni exigen renumeración manual:
--   O-2610_05  → NE-O-2610_05-01  / RP-O-2610_05-01
--   OI-2610_05 → NE-OI-2610_05-01 / RP-OI-2610_05-01
--
-- No cambian: los históricos `NE-######`/`REC-######`, los recibos repartidos
-- `RP-MMYY_0000-YY`, los folios ya emitidos con el formato anterior (se admiten
-- en el CHECK para no romper historial) ni los contadores de la orden.
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CHECK de formatos: nuevo formato con prefijo + formatos ya emitidos
-- -----------------------------------------------------------------------------
ALTER TABLE public.notas_entrega DROP CONSTRAINT IF EXISTS notas_entrega_folio_sii_formato;
ALTER TABLE public.notas_entrega
  ADD CONSTRAINT notas_entrega_folio_sii_formato
  CHECK (folio_sii IS NULL
    OR folio_sii ~ '^NE-((O|OI)-)?[0-9]{4}_[0-9]{2,3}-[0-9]{2,}$');

COMMENT ON COLUMN public.notas_entrega.folio_sii IS
  'D1-B: NE-O-MMYY_XX-YY / NE-OI-MMYY_XX-YY (XX folio de la orden, YY entrega); NULL en históricos con NE-######.';

ALTER TABLE public.pagos_ar DROP CONSTRAINT IF EXISTS pagos_ar_folio_recibo_check;
ALTER TABLE public.pagos_ar ADD CONSTRAINT pagos_ar_folio_recibo_check
  CHECK (folio_recibo ~ '^(REC-[0-9]{6}|RP-((O|OI)-)?[0-9]{4}_([0-9]{2,3}|0{4})-[0-9]{2,})$');

COMMENT ON COLUMN public.pagos_ar.folio_recibo IS
  'D1-B: RP-O-MMYY_XX-YY / RP-OI-MMYY_XX-YY en órdenes con folio_sii; RP-MMYY_0000-YY en repartidos; REC-###### en históricos.';

-- -----------------------------------------------------------------------------
-- 2. Folio de entrega: conserva el prefijo O-/OI- del folio de la orden
--    (mismo lock de la orden que toma la RPC; CASE para 9→10 y 99→100).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.siguiente_folio_entrega(p_orden_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folio_orden text;
  v_siguiente integer;
BEGIN
  SELECT orden.folio_sii INTO v_folio_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;

  IF v_folio_orden IS NULL
     OR v_folio_orden !~ '^O(I)?-[0-9]{4}_[0-9]{2,3}$' THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(max(split_part(nota.folio_sii, '-', 4)::integer), 0) + 1 INTO v_siguiente
  FROM public.notas_entrega AS nota
  WHERE nota.orden_id = p_orden_id
    AND nota.folio_sii IS NOT NULL
    AND starts_with(nota.folio_sii, 'NE-' || v_folio_orden || '-');

  RETURN 'NE-' || v_folio_orden || '-' || CASE
    WHEN v_siguiente < 100 THEN lpad(v_siguiente::text, 2, '0')
    ELSE v_siguiente::text
  END;
END;
$$;

COMMENT ON FUNCTION privado.siguiente_folio_entrega(uuid) IS
  'D1-B: deriva NE-O-.../NE-OI-... del folio_sii de la orden (CASE para ≥100); NULL en órdenes históricas.';

REVOKE ALL ON FUNCTION privado.siguiente_folio_entrega(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Folio de recibo: mismo prefijo; advisory lock por orden (sin invertir el
--    orden AR → usuario → cliente del motor de pagos).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.siguiente_folio_recibo(p_orden_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_base text;
  v_consecutivo integer;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT orden.folio_sii INTO v_base
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;

  IF v_base IS NULL
     OR v_base !~ '^O(I)?-[0-9]{4}_[0-9]{2,3}$' THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('recibo:' || p_orden_id::text, 0));

  SELECT count(*) + 1
  INTO v_consecutivo
  FROM public.pagos_ar AS pago
  JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = pago.ar_id
  WHERE cuenta.orden_id = p_orden_id
    AND starts_with(pago.folio_recibo, 'RP-' || v_base || '-');

  RETURN 'RP-' || v_base || '-' ||
    CASE WHEN v_consecutivo < 100
      THEN lpad(v_consecutivo::text, 2, '0')
      ELSE v_consecutivo::text
    END;
END;
$function$;

COMMENT ON FUNCTION privado.siguiente_folio_recibo(uuid) IS
  'D1-B: deriva RP-O-.../RP-OI-... del folio_sii de la orden (CASE para ≥100); NULL si la orden no tiene folio_sii (se conserva REC).';

REVOKE ALL ON FUNCTION privado.siguiente_folio_recibo(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
