-- =============================================================================
-- SII-B3.2/3.3/3.6 — Acciones de RFQ: estados, ítems ITxx y validación LISTO
-- Plan: docs/plan-erp-sii/03-rfq.md §3.2 (estados), §3.3 (ítems), §3.6 (LISTO)
-- Documento del cliente: §9 (estados/campos/ítems), §6.1 (ITxx)
--
-- Entrega (todas SECURITY DEFINER, search_path='', solo service_role):
--   * validar_rfq_listo(rfq) → faltantes estructurados por sección
--   * cambiar_estado_rfq(rfq, acción, args, actor, correlation) con CAS,
--     permisos, transiciones válidas, motivo obligatorio y rfq_eventos
--   * crear_item_rfq / actualizar_item_rfq / cancelar_item_rfq
--   * reemplazar_operaciones_item
--
-- Lock order documentado: pipeline (RFQ) → rfq_items. Las funciones leen el
-- ítem sin lock para descubrir su RFQ, luego bloquean el RFQ y releen el ítem
-- `FOR UPDATE`, evitando ABBA con `crear_item_rfq` (que solo bloquea el RFQ).
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers privados (sin grants: los usan las RPC como owner)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.actor_con_permiso(p_actor_id uuid, p_permiso text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS u
    WHERE u.id = p_actor_id
      AND u.activo = true
      AND (
        u.rol = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.permisos_rol AS pr
          WHERE pr.rol = u.rol AND pr.permiso = p_permiso
        )
      )
  );
$$;

COMMENT ON FUNCTION privado.actor_con_permiso(uuid, text) IS
  'SII-B3: true si el actor está activo y tiene el permiso (admin siempre). Uso en RPC SECURITY DEFINER.';

