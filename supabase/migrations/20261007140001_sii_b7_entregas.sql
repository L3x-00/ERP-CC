-- =============================================================================
-- SII-B7.1 — Entregas: folio NE-MMYY_XX-YY, cantidades por ITxx e idempotencia
-- Plan: docs/plan-erp-sii/07-entregas.md §7.1 (modelo y folio), §7.2 (evidencia)
-- Documento del cliente: §13 (parciales, folio NE, quién entrega/recibe/fecha),
--       §6.1 (NE-MMYY_XX-YY), §7 (Delivery 1:N desde Order), §6 (integridad)
--
-- Entrega ola 1 (modelo + RPC, sin UI):
--   * `notas_entrega`: folio_sii, entregado_por_id, recibido_por_id,
--     solicitud_id (idempotencia) y fecha_entrega
--   * `partidas_nota_entrega.codigo_item` (ITxx) + backfill desde la partida
--   * folio NE-MMYY_XX-YY derivado del folio O-/OI- de la orden con lock;
--     históricos sin folio_sii conservan NE-######
--   * triggers que completan folio SII / entregado_por / codigo_item también
--     para el flujo legacy (el RPC actual sigue funcionando)
--   * RPC `registrar_entrega` idempotente por solicitud, con locks
--     partidas→orden→usuarios y reutilización del trigger de AR/archivo
--   * RLS de lectura ampliada (entrega_generar/orden_vista/ver_finanzas)
--
-- Evidencia y firma usan el modelo `archivos` (E3): entidad `entrega` con
-- clases `evidencia`, `firma` y `firma_escaneada`; bucket privado dedicado.
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- Orden: 0610* → 0710* → 0711* → 0712* → 0713* → 0714*.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.notas_entrega') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20260814044151_fase_7_produccion_base antes';
  END IF;
  IF to_regclass('public.archivos') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261005100003_sii_b1_archivos antes';
  END IF;
  IF to_regclass('public.ordenes_produccion') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ordenes_produccion'
         AND column_name IN ('folio_sii', 'estado_sii', 'snapshot_json')
       GROUP BY table_name HAVING count(*) = 3
     ) THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007120001_sii_b5_orden_base antes';
  END IF;
  IF to_regprocedure('privado.actor_con_permiso(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100003_sii_b3_rfq_acciones antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Bucket privado de evidencias y firma de entrega
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('entregas-evidencias', 'entregas-evidencias', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
WHERE id = 'entregas-evidencias';

-- -----------------------------------------------------------------------------
-- 2. Columnas SII de la nota de entrega
-- -----------------------------------------------------------------------------
ALTER TABLE public.notas_entrega
  ADD COLUMN IF NOT EXISTS folio_sii text,
  ADD COLUMN IF NOT EXISTS entregado_por_id uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS recibido_por_id uuid REFERENCES public.contactos_cliente (id),
  ADD COLUMN IF NOT EXISTS solicitud_id uuid,
  ADD COLUMN IF NOT EXISTS fecha_entrega timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.notas_entrega.folio_sii IS
  'SII-B7.1: NE-MMYY_XX-YY (XX orden, YY entrega de esa orden); NULL en históricos sin folio_sii de orden (conservan NE-######).';
COMMENT ON COLUMN public.notas_entrega.entregado_por_id IS
  'SII-B7.1: usuario que entrega físicamente (por defecto el creador de la nota).';
COMMENT ON COLUMN public.notas_entrega.recibido_por_id IS
  'SII-B7.1: contacto del cliente que recibe, si existe.';
COMMENT ON COLUMN public.notas_entrega.solicitud_id IS
  'SII-B7.1: idempotencia de `registrar_entrega`; único parcial, nunca nulo en notas nuevas.';
COMMENT ON COLUMN public.notas_entrega.fecha_entrega IS
  'SII-B7.1: fecha de entrega (≥ fecha de generación); editable en la ola 2 con validación.';

-- -----------------------------------------------------------------------------
-- 2. Renglones: ITxx del snapshot de la orden
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_nota_entrega
  ADD COLUMN IF NOT EXISTS codigo_item text;

COMMENT ON COLUMN public.partidas_nota_entrega.codigo_item IS
  'SII-B7.1/7.3: ITxx estable del snapshot de la orden (heredado de la partida); NULL en históricos.';

-- -----------------------------------------------------------------------------
-- 3. Restricciones e índices (idempotentes)
-- -----------------------------------------------------------------------------
ALTER TABLE public.notas_entrega DROP CONSTRAINT IF EXISTS notas_entrega_folio_sii_formato;
ALTER TABLE public.notas_entrega
  ADD CONSTRAINT notas_entrega_folio_sii_formato
  CHECK (folio_sii IS NULL OR folio_sii ~ '^NE-[0-9]{4}_[0-9]{2,3}-[0-9]{2,}$');

ALTER TABLE public.notas_entrega DROP CONSTRAINT IF EXISTS notas_entrega_fecha_entrega_valida;
ALTER TABLE public.notas_entrega
  ADD CONSTRAINT notas_entrega_fecha_entrega_valida CHECK (fecha_entrega >= creado_en);

ALTER TABLE public.partidas_nota_entrega DROP CONSTRAINT IF EXISTS partidas_nota_entrega_codigo_item_valido;
ALTER TABLE public.partidas_nota_entrega
  ADD CONSTRAINT partidas_nota_entrega_codigo_item_valido
  CHECK (codigo_item IS NULL OR codigo_item ~ '^IT[0-9]{2,}$');

CREATE UNIQUE INDEX IF NOT EXISTS ux_notas_folio_sii ON public.notas_entrega (folio_sii);
CREATE UNIQUE INDEX IF NOT EXISTS ux_notas_solicitud
  ON public.notas_entrega (solicitud_id) WHERE solicitud_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_notas_entrega_entregado_por
  ON public.notas_entrega (entregado_por_id);
CREATE INDEX IF NOT EXISTS ix_partidas_nota_entrega_codigo
  ON public.partidas_nota_entrega (codigo_item);

-- -----------------------------------------------------------------------------
-- 4. Backfill idempotente de `codigo_item` desde la partida
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.backfill_codigo_item_entregas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_renglones integer;
BEGIN
  UPDATE public.partidas_nota_entrega AS renglon
  SET codigo_item = partida.codigo_item
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = renglon.partida_id
    AND renglon.codigo_item IS NULL
    AND partida.codigo_item IS NOT NULL;
  GET DIAGNOSTICS v_renglones = ROW_COUNT;
  RETURN v_renglones;
END;
$$;

COMMENT ON FUNCTION privado.backfill_codigo_item_entregas() IS
  'SII-B7.1: copia el ITxx de la partida a los renglones históricos; idempotente.';

REVOKE ALL ON FUNCTION privado.backfill_codigo_item_entregas() FROM PUBLIC, anon, authenticated;

SELECT privado.backfill_codigo_item_entregas();

-- -----------------------------------------------------------------------------
-- 5. Folio NE-MMYY_XX-YY: siguiente consecutivo con lock del llamador
--    El lock de la orden lo toman las RPC de entrega (mismo orden que hoy);
--    la función solo deriva el consecutivo (CASE para 9→10 y 99→100).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.siguiente_folio_entrega(p_orden_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_folio_orden text;
  v_base text;
  v_siguiente integer;
BEGIN
  SELECT orden.folio_sii INTO v_folio_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id;

  IF v_folio_orden IS NULL THEN
    RETURN NULL;
  END IF;

  v_base := regexp_replace(v_folio_orden, '^O(I)?-', '');
  IF v_base = v_folio_orden OR v_base = '' THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(max(split_part(nota.folio_sii, '-', 3)::integer), 0) + 1 INTO v_siguiente
  FROM public.notas_entrega AS nota
  WHERE nota.orden_id = p_orden_id
    AND nota.folio_sii IS NOT NULL
    AND starts_with(nota.folio_sii, 'NE-' || v_base || '-');

  RETURN 'NE-' || v_base || '-' || CASE
    WHEN v_siguiente < 100 THEN lpad(v_siguiente::text, 2, '0')
    ELSE v_siguiente::text
  END;
END;
$$;

COMMENT ON FUNCTION privado.siguiente_folio_entrega(uuid) IS
  'SII-B7.1: deriva NE-MMYY_XX-YY del folio_sii de la orden (CASE para ≥100); NULL en órdenes históricas.';

REVOKE ALL ON FUNCTION privado.siguiente_folio_entrega(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Triggers de completado: aplican también al flujo legacy (sin duplicar
--    la lógica de AR/archivo, que vive en partidas_nota_entrega AFTER INSERT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.completar_nota_entrega_sii()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.entregado_por_id IS NULL THEN
    NEW.entregado_por_id := NEW.creado_por;
  END IF;
  IF NEW.fecha_entrega IS NULL THEN
    NEW.fecha_entrega := now();
  END IF;
  IF NEW.folio_sii IS NULL THEN
    NEW.folio_sii := privado.siguiente_folio_entrega(NEW.orden_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.completar_nota_entrega_sii() IS
  'SII-B7.1: asigna folio_sii y entregado_por por defecto en cualquier alta (RPC nueva o legacy).';

REVOKE ALL ON FUNCTION privado.completar_nota_entrega_sii() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_notas_entrega_sii ON public.notas_entrega;
CREATE TRIGGER trigger_notas_entrega_sii
  BEFORE INSERT ON public.notas_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.completar_nota_entrega_sii();

CREATE OR REPLACE FUNCTION privado.completar_renglon_nota_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.codigo_item IS NULL THEN
    SELECT partida.codigo_item INTO NEW.codigo_item
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = NEW.partida_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.completar_renglon_nota_entrega() IS
  'SII-B7.1: copia el ITxx de la partida al renglón cuando no viene informado.';

REVOKE ALL ON FUNCTION privado.completar_renglon_nota_entrega() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_partidas_nota_entrega_codigo ON public.partidas_nota_entrega;
CREATE TRIGGER trigger_partidas_nota_entrega_codigo
  BEFORE INSERT ON public.partidas_nota_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.completar_renglon_nota_entrega();

-- -----------------------------------------------------------------------------
-- 7. RLS de lectura ampliada (entrega_generar / orden_vista / ver_finanzas)
--    Se conserva `gestionar_produccion` para el tablero de piso vigente.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS notas_entrega_seleccionar ON public.notas_entrega;
CREATE POLICY notas_entrega_seleccionar ON public.notas_entrega
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('entrega_generar'))
      OR (SELECT privado.usuario_tiene_permiso('orden_vista'))
      OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
      OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    )
  );

DROP POLICY IF EXISTS partidas_nota_entrega_seleccionar ON public.partidas_nota_entrega;
CREATE POLICY partidas_nota_entrega_seleccionar ON public.partidas_nota_entrega
  FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('entrega_generar'))
      OR (SELECT privado.usuario_tiene_permiso('orden_vista'))
      OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
      OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    )
  );

