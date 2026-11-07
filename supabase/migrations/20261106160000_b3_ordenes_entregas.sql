-- =============================================================================
-- B3 - Órdenes, planeación y entregas
-- Hallazgos: AUD-05 (entregas parciales y rutas contradictorias), AUD-06
-- (cancelación con recursos/sesiones inconsistentes) y AUD-14 (anulación
-- administrativa de notas de entrega).
--
-- Decisiones del cliente (06/11/2026):
--   * Se permiten entregas parciales de piezas conformes sin esperar el cierre
--     administrativo de toda la orden.
--   * NOK pendiente y scrap definitivo no son entregables (integración con B2).
--   * Si hay trabajo en ejecución, la cancelación se bloquea con un mensaje
--     accionable; no se cierran sesiones ni se descarta trabajo automáticamente.
--   * La anulación de notas es administrativa, con motivo, responsable, fecha y
--     auditoría; el documento no se borra. Si hay CxC/cobros, se bloquea.
--
-- No modifica B1, B2, B4 ni B5. La migración es compatible en cualquier orden:
-- si B2 ya aplicó su control de calidad, B3 reutiliza `cantidad_conforme` y no
-- duplica el trigger de conformes.
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUD-05 - Cantidad conforme disponible para entregar.
--    Si B2 no está aplicada, B3 mantiene `cantidad_conforme = producida`.
--    Si B2 ya está aplicada, B3 reutiliza su columna y su trigger.
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS cantidad_conforme numeric(14, 4) NOT NULL DEFAULT 0;

DO $b3_backfill$
BEGIN
  -- Si B2 ya está aplicada, su calidad manda: no se inventan conformes para
  -- partidas con producción pero todo NOK/scrap.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partidas_orden_produccion'
      AND column_name = 'cantidad_nok_pendiente'
  ) THEN
    UPDATE public.partidas_orden_produccion AS partida
    SET cantidad_conforme = partida.cantidad_producida
    WHERE partida.cantidad_conforme = 0
      AND partida.cantidad_producida > 0;
  END IF;
END;
$b3_backfill$;

COMMENT ON COLUMN public.partidas_orden_produccion.cantidad_conforme IS
  'AUD-04/AUD-05: piezas conformes y entregables. B3 la usa como tope de entrega; B2 la mantiene actualizada con la calidad.';

DO $b3_conforme$
BEGIN
  -- Si B2 ya está aplicada (existe cantidad_nok_pendiente), su trigger y su
  -- función son la fuente de verdad. B3 no los reemplaza.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partidas_orden_produccion'
      AND column_name = 'cantidad_nok_pendiente'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION privado.sincronizar_conforme_partida_b2()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.cantidad_conforme = 0 AND NEW.cantidad_producida > 0 THEN
            NEW.cantidad_conforme := NEW.cantidad_producida;
          END IF;
          RETURN NEW;
        END IF;

        IF NEW.cantidad_producida > OLD.cantidad_producida THEN
          NEW.cantidad_conforme := NEW.cantidad_conforme
            + (NEW.cantidad_producida - OLD.cantidad_producida);
        END IF;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'DROP TRIGGER IF EXISTS trigger_partida_sincronizar_conforme_b2 ON public.partidas_orden_produccion';
    EXECUTE 'CREATE TRIGGER trigger_partida_sincronizar_conforme_b2
      BEFORE INSERT OR UPDATE OF cantidad_producida ON public.partidas_orden_produccion
      FOR EACH ROW EXECUTE FUNCTION privado.sincronizar_conforme_partida_b2()';
  END IF;
END;
$b3_conforme$;

-- -----------------------------------------------------------------------------
-- 2. AUD-14 - Estado de la nota de entrega y anulación administrativa.
-- -----------------------------------------------------------------------------
ALTER TABLE public.notas_entrega
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'VIGENTE',
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_por uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS anulacion_solicitud_id uuid,
  ADD COLUMN IF NOT EXISTS nota_sustituta_id uuid REFERENCES public.notas_entrega (id);