CREATE OR REPLACE FUNCTION privado.json_texto(p_datos jsonb, p_clave text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := p_datos -> p_clave;
BEGIN
  IF v IS NULL OR v = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'string' THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
  END IF;
  RETURN v #>> '{}';
END;
$$;

COMMENT ON FUNCTION privado.json_texto(jsonb, text) IS
  'SII-B3: lee una clave string de un jsonb de entrada; null si ausente/null, error tipado si es de otro tipo.';

CREATE OR REPLACE FUNCTION privado.json_numero(p_datos jsonb, p_clave text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := p_datos -> p_clave;
BEGIN
  IF v IS NULL OR v = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'number' THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
  END IF;
  RETURN (v #>> '{}')::numeric;
END;
$$;

COMMENT ON FUNCTION privado.json_numero(jsonb, text) IS
  'SII-B3: lee una clave numérica de un jsonb de entrada; null si ausente/null, error tipado si es de otro tipo.';

CREATE OR REPLACE FUNCTION privado.json_uuid(p_datos jsonb, p_clave text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_texto text := privado.json_texto(p_datos, p_clave);
BEGIN
  IF v_texto IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_texto !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
  END IF;
  RETURN v_texto::uuid;
END;
$$;

COMMENT ON FUNCTION privado.json_uuid(jsonb, text) IS
  'SII-B3: lee una clave uuid (texto con formato uuid) de un jsonb de entrada; null si ausente/null.';

CREATE OR REPLACE FUNCTION privado.json_uuid_array(p_datos jsonb, p_clave text)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := p_datos -> p_clave;
  v_elemento jsonb;
  v_texto text;
  v_resultado uuid[] := '{}';
BEGIN
  IF v IS NULL OR v = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(v) <> 'array' THEN
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
  END IF;
  FOR v_elemento IN SELECT e.value FROM jsonb_array_elements(v) AS e(value) LOOP
    IF jsonb_typeof(v_elemento) <> 'string' THEN
      RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
    END IF;
    v_texto := v_elemento #>> '{}';
    IF v_texto !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023', DETAIL = p_clave;
    END IF;
    IF NOT (v_texto::uuid = ANY (v_resultado)) THEN
      v_resultado := array_append(v_resultado, v_texto::uuid);
    END IF;
  END LOOP;
  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION privado.json_uuid_array(jsonb, text) IS
  'SII-B3: lee un arreglo de uuids de un jsonb de entrada, deduplicado; null si ausente/null.';

-- -----------------------------------------------------------------------------
-- 1. Validación estructurada para LISTO (§3.6)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_rfq_listo(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq public.pipeline%ROWTYPE;
  v_cliente_estado text;
  v_contacto_vigente boolean;
  v_activos integer;
  v_item record;
  v_material_con_espesores boolean;
  v_requiere_archivo boolean;
  v_es_otro boolean;
  v_faltantes_cliente text[] := '{}';
  v_faltantes_general text[] := '{}';
  v_faltantes_items text[] := '{}';
  v_faltantes_archivos text[] := '{}';
  v_faltantes_seguimiento text[] := '{}';
BEGIN
  SELECT * INTO v_rfq FROM public.pipeline WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Cliente: ligado y no inactivo; contacto vigente del mismo cliente.
  IF v_rfq.cliente_id IS NULL THEN
    v_faltantes_cliente := array_append(v_faltantes_cliente, 'cliente ligado');
  ELSE
    SELECT c.estado INTO v_cliente_estado
    FROM public.clientes AS c WHERE c.id = v_rfq.cliente_id;
    IF NOT FOUND OR v_cliente_estado = 'inactivo' THEN
      v_faltantes_cliente := array_append(v_faltantes_cliente, 'cliente activo');
    END IF;

    IF v_rfq.contacto_id IS NULL THEN
      v_faltantes_cliente := array_append(v_faltantes_cliente, 'contacto vigente del cliente');
    ELSE
      SELECT (ct.activo AND ct.cliente_id = v_rfq.cliente_id) INTO v_contacto_vigente
      FROM public.contactos_cliente AS ct WHERE ct.id = v_rfq.contacto_id;
      IF v_contacto_vigente IS NOT TRUE THEN
        v_faltantes_cliente := array_append(v_faltantes_cliente, 'contacto vigente del cliente');
      END IF;
    END IF;
  END IF;

  -- General: descripción, canal, fecha y responsable.
  IF NULLIF(btrim(COALESCE(v_rfq.descripcion_general, '')), '') IS NULL THEN
    v_faltantes_general := array_append(v_faltantes_general, 'descripción general');
  END IF;
  IF NULLIF(btrim(COALESCE(v_rfq.canal, '')), '') IS NULL THEN
    v_faltantes_general := array_append(v_faltantes_general, 'canal');
  END IF;
  IF v_rfq.fecha_solicitud IS NULL THEN
    v_faltantes_general := array_append(v_faltantes_general, 'fecha de solicitud');
  END IF;
  IF v_rfq.responsable_id IS NULL THEN
    v_faltantes_general := array_append(v_faltantes_general, 'responsable');
  END IF;

  -- Ítems: al menos uno activo y cada activo completo.
  SELECT count(*) INTO v_activos
  FROM public.rfq_items AS i
  WHERE i.rfq_id = p_rfq_id AND i.estado = 'activo';

  IF v_activos = 0 THEN
    v_faltantes_items := array_append(v_faltantes_items, 'al menos un ítem activo');
  END IF;

  FOR v_item IN
    SELECT i.* FROM public.rfq_items AS i
    WHERE i.rfq_id = p_rfq_id AND i.estado = 'activo'
    ORDER BY i.numero
  LOOP
    IF v_item.material_id IS NULL THEN
      v_faltantes_items := array_append(v_faltantes_items, 'ítem ' || v_item.codigo || ': material');
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.catalogo_espesores AS e
        WHERE e.material_id = v_item.material_id AND e.activo
      ) INTO v_material_con_espesores;

      IF v_material_con_espesores AND v_item.espesor_id IS NULL THEN
        v_faltantes_items := array_append(v_faltantes_items, 'ítem ' || v_item.codigo || ': espesor');
      END IF;

      IF v_item.espesor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.catalogo_espesores AS e
        WHERE e.id = v_item.espesor_id AND e.material_id = v_item.material_id
      ) THEN
        v_faltantes_items := array_append(
          v_faltantes_items, 'ítem ' || v_item.codigo || ': espesor del material');
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.rfq_item_operaciones AS o WHERE o.rfq_item_id = v_item.id
    ) THEN
      v_faltantes_items := array_append(
        v_faltantes_items, 'ítem ' || v_item.codigo || ': al menos una operación solicitada');
    END IF;
  END LOOP;

  -- Archivos: solo si algún ítem activo usa un proceso que exige archivo técnico.
  SELECT EXISTS (
    SELECT 1
    FROM public.rfq_items AS i
    JOIN public.rfq_item_operaciones AS o ON o.rfq_item_id = i.id
    JOIN public.catalogo_procesos AS pr ON pr.id = o.proceso_id
    WHERE i.rfq_id = p_rfq_id
      AND i.estado = 'activo'
      AND pr.requiere_archivo_tecnico
  ) INTO v_requiere_archivo;

  IF v_requiere_archivo AND NOT EXISTS (
    SELECT 1
    FROM public.archivos AS a
    WHERE a.vigente
      AND a.clase IN ('CAD', 'DIBUJO', 'ESPECIFICACIONES')
      AND (
        (a.entidad = 'rfq' AND a.entidad_id = p_rfq_id)
        OR (
          a.entidad = 'rfq_item'
          AND a.entidad_id IN (
            SELECT i.id FROM public.rfq_items AS i
            WHERE i.rfq_id = p_rfq_id AND i.estado = 'activo'
          )
        )
      )
  ) THEN
    v_faltantes_archivos := array_append(
      v_faltantes_archivos, 'archivo técnico (CAD/DIBUJO/ESPECIFICACIONES)');
  END IF;

  -- Seguimiento: próxima acción + fecha + responsable (detalle si es "Otro").
  IF v_rfq.proxima_accion_codigo IS NULL THEN
    v_faltantes_seguimiento := array_append(v_faltantes_seguimiento, 'próxima acción');
  ELSE
    SELECT pa.es_otro INTO v_es_otro
    FROM public.catalogo_proximas_acciones AS pa
    WHERE pa.codigo = v_rfq.proxima_accion_codigo;

    IF v_es_otro IS TRUE
       AND NULLIF(btrim(COALESCE(v_rfq.proxima_accion_texto, '')), '') IS NULL THEN
      v_faltantes_seguimiento := array_append(
        v_faltantes_seguimiento, 'detalle de la próxima acción (Otro)');
    END IF;
  END IF;
  IF v_rfq.fecha_proxima_accion IS NULL THEN
    v_faltantes_seguimiento := array_append(v_faltantes_seguimiento, 'fecha de próxima acción');
  END IF;
  IF v_rfq.responsable_proxima_accion_id IS NULL THEN
    v_faltantes_seguimiento := array_append(
      v_faltantes_seguimiento, 'responsable de próxima acción');
  END IF;

  RETURN jsonb_build_object(
    'listo',
      cardinality(v_faltantes_cliente) = 0
      AND cardinality(v_faltantes_general) = 0
      AND cardinality(v_faltantes_items) = 0
      AND cardinality(v_faltantes_archivos) = 0
      AND cardinality(v_faltantes_seguimiento) = 0,
    'secciones', jsonb_build_object(
      'cliente', to_jsonb(v_faltantes_cliente),
      'general', to_jsonb(v_faltantes_general),
      'items', to_jsonb(v_faltantes_items),
      'archivos', to_jsonb(v_faltantes_archivos),
      'seguimiento', to_jsonb(v_faltantes_seguimiento)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.validar_rfq_listo(uuid) IS
  'SII-B3.6: devuelve {listo, secciones{cliente,general,items,archivos,seguimiento}} con los faltantes por sección. Solo service_role.';

REVOKE ALL ON FUNCTION public.validar_rfq_listo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_rfq_listo(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Máquina de estados del RFQ (§3.2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_rfq(
  p_rfq_id uuid,
  p_accion text,
  p_args jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permiso text;
  v_estado text;
  v_nuevo text;
  v_actualizado timestamptz;
  v_esperado timestamptz;
  v_motivo text;
  v_validacion jsonb;
BEGIN
  IF p_accion IS NULL OR p_accion NOT IN (
    'marcar_incompleto', 'poner_en_espera_cliente', 'poner_en_espera_tecnica',
    'marcar_listo', 'cerrar', 'cancelar'
  ) THEN
    RAISE EXCEPTION 'accion_invalida' USING ERRCODE = '22023';
  END IF;

  -- Permiso por acción (admin siempre); el actor debe estar activo.
  v_permiso := CASE p_accion
    WHEN 'marcar_listo' THEN 'rfq_marcar_listo'
    WHEN 'cerrar' THEN 'rfq_cerrar'
    WHEN 'cancelar' THEN 'rfq_cerrar'
    ELSE 'rfq_editar'
  END;
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, v_permiso) THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  IF p_args IS NULL OR jsonb_typeof(p_args) <> 'object' THEN
    RAISE EXCEPTION 'rfq_args_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_args->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT p.estado_rfq, p.actualizado_en
  INTO v_estado, v_actualizado
  FROM public.pipeline AS p
  WHERE p.id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;

  IF v_actualizado IS DISTINCT FROM v_esperado THEN
    -- Conflicto de negocio, no condición de carrera reintentable a ciegas.
    RAISE EXCEPTION 'rfq_desactualizado' USING ERRCODE = '23514';
  END IF;

  CASE p_accion
    WHEN 'marcar_incompleto' THEN
      IF v_estado NOT IN ('NEW', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→INCOMPLETE';
      END IF;
      v_nuevo := 'INCOMPLETE';

    WHEN 'poner_en_espera_cliente' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→WAITING_CUSTOMER';
      END IF;
      v_nuevo := 'WAITING_CUSTOMER';

    WHEN 'poner_en_espera_tecnica' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→WAITING_TECHNICAL';
      END IF;
      v_nuevo := 'WAITING_TECHNICAL';

    WHEN 'marcar_listo' THEN
      IF v_estado NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→READY_FOR_PROPOSAL';
      END IF;
      -- Revalidación en servidor: la UI nunca es la única barrera.
      v_validacion := public.validar_rfq_listo(p_rfq_id);
      IF (v_validacion->>'listo')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'rfq_no_listo' USING ERRCODE = '23514',
          DETAIL = v_validacion::text;
      END IF;
      v_nuevo := 'READY_FOR_PROPOSAL';

    WHEN 'cerrar', 'cancelar' THEN
      IF v_estado NOT IN (
        'NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL'
      ) THEN
        RAISE EXCEPTION 'rfq_transicion_invalida' USING ERRCODE = '23514',
          DETAIL = v_estado || '→' || p_accion;
      END IF;
      v_motivo := btrim(COALESCE(p_args->>'motivo', ''));
      IF char_length(v_motivo) < 3 OR char_length(v_motivo) > 300 THEN
        RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
      END IF;
      v_nuevo := CASE p_accion WHEN 'cerrar' THEN 'CLOSED' ELSE 'CANCELLED' END;
  END CASE;

  UPDATE public.pipeline AS p
  SET estado_rfq = v_nuevo
  WHERE p.id = p_rfq_id;

  INSERT INTO public.rfq_eventos (
    rfq_id, estado_anterior, estado_nuevo, accion, motivo, actor_id, correlation_id
  ) VALUES (
    p_rfq_id, v_estado, v_nuevo, p_accion, v_motivo, p_actor_id, p_correlation_id
  );

  RETURN v_nuevo;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) IS
  'SII-B3.2 (ADR-SII-07): única vía de cambio de estado del RFQ; valida permiso, transición, CAS y escribe rfq_eventos. Solo service_role.';

REVOKE ALL ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_rfq(uuid, text, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Alta de ítem (§3.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_item_rfq(
  p_rfq_id uuid,
  p_datos jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq public.pipeline%ROWTYPE;
  v_item public.rfq_items%ROWTYPE;
  v_descripcion text;
  v_cantidad numeric;
  v_material_id uuid;
  v_espesor_id uuid;
  v_acabado text;
  v_notas text;
  v_procesos uuid[];
  v_numero integer;
  v_material public.catalogo_materiales%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'rfq_item_editar') THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'item_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  -- Validación de campos antes de bloquear (una carga inválida no toma locks).
  v_descripcion := btrim(COALESCE(privado.json_texto(p_datos, 'descripcion'), ''));
  IF char_length(v_descripcion) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'item_descripcion_invalida' USING ERRCODE = '22023';
  END IF;

  v_cantidad := privado.json_numero(p_datos, 'cantidad');
  IF v_cantidad IS NULL
     OR v_cantidad <= 0
     OR v_cantidad > 1000000000
     OR v_cantidad <> round(v_cantidad, 2) THEN
    RAISE EXCEPTION 'item_cantidad_invalida' USING ERRCODE = '22023';
  END IF;

  v_material_id := privado.json_uuid(p_datos, 'material_id');
  v_espesor_id := privado.json_uuid(p_datos, 'espesor_id');
  v_acabado := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'acabado'), '')), '');
  v_notas := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'notas'), '')), '');
  IF v_acabado IS NOT NULL AND char_length(v_acabado) > 120 THEN
    RAISE EXCEPTION 'item_acabado_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_notas IS NOT NULL AND char_length(v_notas) > 2000 THEN
    RAISE EXCEPTION 'item_notas_invalidas' USING ERRCODE = '22023';
  END IF;

  v_procesos := privado.json_uuid_array(p_datos, 'proceso_ids');
  IF v_procesos IS NOT NULL AND cardinality(v_procesos) > 20 THEN
    RAISE EXCEPTION 'item_procesos_invalidos' USING ERRCODE = '22023';
  END IF;

  -- Lock del RFQ: serializa la numeración ITxx y protege el estado.
  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
    RAISE EXCEPTION 'rfq_no_editable' USING ERRCODE = '23514';
  END IF;

  -- Material/espesor coherentes y vigentes para registros nuevos.
  IF v_material_id IS NOT NULL THEN
    SELECT * INTO v_material FROM public.catalogo_materiales AS m WHERE m.id = v_material_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_invalido' USING ERRCODE = '22023';
    END IF;
    IF NOT v_material.activo THEN
      RAISE EXCEPTION 'material_inactivo' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.material_id = v_material_id AND e.activo
    ) THEN
      IF v_espesor_id IS NULL THEN
        RAISE EXCEPTION 'espesor_requerido' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_espesor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.id = v_espesor_id AND e.material_id = v_material_id AND e.activo
    ) THEN
      RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_espesor_id IS NOT NULL THEN
    RAISE EXCEPTION 'espesor_sin_material' USING ERRCODE = '22023';
  END IF;

  IF v_procesos IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(v_procesos) AS x(proceso_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.catalogo_procesos AS pr
      WHERE pr.id = x.proceso_id AND pr.activo
    )
  ) THEN
    RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
  END IF;

  -- `numero` considera cancelados: jamás se reutiliza un ITxx.
  SELECT COALESCE(max(i.numero), 0) + 1 INTO v_numero
  FROM public.rfq_items AS i WHERE i.rfq_id = p_rfq_id;
  IF v_numero > 99 THEN
    RAISE EXCEPTION 'items_agotados' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.rfq_items (
    rfq_id, numero, codigo, descripcion, cantidad, material_id, espesor_id, acabado, notas
  ) VALUES (
    p_rfq_id, v_numero, 'IT' || lpad(v_numero::text, 2, '0'),
    v_descripcion, v_cantidad, v_material_id, v_espesor_id, v_acabado, v_notas
  )
  RETURNING * INTO v_item;

  IF v_procesos IS NOT NULL AND cardinality(v_procesos) > 0 THEN
    INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
    SELECT v_item.id, x.proceso_id, (x.ord - 1)
    FROM unnest(v_procesos) WITH ORDINALITY AS x(proceso_id, ord);
  END IF;

  RETURN to_jsonb(v_item);