-- -----------------------------------------------------------------------------
-- 8. RPC: registrar entrega (idempotente, parciales por ITxx)
--    Locks: partidas (uuid asc) → orden → usuarios (mismo orden que el flujo
--    actual). Al insertar los renglones se dispara `archivar_orden_al_entregar`
--    (OBS-21/D-04), que archiva la orden y activa su AR al cubrir el 100 %.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_entrega(
  p_orden_id uuid,
  p_renglones jsonb,
  p_recibido_por text,
  p_contacto_id uuid DEFAULT NULL,
  p_entregado_por uuid DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_nota public.notas_entrega%ROWTYPE;
  v_existente public.notas_entrega%ROWTYPE;
  v_recibido text;
  v_entregado_por uuid;
  v_cantidad_renglones integer;
  v_renglones integer;
  v_folio_legacy text;
  v_es_parcial boolean;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'entrega_generar') THEN
    RAISE EXCEPTION 'sin_permiso_entrega' USING ERRCODE = '42501';
  END IF;

  v_recibido := btrim(coalesce(p_recibido_por, ''));
  IF p_orden_id IS NULL
     OR char_length(v_recibido) NOT BETWEEN 3 AND 120
     OR p_renglones IS NULL
     OR jsonb_typeof(p_renglones) <> 'array'
     OR jsonb_array_length(p_renglones) = 0
     OR jsonb_array_length(p_renglones) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_cantidad_renglones
  FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_renglones <> jsonb_array_length(p_renglones)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
       WHERE entrada.partida_id IS NULL
          OR entrada.cantidad_entregada IS NULL
          OR entrada.cantidad_entregada <= 0
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT entrada.partida_id
         FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
         GROUP BY entrada.partida_id
         HAVING count(*) > 1
       ) AS duplicada
     ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = '23514';
  END IF;

  v_entregado_por := coalesce(p_entregado_por, p_actor);

  -- Orden de locks vigente: partidas (UUID ascendente) → orden → usuarios.
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_renglones THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado_sii NOT IN ('EN_PRODUCCION', 'PRODUCCION_COMPLETADA') THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;

  PERFORM 1
  FROM public.usuarios AS entregador
  WHERE entregador.id = v_entregado_por AND entregador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entregador_no_activo' USING ERRCODE = '23514';
  END IF;

  IF p_contacto_id IS NOT NULL THEN
    PERFORM 1
    FROM public.contactos_cliente AS contacto
    WHERE contacto.id = p_contacto_id
      AND contacto.cliente_id = v_orden.cliente_id
      AND contacto.activo = true
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'contacto_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Idempotencia bajo lock: la misma solicitud devuelve la nota existente.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_producida, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_producida
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_pendiente' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  v_folio_legacy := public.generar_folio_nota_entrega('NE');

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, recibido_por, recibido_por_id,
    entregado_por_id, solicitud_id, creado_por
  ) VALUES (
    v_folio_legacy, p_orden_id, v_es_parcial, v_recibido, p_contacto_id,
    v_entregado_por, p_solicitud_id, p_actor
  )
  RETURNING * INTO v_nota;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, codigo_item, cantidad_solicitada, cantidad_entregada
  )
  SELECT v_nota.id, partida.id, partida.codigo_item, partida.cantidad_solicitada, entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;
  GET DIAGNOSTICS v_renglones = ROW_COUNT;

  RETURN jsonb_build_object(
    'notaId', v_nota.id,
    'folio', v_nota.folio,
    'folioSii', v_nota.folio_sii,
    'esParcial', v_nota.es_parcial,
    'creadoEn', v_nota.creado_en,
    'renglones', v_renglones,
    'yaExistia', false
  );
EXCEPTION WHEN unique_violation THEN
  -- Carrera de `solicitud_id` entre dos llamadas concurrentes: la perdedora
  -- devuelve la nota ganadora. Otros choques (folio) se propagan.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid) IS
  'SII-B7.1: registra una entrega parcial/total por ITxx con folio NE-MMYY_XX-YY, idempotente por solicitud_id y locks partidas→orden→usuarios. Dispara archivo y activación de AR al cubrir el 100 %. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid)
  TO service_role;