DO $b3_nota_estado$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notas_entrega'::regclass
      AND conname = 'notas_entrega_estado_valido'
  ) THEN
    ALTER TABLE public.notas_entrega
      ADD CONSTRAINT notas_entrega_estado_valido
      CHECK (estado IN ('VIGENTE', 'ANULADA'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notas_entrega'::regclass
      AND conname = 'notas_entrega_anulacion_solicitud_unica'
  ) THEN
    ALTER TABLE public.notas_entrega
      ADD CONSTRAINT notas_entrega_anulacion_solicitud_unica
      UNIQUE (anulacion_solicitud_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notas_entrega'::regclass
      AND conname = 'notas_entrega_anulacion_completa'
  ) THEN
    ALTER TABLE public.notas_entrega
      ADD CONSTRAINT notas_entrega_anulacion_completa CHECK (
        (estado = 'VIGENTE' AND motivo_anulacion IS NULL
          AND anulada_en IS NULL AND anulada_por IS NULL)
        OR
        (estado = 'ANULADA' AND motivo_anulacion IS NOT NULL
          AND char_length(btrim(motivo_anulacion)) BETWEEN 3 AND 500
          AND anulada_en IS NOT NULL AND anulada_por IS NOT NULL)
      );
  END IF;
END;
$b3_nota_estado$;

CREATE INDEX IF NOT EXISTS idx_notas_entrega_estado
  ON public.notas_entrega (orden_id, estado, creado_en DESC);

COMMENT ON COLUMN public.notas_entrega.estado IS
  'AUD-14: VIGENTE o ANULADA. La nota nunca se borra.';
COMMENT ON COLUMN public.notas_entrega.nota_sustituta_id IS
  'AUD-14: relación opcional con la nota que sustituye a la anulada.';

-- -----------------------------------------------------------------------------
-- 3. AUD-14 - El archivo/activación de AR al entregar ignora notas anuladas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archivar_orden_al_entregar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_pendientes integer;
BEGIN
  SELECT nota.orden_id INTO v_orden_id
  FROM public.notas_entrega AS nota
  WHERE nota.id = NEW.nota_entrega_id;

  IF v_orden_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_orden_id
    AND coalesce(
      (
        SELECT sum(renglon.cantidad_entregada)
        FROM public.partidas_nota_entrega AS renglon
        JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
        WHERE renglon.partida_id = partida.id
          AND nota.estado = 'VIGENTE'
      ),
      0
    ) < partida.cantidad_solicitada;

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = coalesce(archivada_en, now())
    WHERE id = v_orden_id;

    -- D4-B: crédito exige días configurados en el cliente; nunca un 45 fijo.
    IF EXISTS (
      SELECT 1
      FROM public.cuentas_por_cobrar AS cuenta
      JOIN public.clientes AS cliente ON cliente.id = cuenta.cliente_id
      WHERE cuenta.orden_id = v_orden_id
        AND cuenta.cobrable_desde IS NULL
        AND lower(trim(coalesce(cliente.condiciones_pago, ''))) = 'credito'
        AND (
          cliente.credito_habilitado IS NOT TRUE
          OR cliente.dias_credito IS NULL
          OR cliente.dias_credito NOT BETWEEN 1 AND 365
        )
    ) THEN
      RAISE EXCEPTION 'cliente_credito_sin_dias' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.cuentas_por_cobrar AS cuenta
    SET
      cobrable_desde = now(),
      fecha_vencimiento = now() + make_interval(days => CASE
        lower(trim(coalesce(cliente.condiciones_pago, '')))
        WHEN 'contado' THEN 0
        WHEN '15_dias' THEN 15
        WHEN '30_dias' THEN 30
        WHEN 'credito' THEN cliente.dias_credito
        ELSE 30
      END)
    FROM public.clientes AS cliente
    WHERE cuenta.orden_id = v_orden_id
      AND cuenta.cliente_id = cliente.id
      AND cuenta.cobrable_desde IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archivar_orden_al_entregar() IS
  'OBS-21/D-04/AR-04 + AUD-14: archiva al entregar totalmente y activa AR pendiente; ignora notas ANULADAS.';

REVOKE EXECUTE ON FUNCTION public.archivar_orden_al_entregar()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_orden_al_entregar() TO service_role;

-- -----------------------------------------------------------------------------
-- 4. AUD-05 - Ruta única de entrega: parciales conformes sin esperar el cierre
--    administrativo. Se conservan folio, documentos, historial, permisos e
--    idempotencia; se excluyen notas anuladas y piezas no conformes.
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
AS $function$
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
  IF p_actor IS NULL OR NOT (
    privado.actor_con_permiso(p_actor, 'entrega_generar')
    OR privado.actor_con_permiso(p_actor, 'gestionar_produccion')
  ) THEN
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
  -- AUD-05: producción en curso o completada puede entregar piezas conformes;
  -- lo que no se permite es entregar una orden cancelada, en borrador o que
  -- todavía no entró a producción.
  IF v_orden.estado IN ('borrador', 'cancelada')
     OR v_orden.estado_sii NOT IN ('EN_PRODUCCION', 'PRODUCCION_COMPLETADA') THEN
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

  -- AUD-05/AUD-04: el tope es la cantidad conforme, no la producida. Las notas
  -- anuladas no cuentan como entregado.
  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    LEFT JOIN public.notas_entrega AS nota
      ON nota.id = historico.nota_entrega_id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_conforme, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada
      + coalesce(sum(historico.cantidad_entregada) FILTER (WHERE nota.estado = 'VIGENTE'), 0)
      > partida.cantidad_conforme
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
    LEFT JOIN public.notas_entrega AS nota
      ON nota.id = historico.nota_entrega_id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada
      + coalesce(sum(historico.cantidad_entregada) FILTER (WHERE nota.estado = 'VIGENTE'), 0)
      > partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_pendiente' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN public.notas_entrega AS nota ON nota.id = historico.nota_entrega_id
    LEFT JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada) FILTER (WHERE nota.estado = 'VIGENTE'), 0)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  v_folio_legacy := public.generar_folio_nota_entrega('NE');

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, recibido_por, recibido_por_id,
    entregado_por_id, solicitud_id, creado_por, estado
  ) VALUES (
    v_folio_legacy, p_orden_id, v_es_parcial, v_recibido, p_contacto_id,
    v_entregado_por, p_solicitud_id, p_actor, 'VIGENTE'
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
$function$;

COMMENT ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid) IS
  'SII-B7.1 + AUD-05: entrega parcial/total por ITxx de piezas conformes, incluso con producción en curso; excluye notas anuladas, topa por cantidad_conforme y es idempotente por solicitud_id. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 5. AUD-05 - La ruta legacy de Producción usa la misma validación.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_nota_entrega(
  p_orden_id uuid,
  p_recibido_por text,
  p_firma_cliente_url text,
  p_creado_por uuid,
  p_partidas jsonb,
  p_solicitud_id uuid
)
RETURNS TABLE (
  id uuid,
  folio text,
  es_parcial boolean,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_resultado jsonb;
  v_nota_id uuid;
BEGIN
  v_resultado := public.registrar_entrega(
    p_orden_id, p_partidas, p_recibido_por, NULL, p_creado_por,
    p_solicitud_id, p_creado_por, NULL);

  v_nota_id := (v_resultado ->> 'notaId')::uuid;
  IF nullif(btrim(coalesce(p_firma_cliente_url, '')), '') IS NOT NULL THEN
    UPDATE public.notas_entrega AS nota
    SET firma_cliente_url = btrim(p_firma_cliente_url)
    WHERE nota.id = v_nota_id AND nota.firma_cliente_url IS NULL;
  END IF;

  RETURN QUERY
  SELECT nota.id, nota.folio, nota.es_parcial, nota.creado_en
  FROM public.notas_entrega AS nota
  WHERE nota.id = v_nota_id;
END;
$function$;

-- Firma histórica de 5 argumentos: delega en la versión con idempotencia.
CREATE OR REPLACE FUNCTION public.generar_nota_entrega(
  p_orden_id uuid,
  p_recibido_por text,
  p_firma_cliente_url text,
  p_creado_por uuid,
  p_partidas jsonb
)
RETURNS TABLE (
  id uuid,
  folio text,
  es_parcial boolean,
  creado_en timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.generar_nota_entrega(
    p_orden_id, p_recibido_por, p_firma_cliente_url, p_creado_por, p_partidas, NULL::uuid);
$$;

COMMENT ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) IS
  'C7 legacy + AUD-05: usa la misma validación de registrar_entrega (conformes, parciales, notas anuladas). Solo service_role.';
COMMENT ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb, uuid) IS
  'C7 legacy + AUD-05 + AUD-15: nota de entrega idempotente por solicitud_id sobre la ruta única. Solo service_role.';