END;
$$;

COMMENT ON FUNCTION public.crear_item_rfq(uuid, jsonb, uuid, uuid) IS
  'SII-B3.3: crea un ítem ITxx con lock del RFQ; el número nunca se reutiliza. Solo service_role.';

REVOKE ALL ON FUNCTION public.crear_item_rfq(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_item_rfq(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Edición de ítem con CAS (§3.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_item_rfq(
  p_item_id uuid,
  p_datos jsonb,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.rfq_items%ROWTYPE;
  v_item_bloqueado public.rfq_items%ROWTYPE;
  v_rfq public.pipeline%ROWTYPE;
  v_esperado timestamptz;
  v_descripcion text;
  v_cantidad numeric;
  v_acabado text;
  v_notas text;
  v_material_resultante uuid;
  v_espesor_resultante uuid;
  v_procesos uuid[];
  v_material public.catalogo_materiales%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'rfq_item_editar') THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'item_datos_invalidos' USING ERRCODE = '22023';
  END IF;

  v_esperado := NULLIF(btrim(COALESCE(p_datos->>'actualizado_en', '')), '')::timestamptz;
  IF v_esperado IS NULL THEN
    RAISE EXCEPTION 'actualizado_en_requerido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.rfq_items AS i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  -- Lock order: RFQ → ítem (mismo contrato que crear_item_rfq).
  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = v_item.rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
    RAISE EXCEPTION 'rfq_no_editable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item_bloqueado FROM public.rfq_items AS i WHERE i.id = p_item_id FOR UPDATE;
  IF v_item_bloqueado.estado = 'cancelado' THEN
    RAISE EXCEPTION 'item_cancelado' USING ERRCODE = '23514';
  END IF;
  IF v_item_bloqueado.actualizado_en IS DISTINCT FROM v_esperado THEN
    RAISE EXCEPTION 'item_desactualizado' USING ERRCODE = '23514';
  END IF;

  -- Validación de campos presentes (los ausentes conservan su valor).
  IF p_datos ? 'descripcion' THEN
    v_descripcion := btrim(COALESCE(privado.json_texto(p_datos, 'descripcion'), ''));
    IF char_length(v_descripcion) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'item_descripcion_invalida' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_datos ? 'cantidad' THEN
    v_cantidad := privado.json_numero(p_datos, 'cantidad');
    IF v_cantidad IS NULL
       OR v_cantidad <= 0
       OR v_cantidad > 1000000000
       OR v_cantidad <> round(v_cantidad, 2) THEN
      RAISE EXCEPTION 'item_cantidad_invalida' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_datos ? 'acabado' THEN
    v_acabado := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'acabado'), '')), '');
    IF v_acabado IS NOT NULL AND char_length(v_acabado) > 120 THEN
      RAISE EXCEPTION 'item_acabado_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_datos ? 'notas' THEN
    v_notas := NULLIF(btrim(COALESCE(privado.json_texto(p_datos, 'notas'), '')), '');
    IF v_notas IS NOT NULL AND char_length(v_notas) > 2000 THEN
      RAISE EXCEPTION 'item_notas_invalidas' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Estado resultante de material/espesor (regla §3.3).
  v_material_resultante := CASE
    WHEN p_datos ? 'material_id' THEN privado.json_uuid(p_datos, 'material_id')
    ELSE v_item_bloqueado.material_id
  END;
  v_espesor_resultante := CASE
    WHEN p_datos ? 'espesor_id' THEN privado.json_uuid(p_datos, 'espesor_id')
    ELSE v_item_bloqueado.espesor_id
  END;

  IF v_material_resultante IS NOT NULL THEN
    SELECT * INTO v_material
    FROM public.catalogo_materiales AS m WHERE m.id = v_material_resultante;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_invalido' USING ERRCODE = '22023';
    END IF;
    -- Un material inactivo solo se conserva si no se está cambiando.
    IF NOT v_material.activo AND v_material_resultante IS DISTINCT FROM v_item_bloqueado.material_id THEN
      RAISE EXCEPTION 'material_inactivo' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.material_id = v_material_resultante AND e.activo
    ) AND v_espesor_resultante IS NULL THEN
      RAISE EXCEPTION 'espesor_requerido' USING ERRCODE = '22023';
    END IF;

    IF v_espesor_resultante IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.catalogo_espesores AS e
      WHERE e.id = v_espesor_resultante AND e.material_id = v_material_resultante
    ) THEN
      RAISE EXCEPTION 'espesor_invalido' USING ERRCODE = '22023';
    END IF;
  ELSIF v_espesor_resultante IS NOT NULL THEN
    RAISE EXCEPTION 'espesor_sin_material' USING ERRCODE = '22023';
  END IF;

  IF p_datos ? 'proceso_ids' THEN
    v_procesos := privado.json_uuid_array(p_datos, 'proceso_ids');
    IF v_procesos IS NOT NULL AND cardinality(v_procesos) > 20 THEN
      RAISE EXCEPTION 'item_procesos_invalidos' USING ERRCODE = '22023';
    END IF;
    IF v_procesos IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(v_procesos) AS x(proceso_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.catalogo_procesos AS pr
        WHERE pr.id = x.proceso_id AND pr.activo
      )
    ) THEN
      RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.rfq_items AS i
  SET descripcion = CASE WHEN p_datos ? 'descripcion' THEN v_descripcion ELSE i.descripcion END,
      cantidad = CASE WHEN p_datos ? 'cantidad' THEN v_cantidad ELSE i.cantidad END,
      material_id = CASE WHEN p_datos ? 'material_id' THEN v_material_resultante ELSE i.material_id END,
      espesor_id = CASE WHEN p_datos ? 'espesor_id' THEN v_espesor_resultante ELSE i.espesor_id END,
      acabado = CASE WHEN p_datos ? 'acabado' THEN v_acabado ELSE i.acabado END,
      notas = CASE WHEN p_datos ? 'notas' THEN v_notas ELSE i.notas END
  WHERE i.id = p_item_id
  RETURNING * INTO v_item_bloqueado;

  IF p_datos ? 'proceso_ids' THEN
    DELETE FROM public.rfq_item_operaciones AS o WHERE o.rfq_item_id = p_item_id;
    IF v_procesos IS NOT NULL AND cardinality(v_procesos) > 0 THEN
      INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
      SELECT p_item_id, x.proceso_id, (x.ord - 1)
      FROM unnest(v_procesos) WITH ORDINALITY AS x(proceso_id, ord);
    END IF;
  END IF;

  RETURN to_jsonb(v_item_bloqueado);
