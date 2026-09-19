-- =============================================================================
-- Migración: RFQ-05/06 (área/departamento y trabajo externo por línea) + línea
-- de descuento RFQ-03 — wiring de las columnas de 20260916000004.
-- ORCA MFG ERP — Pipeline (cotizaciones) / Órdenes de producción.
--
-- Qué hace:
--   1. `guardar_cotizacion_atomica` (misma firma) acepta y persiste por línea
--      `area_trabajo_codigo` (validado contra `areas_trabajo_config`),
--      `es_externo`, `proveedor_externo` y `es_descuento`.
--   2. `crear_orden_produccion` (misma firma) acepta y persiste esas dimensiones
--      en la partida (área, procesos, externo y proveedor).
--   3. `aprobar_oportunidad_y_crear_orden` (misma firma) propaga línea→partida y
--      EXCLUYE las líneas de descuento: no son fabricables.
--   4. `obtener_metricas_dashboard_ejecutivo` resta las líneas de descuento del
--      total cotizado (antes las sumaba como un cargo más).
--
-- Invariantes de la línea de descuento (`es_descuento = true`):
--   * Es un concepto comercial: no lleva `calculo_tecnico`.
--   * No puede ser la única línea de la cotización (debe quedar producción).
--   * La suma de descuentos no puede superar el subtotal de las fabricables.
--   * Se guarda con importe POSITIVO y cantidad > 0; el signo lo aplica quien
--     suma (app/SQL), no la fila. Así `cantidad`/`precio_unitario` conservan sus
--     CHECK y el descuento se puede mostrar como concepto separado.
--
-- Todas son CREATE OR REPLACE con firma idéntica (conservan grants); se
-- reafirman REVOKE/GRANT por consistencia. Idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Guardado atómico de la cotización con las dimensiones nuevas.
--    Base: 20260915000539 (snapshot técnico). Identidad, lock, compare-and-set,
--    rechazo de cotización con orden y validación del cálculo técnico quedan
--    igual; solo se agregan las reglas RFQ-03/05/06.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_cotizacion_atomica(
  p_pipeline_id uuid,
  p_lineas jsonb,
  p_actualizado_en_esperado timestamptz DEFAULT NULL
)
RETURNS TABLE (pipeline_id uuid, lineas_guardadas integer, actualizado_en timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_vendedor_id uuid;
  v_etapa text;
  v_actualizado_en timestamptz;
  v_total integer;
  v_moneda text;
  v_subtotal_fabricable numeric;
  v_descuento_total numeric;
BEGIN
  IF v_usuario_id IS NULL OR p_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'cotizacion_sin_identidad' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  v_total := jsonb_array_length(p_lineas);
  IF v_total < 1 OR v_total > 200 THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  -- RFQ-03: una cotización no puede ser solo descuentos; tiene que quedar al
  -- menos una línea fabricable que sustente la orden de producción.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lineas) AS e(linea)
    WHERE coalesce((e.linea ->> 'es_descuento')::boolean, false) = false
  ) THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Validación de cada línea ANTES de borrar nada: una carga inválida no puede
  -- dejar la cotización vacía a medio camino.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_lineas) AS entrada(linea)
    WHERE jsonb_typeof(entrada.linea) <> 'object'
       OR nullif(btrim(coalesce(entrada.linea ->> 'descripcion', '')), '') IS NULL
       OR char_length(btrim(entrada.linea ->> 'descripcion')) > 300
       OR jsonb_typeof(entrada.linea -> 'cantidad') <> 'number'
       OR (entrada.linea ->> 'cantidad')::numeric <= 0
       OR (entrada.linea ->> 'cantidad')::numeric > 1000000000
       -- `cantidad` es numeric(12,2): un valor con más escala se redondearía al
       -- insertar y el usuario guardaría algo distinto a lo que capturó.
       OR (entrada.linea ->> 'cantidad')::numeric
            <> round((entrada.linea ->> 'cantidad')::numeric, 2)
       OR jsonb_typeof(entrada.linea -> 'precio_unitario') <> 'number'
       OR (entrada.linea ->> 'precio_unitario')::numeric < 0
       OR (entrada.linea ->> 'precio_unitario')::numeric > 1000000000
       -- `precio_unitario` es numeric(14,4); misma razón que `cantidad`.
       OR (entrada.linea ->> 'precio_unitario')::numeric
            <> round((entrada.linea ->> 'precio_unitario')::numeric, 4)
       OR jsonb_typeof(coalesce(entrada.linea -> 'area', 'null'::jsonb)) NOT IN ('number', 'null')
       OR coalesce((entrada.linea ->> 'area')::numeric, 0) < 0
       OR coalesce((entrada.linea ->> 'area')::numeric, 0) > 10000000
       -- `area` es numeric(12,4).
       OR coalesce((entrada.linea ->> 'area')::numeric, 0)
            <> round(coalesce((entrada.linea ->> 'area')::numeric, 0), 4)
       OR jsonb_typeof(coalesce(entrada.linea -> 'material', 'null'::jsonb)) NOT IN ('string', 'null')
       OR char_length(coalesce(entrada.linea ->> 'material', '')) > 120
       OR jsonb_typeof(coalesce(entrada.linea -> 'espesor', 'null'::jsonb)) NOT IN ('string', 'null')
       OR char_length(coalesce(entrada.linea ->> 'espesor', '')) > 120
       OR jsonb_typeof(coalesce(entrada.linea -> 'procesos', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(coalesce(entrada.linea -> 'procesos', '[]'::jsonb)) > 20
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(coalesce(entrada.linea -> 'procesos', '[]'::jsonb)) AS proceso(valor)
            WHERE jsonb_typeof(proceso.valor) <> 'string'
               OR char_length(proceso.valor #>> '{}') > 60
          )
       -- RFQ-05: el área/departamento es un código del catálogo. Se valida
       -- contra `areas_trabajo_config` (exista, activa o no: una cotización
       -- histórica no se invalida porque después desactiven el área).
       OR jsonb_typeof(coalesce(entrada.linea -> 'area_trabajo_codigo', 'null'::jsonb)) NOT IN ('string', 'null')
       OR char_length(btrim(coalesce(entrada.linea ->> 'area_trabajo_codigo', ''))) > 48
       OR (
            nullif(btrim(coalesce(entrada.linea ->> 'area_trabajo_codigo', '')), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.areas_trabajo_config AS area
              WHERE area.codigo = btrim(entrada.linea ->> 'area_trabajo_codigo')
            )
          )
       -- RFQ-06: trabajo externo (EXT) con proveedor de texto libre.
       OR jsonb_typeof(coalesce(entrada.linea -> 'es_externo', 'false'::jsonb)) <> 'boolean'
       OR char_length(btrim(coalesce(entrada.linea ->> 'proveedor_externo', ''))) > 120
       -- RFQ-03: bandera de descuento.
       OR jsonb_typeof(coalesce(entrada.linea -> 'es_descuento', 'false'::jsonb)) <> 'boolean'
       -- El descuento no lleva cálculo técnico: es un concepto comercial, no una
       -- partida con snapshot reproducible.
       OR (
            coalesce((entrada.linea ->> 'es_descuento')::boolean, false)
            AND entrada.linea ? 'calculo_tecnico'
            AND entrada.linea -> 'calculo_tecnico' <> 'null'::jsonb
          )
  ) THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  -- RFQ-03: el descuento no puede volver negativa la cotización. Se compara en
  -- numeric exacto (sin redondear) antes de escribir nada.
  SELECT
    coalesce(sum((e.linea ->> 'cantidad')::numeric * (e.linea ->> 'precio_unitario')::numeric)
      FILTER (WHERE coalesce((e.linea ->> 'es_descuento')::boolean, false) = false), 0),
    coalesce(sum((e.linea ->> 'cantidad')::numeric * (e.linea ->> 'precio_unitario')::numeric)
      FILTER (WHERE coalesce((e.linea ->> 'es_descuento')::boolean, false)), 0)
  INTO v_subtotal_fabricable, v_descuento_total
  FROM jsonb_array_elements(p_lineas) AS e(linea);

  IF v_descuento_total > v_subtotal_fabricable THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Bloquea la oportunidad: serializa contra otro guardado y contra
  -- `aprobar_oportunidad_y_crear_orden`, que toma el mismo lock antes de leer
  -- las líneas para crear la OP.
  SELECT oportunidad.vendedor_id, oportunidad.etapa, oportunidad.actualizado_en, oportunidad.moneda
  INTO v_vendedor_id, v_etapa, v_actualizado_en, v_moneda
  FROM public.pipeline AS oportunidad
  WHERE oportunidad.id = p_pipeline_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'oportunidad_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Autorización real: dueño activo, admin o permiso de equipo. Sin esto, una
  -- función DEFINER abriría la edición a cualquier usuario autenticado.
  IF NOT (
    (
      v_vendedor_id = v_usuario_id
      AND EXISTS (
        SELECT 1 FROM public.usuarios AS usuario
        WHERE usuario.id = v_usuario_id AND usuario.activo = true
      )
    )
    OR (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
  ) THEN
    RAISE EXCEPTION 'usuario_sin_acceso_oportunidad' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_etapa NOT IN ('prospecto', 'contactado', 'cotizado', 'negociacion') THEN
    RAISE EXCEPTION 'cotizacion_no_editable' USING ERRCODE = 'check_violation';
  END IF;

  -- Compare-and-set opcional: el editor manda el `actualizado_en` que leyó y la
  -- escritura se rechaza si la oportunidad cambió mientras tanto. Las llamadas
  -- antiguas (sin token) siguen funcionando por compatibilidad.
  -- ERRCODE de violación de regla de negocio (`check_violation`), no
  -- `serialization_failure`: este conflicto NO se resuelve reintentando la misma
  -- escritura (el cliente debe recargar y decidir), y un código de serialización
  -- invita a capas intermedias a reintentar automáticamente y pisar el cambio
  -- ajeno, que es justo lo que este compare-and-set evita.
  IF p_actualizado_en_esperado IS NOT NULL
     AND v_actualizado_en IS DISTINCT FROM p_actualizado_en_esperado THEN
    RAISE EXCEPTION 'cotizacion_conflicto' USING ERRCODE = 'check_violation';
  END IF;

  -- Una cotización ya convertida en OP es el documento que sustenta esa orden:
  -- no se reescribe aunque la etapa fuera revertida por un admin.
  IF EXISTS (
    SELECT 1 FROM public.ordenes_produccion AS orden
    WHERE orden.cotizacion_id = p_pipeline_id
  ) THEN
    RAISE EXCEPTION 'cotizacion_con_orden' USING ERRCODE = 'check_violation';
  END IF;

  -- Instantánea de parámetros comerciales ingresados para este cálculo; no
  -- contiene CPP, costos reales de producción ni lectura de otros módulos.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lineas) AS e(linea)
    WHERE e.linea ? 'calculo_tecnico' AND e.linea->'calculo_tecnico' <> 'null'::jsonb
      AND (jsonb_typeof(e.linea->'calculo_tecnico') IS DISTINCT FROM 'object'
        OR octet_length((e.linea->'calculo_tecnico')::text) > 32768
        OR e.linea#>'{calculo_tecnico,version}' IS DISTINCT FROM '1'::jsonb
        OR jsonb_typeof(e.linea#>'{calculo_tecnico,entrada}') IS DISTINCT FROM 'object'
        OR e.linea#>'{calculo_tecnico,entrada,cantidad}' IS DISTINCT FROM e.linea->'cantidad'
        OR e.linea#>'{calculo_tecnico,precioUnitario}' IS DISTINCT FROM e.linea->'precio_unitario'
        OR e.linea#>>'{calculo_tecnico,entrada,moneda}' IS DISTINCT FROM v_moneda)
  ) THEN
    RAISE EXCEPTION 'cotizacion_lineas_invalidas' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM public.cotizacion_lineas AS linea
  WHERE linea.pipeline_id = p_pipeline_id;

  INSERT INTO public.cotizacion_lineas (
    pipeline_id,
    descripcion,
    cantidad,
    material,
    espesor,
    area,
    procesos,
    precio_unitario,
    calculo_tecnico,
    area_trabajo_codigo,
    es_externo,
    proveedor_externo,
    es_descuento,
    orden
  )
  SELECT
    p_pipeline_id,
    btrim(entrada.linea ->> 'descripcion'),
    (entrada.linea ->> 'cantidad')::numeric,
    nullif(btrim(coalesce(entrada.linea ->> 'material', '')), ''),
    nullif(btrim(coalesce(entrada.linea ->> 'espesor', '')), ''),
    CASE
      WHEN jsonb_typeof(coalesce(entrada.linea -> 'area', 'null'::jsonb)) = 'number'
        THEN (entrada.linea ->> 'area')::numeric
      ELSE NULL
    END,
    coalesce(
      (
        SELECT array_agg(btrim(proceso.valor) ORDER BY proceso.indice)
        FROM jsonb_array_elements_text(
               coalesce(entrada.linea -> 'procesos', '[]'::jsonb)
             ) WITH ORDINALITY AS proceso(valor, indice)
        WHERE btrim(proceso.valor) <> ''
      ),
      '{}'::text[]
    ),
    (entrada.linea ->> 'precio_unitario')::numeric,
    nullif(entrada.linea -> 'calculo_tecnico', 'null'::jsonb),
    nullif(btrim(coalesce(entrada.linea ->> 'area_trabajo_codigo', '')), ''),
    coalesce((entrada.linea ->> 'es_externo')::boolean, false),
    -- El proveedor externo solo tiene sentido con `es_externo`; si la línea no
    -- es externa se normaliza a NULL en lugar de guardar texto huérfano.
    CASE
      WHEN coalesce((entrada.linea ->> 'es_externo')::boolean, false)
        THEN nullif(btrim(coalesce(entrada.linea ->> 'proveedor_externo', '')), '')
      ELSE NULL
    END,
    coalesce((entrada.linea ->> 'es_descuento')::boolean, false),
    (entrada.indice - 1)::integer
  FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS entrada(linea, indice);

  -- Refresca el token de concurrencia (el trigger de la tabla fija la hora de
  -- PostgreSQL) y lo devuelve para que el editor siga siendo válido.
  UPDATE public.pipeline AS oportunidad
  SET actualizado_en = now()
  WHERE oportunidad.id = p_pipeline_id
  RETURNING oportunidad.actualizado_en INTO v_actualizado_en;

  RETURN QUERY SELECT p_pipeline_id, v_total, v_actualizado_en;
END;
$$;
REVOKE ALL ON FUNCTION public.guardar_cotizacion_atomica(uuid,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_cotizacion_atomica(uuid,jsonb,timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Creación de la orden: la partida persiste área, procesos y trabajo externo.
--    Base: 20260812010000. Las claves nuevas son opcionales en el JSONB: una
--    llamada antigua (sin ellas) produce NULL/false/{}, así que no hay
--    regresión para crear_orden_manual ni para la aprobación previa.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_orden_produccion(
  p_cliente_id uuid,
  p_cotizacion_id uuid,
  p_fecha_compromiso timestamptz,
  p_prioridad text,
  p_partidas jsonb
)
RETURNS TABLE (id uuid, folio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_folio text;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_prioridad IS NULL OR p_prioridad NOT IN ('baja', 'normal', 'alta', 'urgente') THEN
    RAISE EXCEPTION 'prioridad_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF p_partidas IS NULL
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0 THEN
    RAISE EXCEPTION 'partidas_requeridas' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_partidas) AS elemento(partida)
    WHERE jsonb_typeof(elemento.partida) <> 'object'
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS partida(
      codigo_pieza text,
      cantidad_solicitada numeric,
      unidad_medida text,
      tiempo_estimado_minutos numeric,
      area_trabajo_codigo text,
      procesos text[],
      es_externo boolean,
      proveedor_externo text
    )
    WHERE nullif(btrim(partida.codigo_pieza), '') IS NULL
       OR partida.cantidad_solicitada IS NULL
       OR partida.cantidad_solicitada <= 0
       OR nullif(btrim(partida.unidad_medida), '') IS NULL
       OR coalesce(partida.tiempo_estimado_minutos, 0) < 0
       -- Área del catálogo (misma regla que la línea de cotización).
       OR char_length(btrim(coalesce(partida.area_trabajo_codigo, ''))) > 48
       OR (
            nullif(btrim(coalesce(partida.area_trabajo_codigo, '')), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.areas_trabajo_config AS area
              WHERE area.codigo = btrim(partida.area_trabajo_codigo)
            )
          )
       OR char_length(btrim(coalesce(partida.proveedor_externo, ''))) > 120
       OR coalesce(array_length(partida.procesos, 1), 0) > 20
       OR EXISTS (
            SELECT 1
            FROM unnest(coalesce(partida.procesos, '{}'::text[])) AS proceso(valor)
            WHERE btrim(proceso.valor) = ''
               OR char_length(btrim(proceso.valor)) > 60
          )
  ) THEN
    RAISE EXCEPTION 'partida_invalida' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.ordenes_produccion (
    folio,
    cliente_id,
    cotizacion_id,
    estado,
    prioridad,
    fecha_compromiso
  )
  VALUES (
    public.generar_folio_orden('OP'),
    p_cliente_id,
    p_cotizacion_id,
    'borrador',
    p_prioridad,
    p_fecha_compromiso
  )
  RETURNING ordenes_produccion.id, ordenes_produccion.folio INTO v_orden_id, v_folio;

  INSERT INTO public.partidas_orden_produccion (
    orden_id,
    codigo_pieza,
    descripcion,
    cantidad_solicitada,
    unidad_medida,
    material_id,
    tiempo_estimado_minutos,
    maquina_asignada,
    area_trabajo_codigo,
    procesos,
    es_externo,
    proveedor_externo
  )
  SELECT
    v_orden_id,
    partida.codigo_pieza,
    partida.descripcion,
    partida.cantidad_solicitada,
    partida.unidad_medida,
    partida.material_id,
    coalesce(partida.tiempo_estimado_minutos, 0),
    partida.maquina_asignada,
    nullif(btrim(coalesce(partida.area_trabajo_codigo, '')), ''),
    coalesce(partida.procesos, '{}'::text[]),
    coalesce(partida.es_externo, false),
    CASE
      WHEN coalesce(partida.es_externo, false)
        THEN nullif(btrim(coalesce(partida.proveedor_externo, '')), '')
      ELSE NULL
    END
  FROM jsonb_to_recordset(p_partidas) AS partida(
    codigo_pieza text,
    descripcion text,
    cantidad_solicitada numeric,
    unidad_medida text,
    material_id uuid,
    tiempo_estimado_minutos numeric,
    maquina_asignada text,
    area_trabajo_codigo text,
    procesos text[],
    es_externo boolean,
    proveedor_externo text
  );

  RETURN QUERY SELECT v_orden_id, v_folio;
END;
$$;

COMMENT ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb) IS
  'Crea cabecera y partidas de una orden en una única transacción, heredando área/procesos/externo de la línea. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_orden_produccion(uuid, uuid, timestamptz, text, jsonb)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Aprobación: propaga línea→partida y excluye las líneas de descuento.
--    Base: 20260916000002 (TI). El resto del flujo (lock, reconciliación de
--    reintento, herencia de es_interna, etapa ganada) queda igual.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprobar_oportunidad_y_crear_orden(
  p_pipeline_id uuid,
  p_cliente_id uuid,
  p_fecha_compromiso timestamptz
)
RETURNS TABLE (id uuid, folio text, ya_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_etapa text;
  v_prioridad text;
  v_es_interna boolean;
  v_orden_id uuid;
  v_folio text;
  v_orden_cliente_id uuid;
  v_partidas jsonb;
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad, es_orden_interna
  INTO v_etapa, v_prioridad, v_es_interna
  FROM public.pipeline
  WHERE pipeline.id = p_pipeline_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'oportunidad_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ordenes_produccion.id, ordenes_produccion.folio, ordenes_produccion.cliente_id
  INTO v_orden_id, v_folio, v_orden_cliente_id
  FROM public.ordenes_produccion
  WHERE ordenes_produccion.cotizacion_id = p_pipeline_id;

  IF FOUND THEN
    IF v_orden_cliente_id IS DISTINCT FROM p_cliente_id THEN
      RAISE EXCEPTION 'cliente_no_corresponde_orden' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pipeline
    SET etapa = 'ganada', cliente_id = p_cliente_id
    WHERE pipeline.id = p_pipeline_id;
    RETURN QUERY SELECT v_orden_id, v_folio, true;
    RETURN;
  END IF;

  IF v_etapa <> 'negociacion' THEN
    RAISE EXCEPTION 'etapa_pipeline_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- Solo las líneas fabricables se convierten en partidas: una línea de
  -- descuento (RFQ-03) es un concepto comercial y no se produce.
  SELECT jsonb_agg(
    jsonb_build_object(
      'codigo_pieza', 'COT-' || lpad((linea.orden + 1)::text, 3, '0'),
      'descripcion', CASE
        WHEN nullif(btrim(linea.material), '') IS NULL THEN linea.descripcion
        ELSE linea.descripcion || ' — Material cotizado: ' || linea.material
      END,
      'cantidad_solicitada', linea.cantidad,
      'unidad_medida', 'unidad',
      'material_id', NULL,
      'tiempo_estimado_minutos', 0,
      'maquina_asignada', NULL,
      'area_trabajo_codigo', linea.area_trabajo_codigo,
      'procesos', to_jsonb(linea.procesos),
      'es_externo', linea.es_externo,
      'proveedor_externo', CASE
        WHEN linea.es_externo THEN linea.proveedor_externo
        ELSE NULL
      END
    )
    ORDER BY linea.orden, linea.id
  )
  INTO v_partidas
  FROM public.cotizacion_lineas AS linea
  WHERE linea.pipeline_id = p_pipeline_id
    AND linea.es_descuento = false;

  IF v_partidas IS NULL OR jsonb_array_length(v_partidas) = 0 THEN
    RAISE EXCEPTION 'cotizacion_sin_lineas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT creada.id, creada.folio
  INTO v_orden_id, v_folio
  FROM public.crear_orden_produccion(
    p_cliente_id,
    p_pipeline_id,
    p_fecha_compromiso,
    coalesce(v_prioridad, 'normal'),
    v_partidas
  ) AS creada;

  -- La OP hereda la condición interna de la oportunidad de origen.
  IF coalesce(v_es_interna, false) THEN
    UPDATE public.ordenes_produccion
    SET es_interna = true
    WHERE ordenes_produccion.id = v_orden_id;
  END IF;

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera una orden desde sus líneas fabricables (excluye descuentos, hereda área/externo y la condición interna/TI) y marca ganada en una transacción. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Dashboard ejecutivo: el total cotizado resta los descuentos.
--    Base: 20260916000002 (superset de 20260916000001). Solo cambia el importe
--    de las CTE `cotizado` (periodo actual y anterior): una línea de descuento
--    se captura en positivo y aquí se aplica con signo negativo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_metricas_dashboard_ejecutivo(
  p_fecha_inicio timestamptz,
  p_fecha_fin timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_duracion interval;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_ahora timestamptz := now();
  v_actual jsonb;
  v_anterior jsonb;
BEGIN
  IF p_fecha_inicio IS NULL
     OR p_fecha_fin IS NULL
     OR p_fecha_inicio >= p_fecha_fin
     OR p_fecha_fin - p_fecha_inicio > interval '366 days' THEN
    RAISE EXCEPTION 'rango_dashboard_invalido' USING ERRCODE = 'check_violation';
  END IF;

  v_duracion := p_fecha_fin - p_fecha_inicio;
  v_anterior_fin := p_fecha_inicio;
  v_anterior_inicio := p_fecha_inicio - v_duracion;

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= p_fecha_inicio
      AND cuenta.fecha_emision < p_fecha_fin
  ), cotizado AS (
    -- Excluye trabajos internos: no son venta/cotizado comercial (DAS-01).
    -- El descuento (RFQ-03) viene en positivo y aquí se resta del cotizado.
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= p_fecha_inicio
      AND pipeline.creado_en < p_fecha_fin
      AND pipeline.es_orden_interna = false
  ), respuesta AS (
    SELECT
      AVG(EXTRACT(EPOCH FROM (p.fecha_envio_cotizacion - p.creado_en))::numeric / 3600.0)
        FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
          AND p.fecha_envio_cotizacion >= p.creado_en) AS horas_promedio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en) AS con_envio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en
        AND p.fecha_envio_cotizacion - p.creado_en <= interval '24 hours') AS respondidas_24h
    FROM public.pipeline AS p
    WHERE p.creado_en >= p_fecha_inicio
      AND p.creado_en < p_fecha_fin
      AND p.es_orden_interna = false
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= p_fecha_inicio
      AND orden.creado_en < p_fecha_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= p_fecha_inicio AND consumo.creado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= p_fecha_inicio AND sesion.actualizado_en < p_fecha_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin), 0)::numeric AS gastos_total
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
      'totalCotizado', round(cotizado.monto, 4),
      'porcentajeConversion', CASE WHEN cotizado.oportunidades > 0
        THEN round(cotizado.ganadas::numeric / cotizado.oportunidades * 100, 4) ELSE 0 END,
      'tiempoRespuestaHorasPromedio', round(COALESCE(respuesta.horas_promedio, 0), 4),
      'porcentajeRespondidas24h', CASE WHEN respuesta.con_envio > 0
        THEN round(respuesta.respondidas_24h::numeric / respuesta.con_envio * 100, 4) ELSE 0 END
    ),
    'ordenes', jsonb_build_object(
      'activas', ordenes.activas,
      'completadas', ordenes.completadas,
      'aprobacionesPendientes', ordenes.aprobaciones_pendientes,
      'internas', ordenes.internas,
      'atrasadas', ordenes.atrasadas,
      'enRiesgo', ordenes.en_riesgo
    ),
    'finanzas', jsonb_build_object(
      'arPendiente', round(finanzas.ar_pendiente, 4),
      'arVencido', round(finanzas.ar_vencido, 4),
      'cxpPendiente', round(finanzas.cxp_pendiente, 4),
      'gastosTotal', round(finanzas.gastos_total, 4),
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
    ),
    'distribucionGastoPorCategoria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('categoria', d.categoria, 'montoMxn', round(d.monto, 4))
        ORDER BY d.monto DESC
      )
      FROM (
        SELECT gasto.categoria AS categoria,
          SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END) AS monto
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= p_fecha_inicio AND gasto.fecha_gasto < p_fecha_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  INTO v_actual
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;

  WITH ingresos AS (
    SELECT COALESCE(SUM(
      CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.monto_total
           ELSE cuenta.monto_total * cuenta.tipo_cambio_origen END
    ), 0)::numeric AS monto
    FROM public.cuentas_por_cobrar AS cuenta
    WHERE cuenta.estado <> 'cancelado'
      AND cuenta.fecha_emision >= v_anterior_inicio
      AND cuenta.fecha_emision < v_anterior_fin
  ), cotizado AS (
    -- El descuento (RFQ-03) viene en positivo y aquí se resta del cotizado.
    SELECT COALESCE(SUM(CASE WHEN linea.es_descuento THEN -linea.cantidad * linea.precio_unitario ELSE linea.cantidad * linea.precio_unitario END), 0)::numeric AS monto,
      COUNT(DISTINCT pipeline.id)::integer AS oportunidades,
      COUNT(DISTINCT pipeline.id) FILTER (WHERE pipeline.etapa = 'ganada')::integer AS ganadas
    FROM public.pipeline AS pipeline
    LEFT JOIN public.cotizacion_lineas AS linea ON linea.pipeline_id = pipeline.id
    WHERE pipeline.creado_en >= v_anterior_inicio
      AND pipeline.creado_en < v_anterior_fin
      AND pipeline.es_orden_interna = false
  ), respuesta AS (
    SELECT
      AVG(EXTRACT(EPOCH FROM (p.fecha_envio_cotizacion - p.creado_en))::numeric / 3600.0)
        FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
          AND p.fecha_envio_cotizacion >= p.creado_en) AS horas_promedio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en) AS con_envio,
      COUNT(*) FILTER (WHERE p.fecha_envio_cotizacion IS NOT NULL
        AND p.fecha_envio_cotizacion >= p.creado_en
        AND p.fecha_envio_cotizacion - p.creado_en <= interval '24 hours') AS respondidas_24h
    FROM public.pipeline AS p
    WHERE p.creado_en >= v_anterior_inicio
      AND p.creado_en < v_anterior_fin
      AND p.es_orden_interna = false
  ), ordenes AS (
    SELECT
      COUNT(*) FILTER (WHERE orden.estado IN ('programada', 'en_proceso', 'pausada'))::integer AS activas,
      COUNT(*) FILTER (WHERE orden.estado = 'completada')::integer AS completadas,
      COUNT(*) FILTER (WHERE orden.estado = 'borrador')::integer AS aprobaciones_pendientes,
      COUNT(*) FILTER (WHERE orden.es_interna)::integer AS internas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso < v_ahora
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS atrasadas,
      COUNT(*) FILTER (
        WHERE orden.fecha_compromiso >= v_ahora
          AND orden.fecha_compromiso < v_ahora + interval '3 days'
          AND orden.estado IN ('borrador', 'programada', 'en_proceso', 'pausada')
      )::integer AS en_riesgo
    FROM public.ordenes_produccion AS orden
    WHERE orden.creado_en >= v_anterior_inicio
      AND orden.creado_en < v_anterior_fin
  ), costos AS (
    SELECT
      (SELECT COALESCE(SUM((consumo.cantidad_usada + consumo.cantidad_scrap)
        * consumo.costo_unitario_momento), 0)
       FROM public.registros_consumo_material AS consumo
       WHERE consumo.creado_en >= v_anterior_inicio AND consumo.creado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(sesion.horas_netas * sesion.costo_hora_interno), 0)
         FROM public.sesiones_trabajo AS sesion
         WHERE sesion.estado_sesion IN ('pausada', 'finalizada')
           AND sesion.actualizado_en >= v_anterior_inicio AND sesion.actualizado_en < v_anterior_fin)
      + (SELECT COALESCE(SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END), 0)
         FROM public.gastos AS gasto
         WHERE gasto.estado_pago <> 'cancelado'
           AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin)
      AS monto
  ), finanzas AS (
    SELECT
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')), 0)::numeric AS ar_pendiente,
      COALESCE((SELECT SUM(CASE WHEN cuenta.moneda = 'MXN' THEN cuenta.saldo_pendiente
        ELSE cuenta.saldo_pendiente * cuenta.tipo_cambio_origen END)
        FROM public.cuentas_por_cobrar AS cuenta
        WHERE cuenta.estado IN ('pendiente', 'parcial')
          AND cuenta.fecha_vencimiento < v_ahora), 0)::numeric AS ar_vencido,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago = 'pendiente'), 0)::numeric AS cxp_pendiente,
      COALESCE((SELECT SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END)
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin), 0)::numeric AS gastos_total
  )
  SELECT jsonb_build_object(
    'ventas', jsonb_build_object(
      'totalFacturado', round(ingresos.monto, 4),
      'totalCotizado', round(cotizado.monto, 4),
      'porcentajeConversion', CASE WHEN cotizado.oportunidades > 0
        THEN round(cotizado.ganadas::numeric / cotizado.oportunidades * 100, 4) ELSE 0 END,
      'tiempoRespuestaHorasPromedio', round(COALESCE(respuesta.horas_promedio, 0), 4),
      'porcentajeRespondidas24h', CASE WHEN respuesta.con_envio > 0
        THEN round(respuesta.respondidas_24h::numeric / respuesta.con_envio * 100, 4) ELSE 0 END
    ),
    'ordenes', jsonb_build_object(
      'activas', ordenes.activas,
      'completadas', ordenes.completadas,
      'aprobacionesPendientes', ordenes.aprobaciones_pendientes,
      'internas', ordenes.internas,
      'atrasadas', ordenes.atrasadas,
      'enRiesgo', ordenes.en_riesgo
    ),
    'finanzas', jsonb_build_object(
      'arPendiente', round(finanzas.ar_pendiente, 4),
      'arVencido', round(finanzas.ar_vencido, 4),
      'cxpPendiente', round(finanzas.cxp_pendiente, 4),
      'gastosTotal', round(finanzas.gastos_total, 4),
      'utilidadNetaAcumulada', round(ingresos.monto - costos.monto, 4),
      'margenPromedioPorcentaje', CASE WHEN ingresos.monto > 0
        THEN round((ingresos.monto - costos.monto) / ingresos.monto * 100, 4) ELSE NULL END
    ),
    'distribucionGastoPorCategoria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('categoria', d.categoria, 'montoMxn', round(d.monto, 4))
        ORDER BY d.monto DESC
      )
      FROM (
        SELECT gasto.categoria AS categoria,
          SUM(gasto.monto_total * CASE WHEN gasto.moneda = 'MXN' THEN 1 ELSE gasto.tipo_cambio END) AS monto
        FROM public.gastos AS gasto
        WHERE gasto.estado_pago <> 'cancelado'
          AND gasto.fecha_gasto >= v_anterior_inicio AND gasto.fecha_gasto < v_anterior_fin
        GROUP BY gasto.categoria
      ) AS d
    ), '[]'::jsonb)
  )
  INTO v_anterior
  FROM ingresos, cotizado, respuesta, ordenes, costos, finanzas;

  RETURN jsonb_build_object(
    'version', 1,
    'periodo', jsonb_build_object(
      'inicio', p_fecha_inicio,
      'fin', p_fecha_fin,
      'anteriorInicio', v_anterior_inicio,
      'anteriorFin', v_anterior_fin
    ),
    'actual', v_actual,
    'anterior', v_anterior,
    'generadoEn', now()
  );
END;
$$;

COMMENT ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz) IS
  'Ventas comerciales (excluye trabajos internos), tiempo de respuesta y %<=24h, órdenes (incl. conteo de internas TI), finanzas con gasto del periodo y distribución por categoría, en MXN, para el intervalo y su periodo anterior.';

REVOKE EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_dashboard_ejecutivo(timestamptz, timestamptz)
  TO service_role;
