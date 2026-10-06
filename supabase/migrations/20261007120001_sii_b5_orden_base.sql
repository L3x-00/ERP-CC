-- =============================================================================
-- SII-B5.1/B5.2/B5.5 — Orden desde revisión aceptada, snapshot y folio O-/OI-
-- Plan: docs/plan-erp-sii/05-orden-trabajo.md §5.1, §5.2, §5.5
-- Documento del cliente: §11 (contenido/estados), §7 (nace de la revisión),
--       §6.1 (O-MMYY_XX / OI-MMYY_XX)
--
-- Entrega ola 1 (modelo + RPCs):
--   * columnas SII en `ordenes_produccion` y `partidas_orden_produccion`
--   * tabla `orden_eventos_cambio` (trazabilidad post-aceptación)
--   * backfill `estado_sii` desde `estado` (históricos conservan OP-)
--   * RPC `crear_orden_desde_revision` (idempotente, snapshot, AR no cobrable)
--   * RPC `crear_orden_interna` (alta directa autorizada, sin AR)
--   * puente temporal estado_sii ↔ estado legacy (se retira en la ola 2)
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- Orden: 0610* (catálogos) → 0710* (B3) → 0711* (B4) → 0712* (B5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.propuesta_revisiones') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007110001_sii_b4_propuestas_base antes';
  END IF;
  IF to_regclass('public.propuesta_items') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007110001_sii_b4_propuestas_base antes';
  END IF;
  IF to_regclass('public.catalogo_materiales') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261006100001_sii_b1_catalogos_base antes';
  END IF;
  IF to_regclass('public.archivos') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261005100003_sii_b1_archivos antes';
  END IF;
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Contador periódico: el tipo `O` (una letra) es válido en B5
--    (el generador construye `O-MMYY_XX`; el CHECK de B3 exigía 2..6 letras)
-- -----------------------------------------------------------------------------
ALTER TABLE public.contadores_folio_periodico
  DROP CONSTRAINT IF EXISTS contadores_folio_periodico_tipo_valido;
ALTER TABLE public.contadores_folio_periodico
  ADD CONSTRAINT contadores_folio_periodico_tipo_valido CHECK (tipo ~ '^[A-Z]{1,6}$');

-- -----------------------------------------------------------------------------
-- 2. Columnas SII de la orden
-- -----------------------------------------------------------------------------
ALTER TABLE public.ordenes_produccion
  ADD COLUMN IF NOT EXISTS propuesta_id uuid REFERENCES public.propuestas (id),
  ADD COLUMN IF NOT EXISTS propuesta_revision_id uuid REFERENCES public.propuesta_revisiones (id),
  ADD COLUMN IF NOT EXISTS rfq_id uuid REFERENCES public.pipeline (id),
  ADD COLUMN IF NOT EXISTS folio_sii text,
  ADD COLUMN IF NOT EXISTS estado_sii text NOT NULL DEFAULT 'CONFIRMADA',
  ADD COLUMN IF NOT EXISTS snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cerrada_admin_en timestamptz,
  ADD COLUMN IF NOT EXISTS cerrada_admin_por uuid REFERENCES public.usuarios (id);

COMMENT ON COLUMN public.ordenes_produccion.estado_sii IS
  'SII-B5.3: estado de la orden (ADR-SII-07); se deriva del avance, nunca se cambia a mano. El legacy `estado` se sincroniza por trigger.';
COMMENT ON COLUMN public.ordenes_produccion.folio_sii IS
  'SII-B5.2: O-MMYY_XX (comercial) u OI-MMYY_XX (interna); los históricos OP-###### lo conservan NULL.';
COMMENT ON COLUMN public.ordenes_produccion.snapshot_json IS
  'SII-B5.1/5.4: copia congelada de cabecera, ítems, ruteo, archivos vivos y observaciones al aceptar la revisión.';
COMMENT ON COLUMN public.ordenes_produccion.propuesta_revision_id IS
  'ADR-SII-03: revisión exacta aceptada que originó la orden (única por orden).';

-- El folio legacy admite ahora los formatos SII nuevos; los OP- históricos siguen válidos.
ALTER TABLE public.ordenes_produccion DROP CONSTRAINT IF EXISTS ordenes_produccion_folio_formato_valido;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_folio_formato_valido
  CHECK (folio ~ '^OP-[0-9]{6}$' OR folio ~ '^O(I)?-[0-9]{4}_[0-9]{2,3}$');

ALTER TABLE public.ordenes_produccion DROP CONSTRAINT IF EXISTS ordenes_produccion_estado_sii_valido;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_estado_sii_valido CHECK (estado_sii IN (
    'CONFIRMADA','PLANIFICADA','LISTA','EN_PRODUCCION',
    'PRODUCCION_COMPLETADA','CERRADA','CANCELADA'));

ALTER TABLE public.ordenes_produccion DROP CONSTRAINT IF EXISTS ordenes_produccion_folio_sii_formato;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_folio_sii_formato
  CHECK (folio_sii IS NULL OR folio_sii ~ '^O(I)?-[0-9]{4}_[0-9]{2,3}$');

ALTER TABLE public.ordenes_produccion DROP CONSTRAINT IF EXISTS ordenes_produccion_snapshot_objeto;
ALTER TABLE public.ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_snapshot_objeto
  CHECK (jsonb_typeof(snapshot_json) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_folio_sii
  ON public.ordenes_produccion (folio_sii);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ordenes_revision_unica
  ON public.ordenes_produccion (propuesta_revision_id)
  WHERE propuesta_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ordenes_propuesta ON public.ordenes_produccion (propuesta_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_rfq ON public.ordenes_produccion (rfq_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_estado_sii ON public.ordenes_produccion (estado_sii);

-- -----------------------------------------------------------------------------
-- 2. Columnas SII de partidas
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS codigo_item text,
  ADD COLUMN IF NOT EXISTS propuesta_item_id uuid REFERENCES public.propuesta_items (id);

COMMENT ON COLUMN public.partidas_orden_produccion.codigo_item IS
  'SII-B5.1: ITxx estable RFQ→propuesta→orden; los históricos lo conservan NULL.';
COMMENT ON COLUMN public.partidas_orden_produccion.propuesta_item_id IS
  'SII-B5.1: ítem exacto de la revisión aceptada que originó la partida.';

ALTER TABLE public.partidas_orden_produccion DROP CONSTRAINT IF EXISTS partidas_orden_codigo_item_valido;
ALTER TABLE public.partidas_orden_produccion
  ADD CONSTRAINT partidas_orden_codigo_item_valido
  CHECK (codigo_item IS NULL OR codigo_item ~ '^IT[0-9]{2,}$');

CREATE INDEX IF NOT EXISTS ix_partidas_orden_codigo_item
  ON public.partidas_orden_produccion (orden_id, codigo_item);

-- -----------------------------------------------------------------------------
-- 3. Eventos de cambio de orden (trazabilidad post-aceptación, §5.4)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orden_eventos_cambio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  actor_id uuid REFERENCES public.usuarios (id),
  correlation_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orden_eventos_cambio_tipo_valido CHECK (char_length(btrim(tipo)) BETWEEN 2 AND 60),
  CONSTRAINT orden_eventos_cambio_motivo_valido
    CHECK (motivo IS NULL OR char_length(btrim(motivo)) <= 500),
  CONSTRAINT orden_eventos_cambio_detalle_objeto CHECK (jsonb_typeof(detalle) = 'object')
);

COMMENT ON TABLE public.orden_eventos_cambio IS
  'SII-B5.4: bitácora de la orden (creación, liberación, ajustes, cierre administrativo) con motivo, actor y correlationId.';

CREATE INDEX IF NOT EXISTS ix_orden_eventos_cambio_orden
  ON public.orden_eventos_cambio (orden_id, creado_en DESC);

ALTER TABLE public.orden_eventos_cambio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orden_eventos_cambio_seleccionar ON public.orden_eventos_cambio;
CREATE POLICY orden_eventos_cambio_seleccionar
  ON public.orden_eventos_cambio FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.orden_eventos_cambio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orden_eventos_cambio TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.orden_eventos_cambio TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Puente temporal estado_sii ↔ estado legacy (se retira en la ola 2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.sincronizar_estado_orden_sii()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado_sii IS DISTINCT FROM OLD.estado_sii THEN
    NEW.estado := CASE NEW.estado_sii
      WHEN 'CONFIRMADA' THEN 'borrador'
      WHEN 'PLANIFICADA' THEN 'programada'
      WHEN 'LISTA' THEN 'programada'
      WHEN 'EN_PRODUCCION' THEN 'en_proceso'
      WHEN 'PRODUCCION_COMPLETADA' THEN 'completada'
      WHEN 'CERRADA' THEN 'completada'
      WHEN 'CANCELADA' THEN 'cancelada'
      ELSE NEW.estado
    END;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.estado_sii := CASE NEW.estado
      WHEN 'borrador' THEN 'CONFIRMADA'
      WHEN 'programada' THEN 'PLANIFICADA'
      WHEN 'en_proceso' THEN 'EN_PRODUCCION'
      WHEN 'pausada' THEN 'EN_PRODUCCION'
      WHEN 'completada' THEN 'PRODUCCION_COMPLETADA'
      WHEN 'cancelada' THEN 'CANCELADA'
      ELSE NEW.estado_sii
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.sincronizar_estado_orden_sii() IS
  'SII-B5.3 (puente temporal): mantiene `estado` legacy y `estado_sii` coherentes en ambos sentidos; se retira en la ola 2.';

REVOKE ALL ON FUNCTION privado.sincronizar_estado_orden_sii() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_ordenes_sincronizar_estado_sii ON public.ordenes_produccion;
CREATE TRIGGER trigger_ordenes_sincronizar_estado_sii
  BEFORE UPDATE OF estado, estado_sii ON public.ordenes_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.sincronizar_estado_orden_sii();

-- -----------------------------------------------------------------------------
-- 5. Backfill de estado_sii (grandfathering: históricos sin folio_sii)
-- -----------------------------------------------------------------------------
UPDATE public.ordenes_produccion
SET estado_sii = CASE estado
  WHEN 'borrador' THEN 'CONFIRMADA'
  WHEN 'programada' THEN 'PLANIFICADA'
  WHEN 'en_proceso' THEN 'EN_PRODUCCION'
  WHEN 'pausada' THEN 'EN_PRODUCCION'
  WHEN 'completada' THEN 'PRODUCCION_COMPLETADA'
  WHEN 'cancelada' THEN 'CANCELADA'
  ELSE 'CONFIRMADA'
END
WHERE estado_sii IS NULL
   OR estado_sii IS DISTINCT FROM CASE estado
        WHEN 'borrador' THEN 'CONFIRMADA'
        WHEN 'programada' THEN 'PLANIFICADA'
        WHEN 'en_proceso' THEN 'EN_PRODUCCION'
        WHEN 'pausada' THEN 'EN_PRODUCCION'
        WHEN 'completada' THEN 'PRODUCCION_COMPLETADA'
        WHEN 'cancelada' THEN 'CANCELADA'
        ELSE 'CONFIRMADA'
      END;

-- -----------------------------------------------------------------------------
-- 6. RPC: crear orden desde la revisión aceptada (ADR-SII-03)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_desde_revision(
  p_revision_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, folio text, folio_sii text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_propuesta public.propuestas%ROWTYPE;
  v_rfq public.pipeline%ROWTYPE;
  v_cliente public.clientes%ROWTYPE;
  v_existente public.ordenes_produccion%ROWTYPE;
  v_es_interna boolean;
  v_actor_admin boolean;
  v_folio text;
  v_orden_id uuid := gen_random_uuid();
  v_fecha_compromiso timestamptz;
  v_prioridad text;
  v_totales jsonb;
  v_moneda text;
  v_tipo_cambio numeric(10,4) := 1;
  v_credito_nuevo numeric(18,4);
  v_credito_utilizado numeric(18,4);
  v_item record;
  v_item_snapshot jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_archivos_snapshot jsonb;
  v_archivos_item jsonb;
  v_operaciones jsonb;
  v_ruteo jsonb;
  v_procesos text[];
  v_area_codigo text;
  v_tiempo_estimado numeric;
  v_partidas integer := 0;
  v_snapshot jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_liberar') THEN
    RAISE EXCEPTION 'sin_permiso_orden' USING ERRCODE = '42501';
  END IF;

  -- Locks deterministas: pipeline → propuesta → revisión → cliente.
  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_propuesta
  FROM public.propuestas AS p
  WHERE p.id = v_revision.propuesta_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'propuesta_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rfq
  FROM public.pipeline AS r
  WHERE r.id = v_propuesta.rfq_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Idempotencia bajo lock de la revisión.
  SELECT * INTO v_existente
  FROM public.ordenes_produccion AS o
  WHERE o.propuesta_revision_id = p_revision_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existente.id, v_existente.folio, v_existente.folio_sii, true;
    RETURN;
  END IF;

  IF v_revision.estado NOT IN ('ACCEPTED', 'SALE_CONFIRMED') THEN
    RAISE EXCEPTION 'revision_no_aceptada' USING ERRCODE = '23514', DETAIL = v_revision.estado;
  END IF;
  IF v_propuesta.accepted_revision_id IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'revision_no_aceptada' USING ERRCODE = '23514', DETAIL = 'no_vigente';
  END IF;

  SELECT * INTO v_cliente
  FROM public.clientes AS c
  WHERE c.id = v_propuesta.cliente_id
  FOR UPDATE;
  IF NOT FOUND OR v_cliente.estado IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = '23514';
  END IF;

  v_es_interna := coalesce(v_rfq.es_orden_interna, false);
  SELECT (u.rol = 'admin' AND u.activo IS TRUE) INTO v_actor_admin
  FROM public.usuarios AS u WHERE u.id = p_actor_id;

  v_totales := public.calcular_totales_revision(p_revision_id);
  v_moneda := coalesce(v_totales ->> 'moneda', 'MXN');

  -- Gate de crédito vigente (A13/A14): el sobregiro solo lo autoriza un admin.
  IF NOT v_es_interna THEN
    IF v_moneda = 'USD' THEN
      SELECT config.tipo_cambio_usd INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config LIMIT 1;
      IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
        RAISE EXCEPTION 'tipo_cambio_usd_requerido' USING ERRCODE = '23514';
      END IF;
    END IF;

    v_credito_nuevo := round(
      (v_totales ->> 'subtotal')::numeric * CASE WHEN v_moneda = 'USD' THEN v_tipo_cambio ELSE 1 END,
      2
    );
    IF coalesce(v_cliente.limite_credito, 0) > 0 THEN
      SELECT coalesce(round(sum(
        cuenta.saldo_pendiente
          * CASE WHEN cuenta.moneda = 'USD' THEN cuenta.tipo_cambio_origen ELSE 1 END
      ), 2), 0)
      INTO v_credito_utilizado
      FROM public.cuentas_por_cobrar AS cuenta
      WHERE cuenta.cliente_id = v_cliente.id
        AND cuenta.estado IN ('pendiente', 'parcial');

      IF v_credito_utilizado + v_credito_nuevo > v_cliente.limite_credito
         AND NOT coalesce(v_actor_admin, false) THEN
        RAISE EXCEPTION 'credito_limite_excedido' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  v_fecha_compromiso := coalesce(v_rfq.fecha_requerida, now());
  v_prioridad := CASE
    WHEN v_rfq.prioridad IN ('baja', 'normal', 'alta', 'urgente') THEN v_rfq.prioridad
    ELSE 'normal'
  END;
  v_folio := public.generar_folio_periodico(CASE WHEN v_es_interna THEN 'OI' ELSE 'O' END);

  -- Archivos vivos de la revisión/propuesta/RFQ (no se copian blobs; se
  -- congelan los ids para que la orden no dependa de datos futuros).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'archivo_id', a.id,
    'entidad', a.entidad,
    'clase', a.clase,
    'tema_codigo', a.tema_codigo,
    'nombre_original', a.nombre_original,
    'nombre_erp', a.nombre_erp,
    'mime', a.mime
  ) ORDER BY a.creado_en, a.id), '[]'::jsonb)
  INTO v_archivos_snapshot
  FROM public.archivos AS a
  WHERE a.vigente
    AND (
      (a.entidad = 'propuesta_revision' AND a.entidad_id = p_revision_id)
      OR (a.entidad = 'propuesta' AND a.entidad_id = v_propuesta.id)
      OR (a.entidad = 'rfq' AND a.entidad_id = v_rfq.id)
      OR (
        a.entidad = 'rfq_item'
        AND a.entidad_id IN (
          SELECT i.rfq_item_id
          FROM public.propuesta_items AS i
          WHERE i.revision_id = p_revision_id AND i.rfq_item_id IS NOT NULL
        )
      )
    );

  -- La orden nace primero (las partidas la referencian); el snapshot se
  -- completa al final del bucle de ítems.
  INSERT INTO public.ordenes_produccion (
    id, folio, folio_sii, cliente_id, cotizacion_id, estado, estado_sii,
    prioridad, fecha_compromiso, es_interna, propuesta_id,
    propuesta_revision_id, rfq_id, snapshot_json
  ) VALUES (
    v_orden_id, v_folio, v_folio, v_cliente.id, v_rfq.id, 'borrador', 'CONFIRMADA',
    v_prioridad, v_fecha_compromiso, v_es_interna, v_propuesta.id,
    p_revision_id, v_rfq.id, '{}'::jsonb
  );

  FOR v_item IN
    SELECT
      i.*,
      material.nombre AS material_nombre,
      espesor.etiqueta AS espesor_etiqueta
    FROM public.propuesta_items AS i
    LEFT JOIN public.catalogo_materiales AS material ON material.id = i.material_id
    LEFT JOIN public.catalogo_espesores AS espesor ON espesor.id = i.espesor_id
    WHERE i.revision_id = p_revision_id
    ORDER BY i.codigo, i.creado_en, i.id
  LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'proceso_id', proceso.id,
      'codigo', proceso.codigo,
      'nombre', proceso.nombre,
      'orden', operacion.orden
    ) ORDER BY operacion.orden, proceso.codigo), '[]'::jsonb)
    INTO v_operaciones
    FROM public.propuesta_item_operaciones AS operacion
    JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
    WHERE operacion.item_id = v_item.id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'secuencia', ruteo.secuencia,
      'proceso_id', proceso.id,
      'proceso_codigo', proceso.codigo,
      'proceso_nombre', proceso.nombre,
      'grupo_equipo_id', ruteo.grupo_equipo_id,
      'grupo_planeado_id', ruteo.grupo_planeado_id,
      'setup_horas', ruteo.setup_horas,
      'run_horas', ruteo.run_horas,
      'total_horas', ruteo.total_horas,
      'requiere_revision', ruteo.requiere_revision
    ) ORDER BY ruteo.secuencia), '[]'::jsonb)
    INTO v_ruteo
    FROM public.propuesta_item_ruteo AS ruteo
    LEFT JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE ruteo.item_id = v_item.id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'archivo_id', a.id,
      'clase', a.clase,
      'tema_codigo', a.tema_codigo,
      'nombre_original', a.nombre_original,
      'nombre_erp', a.nombre_erp,
      'mime', a.mime
    ) ORDER BY a.creado_en, a.id), '[]'::jsonb)
    INTO v_archivos_item
    FROM public.archivos AS a
    WHERE a.vigente AND a.entidad = 'propuesta_item' AND a.entidad_id = v_item.id;

    v_item_snapshot := jsonb_build_object(
      'item_id', v_item.id,
      'codigo', v_item.codigo,
      'descripcion', v_item.descripcion,
      'cantidad', v_item.cantidad,
      'precio_unitario', v_item.precio_unitario,
      'es_descuento', v_item.es_descuento,
      'material_id', v_item.material_id,
      'material', v_item.material_nombre,
      'espesor_id', v_item.espesor_id,
      'espesor', v_item.espesor_etiqueta,
      'acabado', v_item.acabado,
      'notas', v_item.notas,
      'operaciones', v_operaciones,
      'ruteo', v_ruteo,
      'archivos', v_archivos_item
    );
    v_items_snapshot := v_items_snapshot || jsonb_build_array(v_item_snapshot);

    IF v_item.es_descuento OR NOT v_item.activo THEN
      CONTINUE;
    END IF;

    -- Partida fabricable: procesos/ruteo y área del primer proceso.
    SELECT array_agg(nombre_orden.etiqueta ORDER BY nombre_orden.secuencia, nombre_orden.etiqueta)
    INTO v_procesos
    FROM (
      SELECT left(proceso.nombre, 60) AS etiqueta, ruteo.secuencia
      FROM public.propuesta_item_ruteo AS ruteo
      JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
      WHERE ruteo.item_id = v_item.id
      UNION ALL
      SELECT left(proceso.nombre, 60), 1000 + operacion.orden
      FROM public.propuesta_item_operaciones AS operacion
      JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
      WHERE operacion.item_id = v_item.id
        AND NOT EXISTS (
          SELECT 1 FROM public.propuesta_item_ruteo AS r WHERE r.item_id = v_item.id
        )
    ) AS nombre_orden;

    SELECT coalesce(sum(ruteo.total_horas), 0) * 60
    INTO v_tiempo_estimado
    FROM public.propuesta_item_ruteo AS ruteo
    WHERE ruteo.item_id = v_item.id;

    SELECT proceso.area_trabajo_codigo INTO v_area_codigo
    FROM public.propuesta_item_ruteo AS ruteo
    JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE ruteo.item_id = v_item.id
    ORDER BY ruteo.secuencia
    LIMIT 1;

    INSERT INTO public.partidas_orden_produccion (
      orden_id, codigo_pieza, codigo_item, propuesta_item_id, descripcion,
      cantidad_solicitada, unidad_medida, material_id, tiempo_estimado_minutos,
      area_trabajo_codigo, procesos, es_externo
    ) VALUES (
      v_orden_id,
      v_item.codigo,
      v_item.codigo,
      v_item.id,
      v_item.descripcion,
      v_item.cantidad,
      'unidad',
      NULL,
      coalesce(v_tiempo_estimado, 0),
      v_area_codigo,
      coalesce(v_procesos, '{}'::text[]),
      false
    );
    v_partidas := v_partidas + 1;
  END LOOP;

  IF v_partidas = 0 THEN
    RAISE EXCEPTION 'propuesta_sin_items_fabricables' USING ERRCODE = '23514';
  END IF;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'orden_id', v_orden_id,
    'creado_en', now(),
    'origen', jsonb_build_object(
      'rfq_id', v_rfq.id,
      'rfq_folio', v_rfq.folio_rfq,
      'propuesta_id', v_propuesta.id,
      'propuesta_folio', v_propuesta.folio_cnc,
      'revision_id', p_revision_id,
      'revision_folio', v_revision.folio_revision,
      'letra', v_revision.letra
    ),
    'cabecera', v_revision.snapshot_cabecera,
    'fecha_compromiso', v_fecha_compromiso,
    'prioridad', v_prioridad,
    'es_interna', v_es_interna,
    'totales', jsonb_build_object(
      'subtotal', (v_totales ->> 'subtotal')::numeric,
      'descuento', (v_totales ->> 'descuento')::numeric,
      'iva', (v_totales ->> 'iva')::numeric,
      'total', (v_totales ->> 'total')::numeric,
      'iva_porcentaje', (v_totales ->> 'ivaPorcentaje')::numeric,
      'moneda', v_moneda,
      'tipo_cambio', CASE WHEN v_moneda = 'USD' THEN v_tipo_cambio ELSE 1 END
    ),
    'items', v_items_snapshot,
    'archivos', v_archivos_snapshot,
    'observaciones', nullif(btrim(coalesce(v_rfq.notas, '')), '')
  );

  UPDATE public.ordenes_produccion
  SET snapshot_json = v_snapshot
  WHERE ordenes_produccion.id = v_orden_id;

  -- D-04: la AR nace no cobrable; se activa al entregar el 100 % (OBS-21).
  IF NOT v_es_interna THEN
    IF (v_totales ->> 'total')::numeric > 0
       AND (v_totales ->> 'total')::numeric <= 99999999.9999 THEN
      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, monto_subtotal, monto_iva,
        saldo_pendiente, moneda, tipo_cambio_origen, estado,
        fecha_vencimiento, cobrable_desde
      ) VALUES (
        v_orden_id, v_cliente.id,
        round((v_totales ->> 'total')::numeric, 4),
        round((v_totales ->> 'subtotal')::numeric, 4),
        round((v_totales ->> 'iva')::numeric, 4),
        round((v_totales ->> 'total')::numeric, 4),
        CASE WHEN v_moneda = 'USD' THEN 'USD' ELSE 'MXN' END,
        CASE WHEN v_moneda = 'USD' THEN round(v_tipo_cambio, 4) ELSE 1 END,
        'pendiente', NULL, NULL
      );
    END IF;
  END IF;

  -- La orden confirma la venta: la revisión pasa a SALE_CONFIRMED si no lo estaba.
  IF v_revision.estado = 'ACCEPTED' THEN
    PERFORM set_config('sii.b4_rpc', 'on', true);
    UPDATE public.propuesta_revisiones
    SET estado = 'SALE_CONFIRMED', actualizado_en = now()
    WHERE propuesta_revisiones.id = p_revision_id;
    UPDATE public.propuestas
    SET estado = 'SALE_CONFIRMED', revision_vigente_id = p_revision_id
    WHERE propuestas.id = v_propuesta.id;
    INSERT INTO public.propuesta_revision_eventos (
      revision_id, estado_anterior, estado_nuevo, accion, actor_id, correlation_id
    ) VALUES (
      p_revision_id, 'ACCEPTED', 'SALE_CONFIRMED', 'confirmar_venta_desde_orden',
      p_actor_id, p_correlation_id
    );
  END IF;

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_orden_id,
    'orden_creada',
    jsonb_build_object(
      'origen', 'revision_aceptada',
      'propuesta_revision_id', p_revision_id,
      'folio_sii', v_folio,
      'partidas', v_partidas,
      'es_interna', v_es_interna
    ),
    NULL, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_orden_id, v_folio, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid) IS
  'SII-B5.1/ADR-SII-03: orden idempotente desde la revisión aceptada, con snapshot congelado, folio O-/OI- y AR no cobrable. Fecha compromiso = fecha_requerida del RFQ (ajustable pre-producción). Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_desde_revision(uuid, uuid, uuid)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 7. RPC: orden interna (TI) de alta directa autorizada (§5.5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_interna(
  p_datos jsonb,
  p_autorizacion jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, folio text, folio_sii text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cliente public.clientes%ROWTYPE;
  v_orden_id uuid := gen_random_uuid();
  v_folio text;
  v_fecha_compromiso timestamptz;
  v_prioridad text;
  v_descripcion text;
  v_motivo text;
  v_autorizado_por uuid;
  v_items jsonb;
  v_items_snapshot jsonb;
  v_partidas integer;
  v_snapshot jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'orden_crear_interna') THEN
    RAISE EXCEPTION 'sin_permiso_orden_interna' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'orden_interna_datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_autorizacion IS NULL OR jsonb_typeof(p_autorizacion) <> 'object' THEN
    RAISE EXCEPTION 'autorizacion_requerida' USING ERRCODE = '22023';
  END IF;

  v_motivo := nullif(btrim(coalesce(privado.json_texto(p_autorizacion, 'motivo'), '')), '');
  IF v_motivo IS NULL OR char_length(v_motivo) < 3 OR char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'motivo_autorizacion_requerido' USING ERRCODE = '22023';
  END IF;

  v_autorizado_por := p_actor_id;
  IF p_autorizacion ? 'autorizado_por' AND jsonb_typeof(p_autorizacion -> 'autorizado_por') = 'string' THEN
    v_autorizado_por := nullif(btrim(privado.json_texto(p_autorizacion, 'autorizado_por')), '')::uuid;
  END IF;
  IF v_autorizado_por IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios AS u
    WHERE u.id = v_autorizado_por AND u.activo AND u.rol IN ('admin', 'gerente')
  ) THEN
    RAISE EXCEPTION 'autorizador_invalido' USING ERRCODE = '22023';
  END IF;

  v_fecha_compromiso := NULLIF(btrim(coalesce(privado.json_texto(p_datos, 'fecha_compromiso'), '')), '')::timestamptz;
  IF v_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = '23514';
  END IF;

  v_prioridad := coalesce(nullif(btrim(coalesce(privado.json_texto(p_datos, 'prioridad'), '')), ''), 'normal');
  IF v_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = '23514';
  END IF;

  v_descripcion := nullif(btrim(coalesce(privado.json_texto(p_datos, 'descripcion'), '')), '');

  IF p_datos ? 'cliente_id' THEN
    SELECT * INTO v_cliente FROM public.clientes AS c
    WHERE c.id = (privado.json_texto(p_datos, 'cliente_id'))::uuid
    FOR UPDATE;
  END IF;
  IF NOT FOUND OR v_cliente.estado IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'cliente_no_activo' USING ERRCODE = '23514';
  END IF;

  v_items := p_datos -> 'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'items_requeridos' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS elemento(item)
    WHERE jsonb_typeof(elemento.item) <> 'object'
  ) THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_items) AS item(
      codigo_item text, descripcion text, cantidad numeric,
      material text, espesor text, procesos text[], tiempo_estimado_minutos numeric
    )
    WHERE nullif(btrim(coalesce(item.descripcion, '')), '') IS NULL
       OR char_length(btrim(item.descripcion)) > 300
       OR item.cantidad IS NULL OR item.cantidad <= 0
       OR char_length(btrim(coalesce(item.codigo_item, ''))) > 20
       OR char_length(btrim(coalesce(item.material, ''))) > 120
       OR char_length(btrim(coalesce(item.espesor, ''))) > 120
       OR coalesce(item.tiempo_estimado_minutos, 0) < 0
       OR coalesce(array_length(item.procesos, 1), 0) > 20
  ) THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '23514';
  END IF;

  v_folio := public.generar_folio_periodico('OI');

  -- Snapshot propio de la TI (sin precios ni revisión comercial).
  SELECT jsonb_agg(jsonb_build_object(
    'codigo_item', coalesce(nullif(btrim(item.codigo_item), ''), 'IT' || lpad((fila.orden)::text, 2, '0')),
    'descripcion', btrim(item.descripcion),
    'cantidad', item.cantidad,
    'material', nullif(btrim(coalesce(item.material, '')), ''),
    'espesor', nullif(btrim(coalesce(item.espesor, '')), ''),
    'procesos', coalesce(item.procesos, '{}'::text[]),
    'tiempo_estimado_minutos', coalesce(item.tiempo_estimado_minutos, 0)
  ) ORDER BY fila.orden)
  INTO v_items_snapshot
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS fila(valor, orden)
  CROSS JOIN LATERAL jsonb_to_record(fila.valor) AS item(
    codigo_item text, descripcion text, cantidad numeric,
    material text, espesor text, procesos text[], tiempo_estimado_minutos numeric
  );

  v_snapshot := jsonb_build_object(
    'version', 1,
    'orden_id', v_orden_id,
    'creado_en', now(),
    'origen', jsonb_build_object('tipo', 'ORDEN_INTERNA', 'rfq_id', NULL, 'propuesta_id', NULL),
    'cabecera', jsonb_build_object(
      'cliente_id', v_cliente.id,
      'cliente', jsonb_build_object(
        'razon_social', v_cliente.razon_social,
        'nombre_comercial', v_cliente.nombre_comercial
      ),
      'descripcion', v_descripcion
    ),
    'fecha_compromiso', v_fecha_compromiso,
    'prioridad', v_prioridad,
    'es_interna', true,
    'items', coalesce(v_items_snapshot, '[]'::jsonb),
    'archivos', '[]'::jsonb,
    'autorizacion', jsonb_build_object(
      'autorizado_por', v_autorizado_por,
      'motivo', v_motivo,
      'correlation_id', p_correlation_id
    ),
    'observaciones', nullif(btrim(coalesce(privado.json_texto(p_datos, 'notas'), '')), '')
  );

  INSERT INTO public.ordenes_produccion (
    id, folio, folio_sii, cliente_id, cotizacion_id, estado, estado_sii,
    prioridad, fecha_compromiso, es_interna, snapshot_json
  ) VALUES (
    v_orden_id, v_folio, v_folio, v_cliente.id, NULL, 'borrador', 'CONFIRMADA',
    v_prioridad, v_fecha_compromiso, true, v_snapshot
  );

  SELECT count(*)::integer INTO v_partidas
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS fila(valor, orden)
  CROSS JOIN LATERAL jsonb_to_record(fila.valor) AS item(
    codigo_item text, descripcion text, cantidad numeric,
    material text, espesor text, procesos text[], tiempo_estimado_minutos numeric
  );

  INSERT INTO public.partidas_orden_produccion (
    orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada,
    unidad_medida, material_id, tiempo_estimado_minutos, procesos, es_externo
  )
  SELECT
    v_orden_id,
    coalesce(nullif(btrim(item.codigo_item), ''), 'IT' || lpad((fila.orden)::text, 2, '0')),
    coalesce(nullif(btrim(item.codigo_item), ''), 'IT' || lpad((fila.orden)::text, 2, '0')),
    btrim(item.descripcion),
    item.cantidad,
    'unidad',
    NULL,
    coalesce(item.tiempo_estimado_minutos, 0),
    coalesce(
      (SELECT array_agg(left(proceso, 60)) FROM unnest(coalesce(item.procesos, '{}'::text[])) AS proceso),
      '{}'::text[]
    ),
    false
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS fila(valor, orden)
  CROSS JOIN LATERAL jsonb_to_record(fila.valor) AS item(
    codigo_item text, descripcion text, cantidad numeric,
    material text, espesor text, procesos text[], tiempo_estimado_minutos numeric
  );

  INSERT INTO public.orden_eventos_cambio (
    orden_id, tipo, detalle, motivo, actor_id, correlation_id
  ) VALUES (
    v_orden_id,
    'orden_interna_creada',
    jsonb_build_object(
      'folio_sii', v_folio,
      'partidas', v_partidas,
      'autorizado_por', v_autorizado_por
    ),
    v_motivo, p_actor_id, p_correlation_id
  );

  RETURN QUERY SELECT v_orden_id, v_folio, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_interna(jsonb, jsonb, uuid, uuid) IS
  'SII-B5.5: alta directa de orden interna (OI-MMYY_XX) con autorización registrada; sin AR y con snapshot propio. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_orden_interna(jsonb, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_interna(jsonb, jsonb, uuid, uuid)
  TO service_role;