REVOKE ALL ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. AUD-14 - Anulación administrativa de una nota de entrega.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_nota_entrega(
  p_nota_id uuid,
  p_motivo text,
  p_actor_id uuid,
  p_solicitud_id uuid DEFAULT NULL,
  p_nota_sustituta_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado text,
  anulada_en timestamptz,
  ya_anulada boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_column
DECLARE
  v_nota public.notas_entrega%ROWTYPE;
  v_sustituta public.notas_entrega%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pendientes integer;
BEGIN
  IF p_nota_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'anulacion_invalida' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_anulacion_requerido' USING ERRCODE = '23514';
  END IF;
  -- Decisión del cliente (06/11/2026): la anulación es administrativa. Solo un
  -- administrador activo puede anular una nota.
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios AS actor
    WHERE actor.id = p_actor_id AND actor.activo = true AND actor.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'sin_permiso_anulacion' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_nota
  FROM public.notas_entrega AS nota
  WHERE nota.id = p_nota_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nota_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_nota.estado = 'ANULADA' THEN
    IF p_solicitud_id IS NOT NULL
       AND v_nota.anulacion_solicitud_id IS DISTINCT FROM p_solicitud_id THEN
      RAISE EXCEPTION 'solicitud_anulacion_conflicto' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_nota.id, v_nota.estado, v_nota.anulada_en, true;
    RETURN;
  END IF;

  -- AUD-14: no se revierte información financiera histórica. Se bloquea la
  -- anulación si la AR de la orden ya fue activada/cobrada o si tiene pagos,
  -- anticipos o aplicaciones de saldo. La AR todavía no cobrable (creada al
  -- aprobar la orden) no impide anular una nota: la nota es previa a la CxC.
  IF EXISTS (
    SELECT 1
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.orden_id = v_nota.orden_id
      AND (
        cuenta.estado IN ('parcial', 'pagado')
        OR cuenta.cobrable_desde IS NOT NULL
        OR round(cuenta.saldo_pendiente, 4) <> round(cuenta.monto_total, 4)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.pagos_ar AS pago
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = pago.ar_id
    WHERE cuenta.orden_id = v_nota.orden_id
  ) OR EXISTS (
    SELECT 1
    FROM public.movimientos_saldo_favor AS movimiento
    JOIN public.cuentas_por_cobrar AS cuenta ON cuenta.id = movimiento.ar_id_origen
    WHERE cuenta.orden_id = v_nota.orden_id
  ) THEN
    RAISE EXCEPTION 'nota_con_cuenta_por_cobrar' USING ERRCODE = '23514';
  END IF;

  IF p_nota_sustituta_id IS NOT NULL THEN
    SELECT * INTO v_sustituta
    FROM public.notas_entrega AS nota
    WHERE nota.id = p_nota_sustituta_id
      AND nota.orden_id = v_nota.orden_id
      AND nota.id <> v_nota.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nota_sustituta_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.notas_entrega AS nota
  SET estado = 'ANULADA',
      motivo_anulacion = v_motivo,
      anulada_en = now(),
      anulada_por = p_actor_id,
      anulacion_solicitud_id = p_solicitud_id,
      nota_sustituta_id = p_nota_sustituta_id
  WHERE nota.id = p_nota_id
  RETURNING * INTO v_nota;

  -- Si la nota había archivado la orden, se reabre para permitir la nota
  -- sustituta. No se toca el estado de producción ni la AR (bloqueada arriba).
  SELECT count(*) INTO v_pendientes
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.orden_id = v_nota.orden_id
    AND coalesce((
      SELECT sum(renglon.cantidad_entregada)
      FROM public.partidas_nota_entrega AS renglon
      JOIN public.notas_entrega AS nota ON nota.id = renglon.nota_entrega_id
      WHERE renglon.partida_id = partida.id AND nota.estado = 'VIGENTE'
    ), 0) < partida.cantidad_solicitada;

  IF v_pendientes > 0 THEN
    UPDATE public.ordenes_produccion
    SET archivada_en = NULL
    WHERE id = v_nota.orden_id AND archivada_en IS NOT NULL;
  END IF;

  IF to_regclass('public.orden_eventos_cambio') IS NOT NULL THEN
    INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id)
    VALUES (
      v_nota.orden_id,
      'orden_nota_anulada',
      jsonb_build_object(
        'nota_id', v_nota.id,
        'folio', v_nota.folio,
        'folio_sii', v_nota.folio_sii,
        'nota_sustituta_id', p_nota_sustituta_id
      ),
      v_motivo,
      p_actor_id
    );
  END IF;

  RETURN QUERY SELECT v_nota.id, v_nota.estado, v_nota.anulada_en, false;
EXCEPTION
  WHEN unique_violation THEN
    IF p_solicitud_id IS NOT NULL THEN
      SELECT * INTO v_nota FROM public.notas_entrega AS nota
      WHERE nota.anulacion_solicitud_id = p_solicitud_id;
      IF FOUND THEN
        RETURN QUERY SELECT v_nota.id, v_nota.estado, v_nota.anulada_en, true;
        RETURN;
      END IF;
    END IF;
    RAISE;
END;
$function$;

COMMENT ON FUNCTION public.anular_nota_entrega(uuid, text, uuid, uuid, uuid) IS
  'AUD-14: anula una nota con motivo, responsable y fecha; conserva el documento, ignora sus cantidades en pendientes y bloquea si hay CxC/cobros. Solo service_role.';

REVOKE ALL ON FUNCTION public.anular_nota_entrega(uuid, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anular_nota_entrega(uuid, text, uuid, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 7. AUD-06 - Cancelación transaccional y sin recursos atrapados.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_orden(
  p_orden_id uuid,
  p_estado_actual text,
  p_estado_nuevo text,
  p_motivo_cancelacion text DEFAULT NULL
)
RETURNS TABLE (id uuid, estado text, fecha_inicio timestamptz, fecha_fin timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado text;
  v_motivo text := nullif(btrim(coalesce(p_motivo_cancelacion, '')), '');
  v_programaciones integer := 0;
  v_reclamos integer := 0;
  v_corridas integer := 0;
BEGIN
  SELECT ordenes_produccion.estado
  INTO v_estado
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_estado IS DISTINCT FROM p_estado_actual AND NOT coalesce((
    v_estado = 'cancelada' AND p_estado_nuevo = 'cancelada'
    AND p_estado_actual IN ('borrador', 'programada', 'en_proceso', 'pausada')
  ), false) THEN
    RAISE EXCEPTION 'estado_conflicto' USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_estado_nuevo = 'cancelada' AND (v_motivo IS NULL OR char_length(v_motivo) < 3) THEN
    RAISE EXCEPTION 'motivo_cancelacion_requerido' USING ERRCODE = 'check_violation';
  END IF;

  -- AUD-06: si hay trabajo en ejecución, no se cancela automáticamente. El
  -- mensaje es accionable: primero se cierra o pausa la sesión y se libera la
  -- operación. No se finalizan sesiones ni se descarta trabajo.
  IF p_estado_nuevo = 'cancelada' AND (
    EXISTS (
      SELECT 1 FROM public.sesiones_trabajo AS sesion
      WHERE sesion.orden_id = p_orden_id
        AND sesion.estado_sesion IN ('activa', 'pausada')
    )
    OR EXISTS (
      SELECT 1 FROM public.programacion_areas AS programacion
      WHERE programacion.orden_id = p_orden_id
        AND programacion.estado_planeacion = 'en_proceso'
    )
  ) THEN
    RAISE EXCEPTION 'orden_con_trabajo_en_proceso' USING ERRCODE = '23514';
  END IF;

  IF p_estado_nuevo = 'cancelada' THEN
    PERFORM privado.cancelar_cuenta_de_orden(p_orden_id);

    SELECT count(*) INTO v_programaciones
    FROM public.programacion_areas AS programacion
    WHERE programacion.orden_id = p_orden_id
      AND programacion.estado_planeacion IN ('programada', 'en_preparacion', 'bloqueada');

    SELECT count(*) INTO v_reclamos
    FROM public.reclamos_proceso_operador AS reclamo
    WHERE reclamo.orden_id = p_orden_id AND reclamo.estado = 'activo';

    SELECT count(*) INTO v_corridas
    FROM public.corridas AS corrida
    WHERE corrida.orden_id = p_orden_id
      AND corrida.estado IN ('PLANIFICADA', 'PAUSADA');

    UPDATE public.reclamos_proceso_operador AS reclamo
    SET estado = 'liberado', actualizado_en = now()
    WHERE reclamo.orden_id = p_orden_id AND reclamo.estado = 'activo';

    UPDATE public.programacion_areas AS programacion
    SET estado_planeacion = 'cancelada'
    WHERE programacion.orden_id = p_orden_id
      AND programacion.estado_planeacion IN ('programada', 'en_preparacion', 'bloqueada');

    UPDATE public.corridas AS corrida
    SET estado = 'CANCELADA'
    WHERE corrida.orden_id = p_orden_id
      AND corrida.estado IN ('PLANIFICADA', 'PAUSADA');

    IF to_regclass('public.orden_eventos_cambio') IS NOT NULL THEN
      INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id)
      VALUES (
        p_orden_id,
        'orden_cancelada_operativa',
        jsonb_build_object(
          'programaciones_canceladas', v_programaciones,
          'reclamos_liberados', v_reclamos,
          'corridas_canceladas', v_corridas,
          'motivo', v_motivo
        ),
        v_motivo,
        NULL
      );
    END IF;
  END IF;

  -- Reintento idempotente: la AR ya se reconcilió; si la orden ya está
  -- cancelada, se devuelve sin una transición nueva.
  IF p_estado_nuevo = 'cancelada' AND v_estado = 'cancelada' THEN
    RETURN QUERY
    SELECT ordenes_produccion.id, ordenes_produccion.estado,
      ordenes_produccion.fecha_inicio, ordenes_produccion.fecha_fin
    FROM public.ordenes_produccion
    WHERE ordenes_produccion.id = p_orden_id;
    RETURN;
  END IF;

  IF NOT coalesce((
    (v_estado = 'borrador' AND p_estado_nuevo IN ('programada', 'cancelada'))
    OR (v_estado = 'programada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
    OR (v_estado = 'en_proceso' AND p_estado_nuevo IN ('pausada', 'completada', 'cancelada'))
    OR (v_estado = 'pausada' AND p_estado_nuevo IN ('en_proceso', 'cancelada'))
  ), false) THEN
    RAISE EXCEPTION 'transicion_no_permitida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_estado_nuevo = 'completada' AND EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.orden_id = p_orden_id
      AND partida.cantidad_producida < partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'orden_con_partidas_pendientes' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.ordenes_produccion
  SET
    estado = p_estado_nuevo,
    fecha_inicio = CASE
      WHEN p_estado_nuevo = 'en_proceso' THEN coalesce(ordenes_produccion.fecha_inicio, clock_timestamp())
      ELSE ordenes_produccion.fecha_inicio
    END,
    fecha_fin = CASE
      WHEN p_estado_nuevo = 'completada' THEN coalesce(ordenes_produccion.fecha_fin, clock_timestamp())
      ELSE ordenes_produccion.fecha_fin
    END,
    motivo_cancelacion = CASE
      WHEN p_estado_nuevo = 'cancelada' THEN v_motivo
      ELSE ordenes_produccion.motivo_cancelacion
    END
  WHERE ordenes_produccion.id = p_orden_id
  RETURNING
    ordenes_produccion.id,
    ordenes_produccion.estado,
    ordenes_produccion.fecha_inicio,
    ordenes_produccion.fecha_fin;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) IS
  'Cambia estado con bloqueo y compare-and-set; completar exige partidas producidas; cancelar exige motivo, bloquea trabajo en ejecución y libera programaciones, reclamos y corridas, además de cancelar la AR (A02) y auditar el evento (AUD-06). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_orden(uuid, text, text, text) TO service_role;