END;
$$;

COMMENT ON FUNCTION public.actualizar_item_rfq(uuid, jsonb, uuid, uuid) IS
  'SII-B3.3: edita un ítem con CAS (actualizado_en) y lock RFQ→ítem; valida material/espesor/procesos. Solo service_role.';

REVOKE ALL ON FUNCTION public.actualizar_item_rfq(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_item_rfq(uuid, jsonb, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Cancelación de ítem (nunca libera el número)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancelar_item_rfq(
  p_item_id uuid,
  p_motivo text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.rfq_items%ROWTYPE;
  v_rfq public.pipeline%ROWTYPE;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'rfq_item_editar') THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  IF v_motivo IS NOT NULL AND char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.rfq_items AS i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = v_item.rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
    RAISE EXCEPTION 'rfq_no_editable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item FROM public.rfq_items AS i WHERE i.id = p_item_id FOR UPDATE;

  -- Idempotente: cancelar dos veces devuelve el mismo estado sin duplicar traza.
  IF v_item.estado = 'cancelado' THEN
    RETURN to_jsonb(v_item);
  END IF;

  -- Un ítem con documentos vinculados no se cancela (B4/B5 extenderán la guarda
  -- a propuesta/orden cuando existan esas tablas).
  IF EXISTS (
    SELECT 1 FROM public.archivos AS a
    WHERE a.entidad = 'rfq_item' AND a.entidad_id = p_item_id AND a.vigente
  ) THEN
    RAISE EXCEPTION 'item_con_documentos' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rfq_items AS i
  SET estado = 'cancelado',
      notas = NULLIF(
        concat_ws(E'\n', NULLIF(btrim(i.notas), ''),
          CASE WHEN v_motivo IS NOT NULL THEN 'Cancelación: ' || v_motivo END),
        '')
  WHERE i.id = p_item_id
  RETURNING * INTO v_item;

  RETURN to_jsonb(v_item);
END;
$$;

COMMENT ON FUNCTION public.cancelar_item_rfq(uuid, text, uuid, uuid) IS
  'SII-B3.3: cancelación lógica de un ítem (no libera el ITxx); rechaza ítems con documentos vigentes. Solo service_role.';

REVOKE ALL ON FUNCTION public.cancelar_item_rfq(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_item_rfq(uuid, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Reemplazo atómico de operaciones del ítem (§3.3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reemplazar_operaciones_item(
  p_item_id uuid,
  p_proceso_ids uuid[],
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.rfq_items%ROWTYPE;
  v_rfq public.pipeline%ROWTYPE;
  v_procesos uuid[];
  v_resultado jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, 'rfq_item_editar') THEN
    RAISE EXCEPTION 'sin_permiso_rfq' USING ERRCODE = '42501';
  END IF;

  v_procesos := COALESCE(p_proceso_ids, '{}');
  IF cardinality(v_procesos) > 20 THEN
    RAISE EXCEPTION 'item_procesos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_procesos) AS x(proceso_id) WHERE x.proceso_id IS NULL) THEN
    RAISE EXCEPTION 'item_procesos_invalidos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.rfq_items AS i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_inexistente' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rfq FROM public.pipeline AS p WHERE p.id = v_item.rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rfq_inexistente' USING ERRCODE = '22023';
  END IF;
  IF v_rfq.estado_rfq NOT IN ('NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL') THEN
    RAISE EXCEPTION 'rfq_no_editable' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item FROM public.rfq_items AS i WHERE i.id = p_item_id FOR UPDATE;
  IF v_item.estado = 'cancelado' THEN
    RAISE EXCEPTION 'item_cancelado' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_procesos) AS x(proceso_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.catalogo_procesos AS pr
      WHERE pr.id = x.proceso_id AND pr.activo
    )
  ) THEN
    RAISE EXCEPTION 'proceso_invalido' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.rfq_item_operaciones AS o WHERE o.rfq_item_id = p_item_id;

  INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
  SELECT p_item_id, x.proceso_id, (x.ord - 1)
  FROM unnest(v_procesos) WITH ORDINALITY AS x(proceso_id, ord)
  ON CONFLICT (rfq_item_id, proceso_id) DO NOTHING;

  -- Toca el ítem para refrescar el token CAS y la señal de Realtime.
  UPDATE public.rfq_items SET actualizado_en = now() WHERE id = p_item_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'proceso_id', o.proceso_id,
    'orden', o.orden
  ) ORDER BY o.orden), '[]'::jsonb)
  INTO v_resultado
  FROM public.rfq_item_operaciones AS o
  WHERE o.rfq_item_id = p_item_id;

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.reemplazar_operaciones_item(uuid, uuid[], uuid, uuid) IS
  'SII-B3.3: reemplaza todas las operaciones de un ítem activo en una transacción. Solo service_role.';

REVOKE ALL ON FUNCTION public.reemplazar_operaciones_item(uuid, uuid[], uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_operaciones_item(uuid, uuid[], uuid, uuid) TO service_role;
