-- =============================================================================
-- SII-B3.1 — Modelo RFQ sobre `pipeline` (ADR-SII-01/09)
-- Plan: docs/plan-erp-sii/03-rfq.md §3.1 (modelo), §3.2 (estados), §3.3 (ítems)
-- Documento del cliente: §9 (estados, campos, ítems), §6.1 (folio RFQ/ITxx)
--
-- Entrega:
--   * columnas de cabecera RFQ en `pipeline` (+ folio `RFQ-MMYY_XX` en alta)
--   * tablas `rfq_items`, `rfq_item_operaciones`, `rfq_eventos` con RLS de
--     lectura equivalente a `pipeline` y escritura solo service_role
--   * puente de transición bidireccional `estado_rfq` ↔ `etapa` para no romper
--     consumidores actuales (dashboard/alertas); la ola 2 los migra y retira el puente
--   * backfill idempotente del histórico (`backfill_rfq_legacy()`)
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cabecera RFQ en `pipeline`
-- -----------------------------------------------------------------------------
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS folio_rfq text,
  ADD COLUMN IF NOT EXISTS estado_rfq text NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS fecha_solicitud date,
  ADD COLUMN IF NOT EXISTS contacto_id uuid REFERENCES public.contactos_cliente (id),
  ADD COLUMN IF NOT EXISTS descripcion_general text,
  ADD COLUMN IF NOT EXISTS responsable_id uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS proxima_accion_codigo text REFERENCES public.catalogo_proximas_acciones (codigo),
  ADD COLUMN IF NOT EXISTS proxima_accion_texto text,
  ADD COLUMN IF NOT EXISTS fecha_proxima_accion date,
  ADD COLUMN IF NOT EXISTS responsable_proxima_accion_id uuid REFERENCES public.usuarios (id);

