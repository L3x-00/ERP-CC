-- =============================================================================
-- C3.1 — Ítems nuevos por revisión de Propuesta (DC-08)
--
-- * Cada fila conserva la revisión donde nació el ITxx, incluso al copiarse.
-- * Una revisión B..Z DRAFT puede agregar alcance sin modificar el RFQ.
-- * El código se asigna bajo lock de propuesta y nunca se reutiliza, aunque el
--   ítem quede inactivo en una revisión posterior.
-- * La baja de ítems continúa siendo lógica (`activo=false`) y las revisiones
--   previas permanecen congeladas/consultables.
--
-- Aditiva. Aplicar y verificar primero en Supabase local.
-- =============================================================================

-- Guarda explícita: evita aplicar parcialmente C3.1 sobre una base que no
-- terminó B4. La migración corre en una transacción, pero el mensaje de
-- dependencia resulta mucho más accionable que un fallo a mitad del ALTER.
DO $$
BEGIN
  IF to_regclass('public.propuesta_items') IS NULL
     OR to_regclass('public.propuesta_revisiones') IS NULL
     OR to_regclass('public.propuesta_revision_costos') IS NULL THEN
    RAISE EXCEPTION 'C3.1 requiere las tablas base de Propuestas B4';
  END IF;
  IF to_regprocedure('privado.actor_con_permiso(uuid,text)') IS NULL
     OR to_regprocedure('privado.json_texto(jsonb,text)') IS NULL
     OR to_regprocedure('privado.json_numero(jsonb,text)') IS NULL
     OR to_regprocedure('privado.json_uuid(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'C3.1 requiere helpers privados de Propuestas B4';
  END IF;
END;
$$;

ALTER TABLE public.propuesta_items
  ADD COLUMN IF NOT EXISTS revision_origen_id uuid;

-- Históricos: el origen es la primera revisión de la propuesta donde aparece
-- ese código estable. No se infiere por `rfq_item_id`, porque los ítems nuevos
-- de B+ no tienen vínculo con RFQ.
-- El bloque es atómico incluso si el archivo se ejecuta desde SQL Editor. Se
-- desactiva únicamente el trigger genérico de timestamp para que el backfill
-- no reescriba la fecha histórica/CAS de revisiones ya congeladas.
DO $$
BEGIN
  PERFORM set_config('sii.b4_rpc', 'on', true);
  EXECUTE 'ALTER TABLE public.propuesta_items DISABLE TRIGGER trigger_propuesta_items_actualizado_en';

  WITH origenes AS (
    SELECT DISTINCT ON (r.propuesta_id, i.codigo)
      r.propuesta_id,
      i.codigo,
      r.id AS revision_origen_id
    FROM public.propuesta_items AS i
    JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
    ORDER BY r.propuesta_id, i.codigo, r.letra, r.creado_en, r.id
  )
  UPDATE public.propuesta_items AS i
  SET revision_origen_id = o.revision_origen_id
  FROM public.propuesta_revisiones AS r, origenes AS o
  WHERE r.id = i.revision_id
    AND o.propuesta_id = r.propuesta_id
    AND o.codigo = i.codigo
    AND i.revision_origen_id IS NULL;

  EXECUTE 'ALTER TABLE public.propuesta_items ENABLE TRIGGER trigger_propuesta_items_actualizado_en';
EXCEPTION WHEN OTHERS THEN
  -- La excepción revierte el DO completo; la habilitación explícita deja clara
  -- la intención también para revisiones manuales del script.
  EXECUTE 'ALTER TABLE public.propuesta_items ENABLE TRIGGER trigger_propuesta_items_actualizado_en';
  RAISE;
END;
$$;

ALTER TABLE public.propuesta_items
  ALTER COLUMN revision_origen_id SET NOT NULL;

ALTER TABLE public.propuesta_items
  DROP CONSTRAINT IF EXISTS propuesta_items_revision_origen_fkey;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_revision_origen_fkey
  FOREIGN KEY (revision_origen_id)
  REFERENCES public.propuesta_revisiones (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS ix_propuesta_items_revision_origen
  ON public.propuesta_items (revision_origen_id);

COMMENT ON COLUMN public.propuesta_items.revision_origen_id IS
  'C3.1/DC-08: primera revisión de esta propuesta donde nació el código ITxx; se conserva en copias posteriores.';

-- Asigna el origen a rutas existentes (`crear_propuesta`, backfill y copia
-- profunda) sin reescribir sus firmas. También impide enlazar otra propuesta o
-- una revisión posterior, y vuelve el dato inmutable.
CREATE OR REPLACE FUNCTION privado.c3_asignar_revision_origen_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_origen public.propuesta_revisiones%ROWTYPE;
  v_origen_existente uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.revision_origen_id IS DISTINCT FROM OLD.revision_origen_id THEN
    RAISE EXCEPTION 'revision_origen_inmutable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = NEW.revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  IF NEW.revision_origen_id IS NULL THEN
    SELECT i.revision_origen_id INTO v_origen_existente
    FROM public.propuesta_items AS i
    JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
    WHERE r.propuesta_id = v_revision.propuesta_id
      AND i.codigo = NEW.codigo
    ORDER BY r.letra, r.creado_en, r.id, i.id
    LIMIT 1;
    NEW.revision_origen_id := COALESCE(v_origen_existente, NEW.revision_id);
  END IF;

  SELECT * INTO v_origen
  FROM public.propuesta_revisiones AS r
  WHERE r.id = NEW.revision_origen_id;
  IF NOT FOUND
     OR v_origen.propuesta_id <> v_revision.propuesta_id
     OR v_origen.letra > v_revision.letra THEN
    RAISE EXCEPTION 'revision_origen_invalida' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.c3_asignar_revision_origen_item()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_propuesta_items_revision_origen
  ON public.propuesta_items;
CREATE TRIGGER trigger_propuesta_items_revision_origen
  BEFORE INSERT OR UPDATE OF revision_id, codigo, revision_origen_id
  ON public.propuesta_items
  FOR EACH ROW
  EXECUTE FUNCTION privado.c3_asignar_revision_origen_item();

CREATE OR REPLACE FUNCTION public.agregar_item_propuesta(
  p_revision_id uuid,
  p_datos jsonb,
  p_actor uuid,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision public.propuesta_revisiones%ROWTYPE;
  v_item public.propuesta_items%ROWTYPE;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_material_id uuid;
  v_espesor_id uuid;
  v_acabado text;
  v_notas text;
  v_es_descuento boolean;
  v_numero integer;
  v_codigo text;
  v_material public.catalogo_materiales%ROWTYPE;
BEGIN
  IF p_actor IS NULL
     OR NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_articulo') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501';
  END IF;
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_datos ? 'precio_unitario'
     AND NOT privado.actor_con_permiso(p_actor, 'propuesta_editar_precio') THEN
    RAISE EXCEPTION 'sin_permiso_propuesta' USING ERRCODE = '42501', DETAIL = 'precio';
  END IF;

  -- Descubrir la propuesta y serializar el contador ITxx con un lock lógico.
  -- No se bloquea la fila `propuestas`: las RPC históricas bloquean primero la
  -- revisión y después actualizan propuesta, por lo que invertir ese orden aquí
  -- abriría una ventana de deadlock con Validar/Aceptar.
  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_revision.propuesta_id::text, 0));

  SELECT * INTO v_revision
  FROM public.propuesta_revisiones AS r
  WHERE r.id = p_revision_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_revision.estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_no_editable' USING ERRCODE = '23514',
      DETAIL = v_revision.estado;
  END IF;
  IF v_revision.letra = 'A' THEN
    RAISE EXCEPTION 'item_nuevo_solo_revision' USING ERRCODE = '23514';
  END IF;

  v_descripcion := btrim(COALESCE(privado.json_texto(p_datos, 'descripcion'), ''));
  IF char_length(v_descripcion) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'item_descripcion_invalida' USING ERRCODE = '22023';
  END IF;

  v_cantidad := privado.json_numero(p_datos, 'cantidad');
  IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad > 1000000000
     OR v_cantidad <> round(v_cantidad, 2) THEN
    RAISE EXCEPTION 'item_cantidad_invalida' USING ERRCODE = '22023';
  END IF;

  v_precio := COALESCE(privado.json_numero(p_datos, 'precio_unitario'), 0);
  IF v_precio < 0 OR v_precio > 1000000000 THEN
    RAISE EXCEPTION 'item_precio_invalido' USING ERRCODE = '22023';
  END IF;

  v_material_id := privado.json_uuid(p_datos, 'material_id');
  v_espesor_id := privado.json_uuid(p_datos, 'espesor_id');
  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_material
    FROM public.catalogo_materiales AS m
    WHERE m.id = v_material_id;
    IF NOT FOUND OR NOT v_material.activo THEN
      RAISE EXCEPTION 'material_invalido' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.material_id = v_material_id AND e.activo
    ) AND v_espesor_id IS NULL THEN
      RAISE EXCEPTION 'espesor_requerido' USING ERRCODE = '22023';
    END IF;
    IF v_espesor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.id = v_espesor_id
        AND e.material_id = v_material_id
        AND e.activo
    ) THEN
      RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_espesor_id IS NOT NULL THEN
    RAISE EXCEPTION 'espesor_sin_material' USING ERRCODE = '22023';
  END IF;

  v_acabado := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'acabado'), '')), '');
  IF v_acabado IS NOT NULL AND char_length(v_acabado) > 120 THEN
    RAISE EXCEPTION 'item_acabado_invalido' USING ERRCODE = '22023';
  END IF;
  v_notas := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'notas'), '')), '');
  IF v_notas IS NOT NULL AND char_length(v_notas) > 2000 THEN
    RAISE EXCEPTION 'item_notas_invalidas' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'es_descuento'
     AND jsonb_typeof(p_datos->'es_descuento') <> 'boolean' THEN
    RAISE EXCEPTION 'propuesta_datos_invalidos' USING ERRCODE = '22023',
      DETAIL = 'es_descuento';
  END IF;
  v_es_descuento := COALESCE((p_datos->>'es_descuento')::boolean, false);

  -- La propuesta está bloqueada: dos altas concurrentes observan códigos
  -- distintos y ningún ITxx inactivo se reutiliza.
  SELECT COALESCE(max((substring(i.codigo FROM 3))::integer), 0) + 1
  INTO v_numero
  FROM public.propuesta_items AS i
  JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
  WHERE r.propuesta_id = v_revision.propuesta_id;
  v_codigo := 'IT' || lpad(v_numero::text, 2, '0');

  PERFORM set_config('sii.b4_rpc', 'on', true);

  INSERT INTO public.propuesta_items (
    revision_id, revision_origen_id, rfq_item_id, codigo, descripcion,
    cantidad, material_id, espesor_id, acabado, notas, precio_unitario,
    es_descuento, activo
  ) VALUES (
    v_revision.id, v_revision.id, NULL, v_codigo, v_descripcion,
    v_cantidad, v_material_id, v_espesor_id, v_acabado, v_notas, v_precio,
    v_es_descuento, true
  )
  RETURNING * INTO v_item;

  UPDATE public.propuesta_revisiones AS revision
  SET requiere_revision_costeo = revision.requiere_revision_costeo OR EXISTS (
        SELECT 1
        FROM public.propuesta_revision_costos AS costo
        WHERE costo.revision_id = revision.id
      ),
      actualizado_en = now()
  WHERE revision.id = v_revision.id;

  INSERT INTO public.propuesta_revision_eventos (
    revision_id, estado_anterior, estado_nuevo, accion, motivo,
    actor_id, correlation_id
  ) VALUES (
    v_revision.id, 'DRAFT', 'DRAFT', 'agregar_item_propuesta',
    v_codigo || ': ' || v_descripcion, p_actor, p_correlation_id
  );

  RETURN to_jsonb(v_item);
END;
$$;

COMMENT ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid) IS
  'C3.1/DC-08: agrega un ítem a una revisión B..Z DRAFT; asigna ITxx estable bajo lock de propuesta y registra su revisión de origen sin modificar RFQ. Solo service_role.';

REVOKE ALL ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agregar_item_propuesta(uuid, jsonb, uuid, uuid)
  TO service_role;