ALTER TABLE public.pipeline DROP CONSTRAINT IF EXISTS pipeline_estado_rfq_check;
ALTER TABLE public.pipeline
  ADD CONSTRAINT pipeline_estado_rfq_check
  CHECK (estado_rfq IN ('NEW','INCOMPLETE','WAITING_CUSTOMER','WAITING_TECHNICAL',
                        'READY_FOR_PROPOSAL','CONVERTED','CLOSED','CANCELLED'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_pipeline_folio_rfq
  ON public.pipeline (folio_rfq);
CREATE INDEX IF NOT EXISTS ix_pipeline_estado_rfq
  ON public.pipeline (estado_rfq);

COMMENT ON COLUMN public.pipeline.folio_rfq IS
  'SII-B3.5: folio RFQ-MMYY_XX de documentos nuevos; los históricos conservan folio_op (la UI muestra folio_rfq ?? folio_op).';
COMMENT ON COLUMN public.pipeline.estado_rfq IS
  'SII-B3.2 (ADR-SII-07): estado del RFQ gobernado por acciones. `etapa` queda deprecada y se mantiene sincronizada por el puente de transición hasta la ola 2.';

-- -----------------------------------------------------------------------------
-- 2. Ítems ITxx (identidad estable, §3.3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.pipeline (id) ON DELETE CASCADE,
  numero integer NOT NULL,
  codigo text NOT NULL,
  descripcion text NOT NULL,
  cantidad numeric(12,2) NOT NULL,
  material_id uuid REFERENCES public.catalogo_materiales (id),
  espesor_id uuid REFERENCES public.catalogo_espesores (id),
  acabado text,
  notas text,
  estado text NOT NULL DEFAULT 'activo',
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_items_descripcion_valida CHECK (char_length(descripcion) BETWEEN 1 AND 300),
  CONSTRAINT rfq_items_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT rfq_items_estado_valido CHECK (estado IN ('activo','cancelado')),
  CONSTRAINT rfq_items_codigo_valido CHECK (codigo ~ '^IT[0-9]{2,}$'),
  CONSTRAINT rfq_items_numero_valido CHECK (numero BETWEEN 1 AND 99),
  CONSTRAINT rfq_items_rfq_numero_unico UNIQUE (rfq_id, numero),
  CONSTRAINT rfq_items_rfq_codigo_unico UNIQUE (rfq_id, codigo)
);

COMMENT ON TABLE public.rfq_items IS
  'SII-B3.3: ítems del RFQ con código ITxx estable e irrepetible por RFQ (cancelar no libera el número).';
COMMENT ON COLUMN public.rfq_items.codigo IS
  'IT01, IT02… asignado con lock del RFQ; viaja a propuesta (B4) y orden (B5) sin renumerar.';

CREATE INDEX IF NOT EXISTS ix_rfq_items_rfq ON public.rfq_items (rfq_id);

DROP TRIGGER IF EXISTS trigger_rfq_items_actualizado_en ON public.rfq_items;
CREATE TRIGGER trigger_rfq_items_actualizado_en
  BEFORE UPDATE ON public.rfq_items
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 3. Operaciones solicitadas por ítem (§3.3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_item_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_item_id uuid NOT NULL REFERENCES public.rfq_items (id) ON DELETE CASCADE,
  proceso_id uuid NOT NULL REFERENCES public.catalogo_procesos (id),
  orden integer NOT NULL DEFAULT 0,
  CONSTRAINT rfq_item_operaciones_orden_valido CHECK (orden >= 0),
  CONSTRAINT rfq_item_operaciones_item_proceso_unico UNIQUE (rfq_item_id, proceso_id)
);

COMMENT ON TABLE public.rfq_item_operaciones IS
  'SII-B3.3: operaciones solicitadas por ítem contra `catalogo_procesos` (reemplaza el text[] libre en registros nuevos).';

CREATE INDEX IF NOT EXISTS ix_rfq_item_operaciones_item
  ON public.rfq_item_operaciones (rfq_item_id);

-- -----------------------------------------------------------------------------
-- 4. Eventos de estado del RFQ (§3.2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.pipeline (id) ON DELETE CASCADE,
  estado_anterior text,
  estado_nuevo text,
  accion text NOT NULL,
  motivo text,
  actor_id uuid REFERENCES public.usuarios (id),
  correlation_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_eventos_estado_anterior_valido CHECK (
    estado_anterior IS NULL OR estado_anterior IN
      ('NEW','INCOMPLETE','WAITING_CUSTOMER','WAITING_TECHNICAL',
       'READY_FOR_PROPOSAL','CONVERTED','CLOSED','CANCELLED')),
  CONSTRAINT rfq_eventos_estado_nuevo_valido CHECK (
    estado_nuevo IS NULL OR estado_nuevo IN
      ('NEW','INCOMPLETE','WAITING_CUSTOMER','WAITING_TECHNICAL',
       'READY_FOR_PROPOSAL','CONVERTED','CLOSED','CANCELLED'))
);

COMMENT ON TABLE public.rfq_eventos IS
  'SII-B3.2: bitácora de cambios de estado del RFQ (acción, motivo, actor y correlationId).';

CREATE INDEX IF NOT EXISTS ix_rfq_eventos_rfq
  ON public.rfq_eventos (rfq_id, creado_en DESC);

-- -----------------------------------------------------------------------------
-- 5. RLS de lectura: mismo alcance que el RFQ padre (dueño/equipo/admin) y
--    exigencia de identidad activa (patrón A09). Escritura solo service_role
--    vía RPC; no se crean políticas de INSERT/UPDATE/DELETE.
-- -----------------------------------------------------------------------------
ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_item_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfq_items_seleccionar ON public.rfq_items;
CREATE POLICY rfq_items_seleccionar
  ON public.rfq_items FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS p
      WHERE p.id = rfq_items.rfq_id
        AND (
          p.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS rfq_item_operaciones_seleccionar ON public.rfq_item_operaciones;
CREATE POLICY rfq_item_operaciones_seleccionar
  ON public.rfq_item_operaciones FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1
      FROM public.rfq_items AS i
      JOIN public.pipeline AS p ON p.id = i.rfq_id
      WHERE i.id = rfq_item_operaciones.rfq_item_id
        AND (
          p.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS rfq_eventos_seleccionar ON public.rfq_eventos;
CREATE POLICY rfq_eventos_seleccionar
  ON public.rfq_eventos FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_activo())
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS p
      WHERE p.id = rfq_eventos.rfq_id
        AND (
          p.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

REVOKE ALL ON TABLE public.rfq_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rfq_item_operaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rfq_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.rfq_items TO authenticated;
GRANT SELECT ON TABLE public.rfq_item_operaciones TO authenticated;
GRANT SELECT ON TABLE public.rfq_eventos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.rfq_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rfq_item_operaciones TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rfq_eventos TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Realtime: la cola/ficha observan `rfq_items` (sin payload de negocio).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rfq_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rfq_items;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Alta con folio RFQ (mismo camino para acciones actuales y futuras)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.asignar_folio_rfq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.folio_rfq IS NULL THEN
    NEW.folio_rfq := public.generar_folio_periodico('RFQ');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.asignar_folio_rfq() IS
  'SII-B3.5: asigna RFQ-MMYY_XX en el alta cuando la fila no trae folio. Los históricos no se tocan.';

DROP TRIGGER IF EXISTS trigger_pipeline_asignar_folio_rfq ON public.pipeline;
CREATE TRIGGER trigger_pipeline_asignar_folio_rfq
  BEFORE INSERT ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION privado.asignar_folio_rfq();

-- -----------------------------------------------------------------------------
-- 8. Backfill idempotente del histórico (ADR-SII-09)
--    Solo toca filas sin `folio_rfq` (históricas): los registros creados a
--    partir de esta migración ya nacen con folio y quedan excluidos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_rfq_legacy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfqs integer := 0;
  v_items integer := 0;
  v_operaciones integer := 0;
  v_legacy integer := 0;
  v_rfq record;
  v_linea record;
  v_item_id uuid;
  v_num integer;
  v_usados integer[];
  v_proceso_id uuid;
  v_proc text;
  v_procesos uuid[];
  v_material_id uuid;
  v_espesor_id uuid;
  v_notas text[];
  v_legacy_procesos text[];
  v_filas integer;
BEGIN
  -- 8.1 Cabecera: estado desde `etapa`, fecha, responsable y descripción.
  UPDATE public.pipeline AS p
  SET estado_rfq = CASE p.etapa
        WHEN 'prospecto' THEN 'NEW'
        WHEN 'contactado' THEN 'INCOMPLETE'
        WHEN 'cotizado' THEN 'CONVERTED'
        WHEN 'negociacion' THEN 'CONVERTED'
        WHEN 'ganada' THEN 'CONVERTED'
        WHEN 'perdida' THEN 'CLOSED'
        ELSE 'INCOMPLETE'
      END,
      fecha_solicitud = COALESCE(p.fecha_solicitud, p.creado_en::date),
      responsable_id = COALESCE(p.responsable_id, p.vendedor_id),
      descripcion_general = COALESCE(
        NULLIF(btrim(p.descripcion_general), ''),
        NULLIF(btrim(p.notas), '')
      )
  WHERE p.folio_rfq IS NULL;
  GET DIAGNOSTICS v_rfqs = ROW_COUNT;

  -- 8.2 Ítems: un rfq_item por cotizacion_linea de RFQs históricos sin ítems.
  FOR v_rfq IN
    SELECT p.id
    FROM public.pipeline AS p
    WHERE p.folio_rfq IS NULL
      AND EXISTS (SELECT 1 FROM public.cotizacion_lineas AS l WHERE l.pipeline_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.rfq_items AS i WHERE i.rfq_id = p.id)
    ORDER BY p.creado_en, p.id
  LOOP
    v_usados := '{}';

    FOR v_linea IN
      SELECT l.*
      FROM public.cotizacion_lineas AS l
      WHERE l.pipeline_id = v_rfq.id
      ORDER BY l.orden, l.creado_en, l.id
    LOOP
      -- Número estable: se prefiere `orden` (1..99) si es único; si no, el
      -- primer consecutivo libre. Los números de líneas canceladas jamás se liberan.
      v_num := NULL;
      IF v_linea.orden BETWEEN 1 AND 99 AND NOT (v_linea.orden = ANY (v_usados)) THEN
        v_num := v_linea.orden;
      END IF;
      IF v_num IS NULL THEN
        SELECT g INTO v_num
        FROM generate_series(1, 99) AS g
        WHERE NOT (g = ANY (v_usados))
        ORDER BY g
        LIMIT 1;
      END IF;
      IF v_num IS NULL THEN
        RAISE EXCEPTION 'items_agotados' USING ERRCODE = '23514',
          DETAIL = 'RFQ ' || v_rfq.id::text || ' excede 99 ítems en el histórico';
      END IF;
      v_usados := array_append(v_usados, v_num);

      -- Material/espesor legacy → catálogo por código/nombre/etiqueta.
      v_material_id := NULL;
      v_espesor_id := NULL;
      v_notas := '{}';

      IF NULLIF(btrim(v_linea.material), '') IS NOT NULL THEN
        SELECT m.id INTO v_material_id
        FROM public.catalogo_materiales AS m
        WHERE lower(btrim(m.codigo)) = lower(btrim(v_linea.material))
           OR lower(btrim(m.nombre)) = lower(btrim(v_linea.material))
        ORDER BY (lower(btrim(m.codigo)) = lower(btrim(v_linea.material))) DESC, m.orden
        LIMIT 1;
        IF v_material_id IS NULL THEN
          v_notas := array_append(v_notas, 'material_legacy: ' || btrim(v_linea.material));
        END IF;
      END IF;

      IF NULLIF(btrim(v_linea.espesor), '') IS NOT NULL THEN
        SELECT e.id INTO v_espesor_id
        FROM public.catalogo_espesores AS e
        WHERE (v_material_id IS NULL OR e.material_id = v_material_id)
          AND lower(btrim(e.etiqueta)) = lower(btrim(v_linea.espesor))
        LIMIT 1;
        IF v_espesor_id IS NULL THEN
          v_notas := array_append(v_notas, 'espesor_legacy: ' || btrim(v_linea.espesor));
        END IF;
      END IF;

      -- Procesos legacy → catálogo; lo no mapeado queda como texto en notas.
      v_procesos := '{}';
      v_legacy_procesos := '{}';
      FOREACH v_proc IN ARRAY COALESCE(v_linea.procesos, '{}'::text[]) LOOP
        IF NULLIF(btrim(v_proc), '') IS NULL THEN
          CONTINUE;
        END IF;
        SELECT pr.id INTO v_proceso_id
        FROM public.catalogo_procesos AS pr
        WHERE lower(btrim(pr.codigo)) = lower(btrim(v_proc))
           OR lower(btrim(pr.nombre)) = lower(btrim(v_proc))
        ORDER BY (lower(btrim(pr.codigo)) = lower(btrim(v_proc))) DESC, pr.orden
        LIMIT 1;
        IF v_proceso_id IS NULL THEN
          v_legacy_procesos := array_append(v_legacy_procesos, btrim(v_proc));
        ELSE
          v_procesos := array_append(v_procesos, v_proceso_id);
        END IF;
      END LOOP;

      IF array_length(v_legacy_procesos, 1) > 0 THEN
        v_notas := array_append(v_notas, 'procesos_legacy: ' || v_legacy_procesos::text);
      END IF;

      INSERT INTO public.rfq_items (
        rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id, notas, estado
      ) VALUES (
        v_rfq.id,
        v_num,
        'IT' || lpad(v_num::text, 2, '0'),
        v_linea.descripcion,
        v_linea.cantidad,
        v_material_id,
        v_espesor_id,
        NULLIF(array_to_string(v_notas, '; '), ''),
        'activo'
      )
      RETURNING id INTO v_item_id;

      v_items := v_items + 1;

      INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
      SELECT v_item_id, x.proceso_id, (x.ord - 1)
      FROM unnest(v_procesos) WITH ORDINALITY AS x(proceso_id, ord)
      ON CONFLICT (rfq_item_id, proceso_id) DO NOTHING;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      v_operaciones := v_operaciones + v_filas;
      v_legacy := v_legacy + COALESCE(array_length(v_legacy_procesos, 1), 0);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'rfqs', v_rfqs,
    'items', v_items,
    'operaciones', v_operaciones,
    'procesos_legacy', COALESCE(v_legacy, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_rfq_legacy() IS
  'SII-B3.1: backfill idempotente del histórico a la cabecera RFQ y rfq_items. Solo service_role; no renumera ni pierde procesos legacy.';

REVOKE ALL ON FUNCTION public.backfill_rfq_legacy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_rfq_legacy() TO service_role;

-- Ejecución única dentro de la migración (la función queda para reejecución segura).
SELECT public.backfill_rfq_legacy();

-- -----------------------------------------------------------------------------
-- 9. Puente de transición `estado_rfq` ↔ `etapa` (se retira en la ola 2)
--    - Si cambia `estado_rfq` (RPC nueva), se deriva `etapa` para los
--      consumidores actuales.
--    - Si cambia `etapa` (acciones heredadas), se deriva `estado_rfq` para no
--      dejar doble verdad mientras la ola 2 migra los consumidores.
--    READY_FOR_PROPOSAL ↔ negociacion es la única correspondencia posible:
--    `cotizado` ya mapea al estado CONVERTED.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.sincronizar_etapa_rfq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.etapa IS DISTINCT FROM 'prospecto' AND NEW.estado_rfq = 'NEW' THEN
      NEW.estado_rfq := CASE NEW.etapa
        WHEN 'contactado' THEN 'INCOMPLETE'
        WHEN 'cotizado' THEN 'CONVERTED'
        WHEN 'negociacion' THEN 'CONVERTED'
        WHEN 'ganada' THEN 'CONVERTED'
        WHEN 'perdida' THEN 'CLOSED'
        ELSE NEW.estado_rfq
      END;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.etapa IS DISTINCT FROM OLD.etapa
     AND NEW.estado_rfq IS NOT DISTINCT FROM OLD.estado_rfq THEN
    NEW.estado_rfq := CASE NEW.etapa
      WHEN 'prospecto' THEN 'NEW'
      WHEN 'contactado' THEN 'INCOMPLETE'
      WHEN 'cotizado' THEN 'CONVERTED'
      WHEN 'negociacion' THEN 'CONVERTED'
      WHEN 'ganada' THEN 'CONVERTED'
      WHEN 'perdida' THEN 'CLOSED'
      ELSE NEW.estado_rfq
    END;
  ELSIF NEW.estado_rfq IS DISTINCT FROM OLD.estado_rfq THEN
    NEW.etapa := CASE NEW.estado_rfq
      WHEN 'NEW' THEN 'prospecto'
      WHEN 'INCOMPLETE' THEN 'contactado'
      WHEN 'WAITING_CUSTOMER' THEN 'contactado'
      WHEN 'WAITING_TECHNICAL' THEN 'contactado'
      WHEN 'READY_FOR_PROPOSAL' THEN 'negociacion'
      WHEN 'CONVERTED' THEN 'cotizado'
      WHEN 'CLOSED' THEN 'perdida'
      WHEN 'CANCELLED' THEN 'perdida'
      ELSE NEW.etapa
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.sincronizar_etapa_rfq() IS
  'SII-B3.1 (transitorio): mantiene `etapa` y `estado_rfq` coherentes durante la transición; la ola 2 migra consumidores y retira este puente.';

DROP TRIGGER IF EXISTS trigger_pipeline_sincronizar_etapa_rfq ON public.pipeline;
CREATE TRIGGER trigger_pipeline_sincronizar_etapa_rfq
  BEFORE INSERT OR UPDATE ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION privado.sincronizar_etapa_rfq();
