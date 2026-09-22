-- OBS-04 · Equipo/estación por línea de cotización.
--
-- El vendedor puede indicar, por cada solicitud/línea, el equipo o estación de
-- taller que atenderá el trabajo. El valor es el `codigo` del recurso de
-- Planeación (mismo catálogo que usa la capacidad) y se hereda a la partida en
-- `partidas_orden_produccion.maquina_asignada`, de modo que Comercial,
-- Planeación y Producción hablan del mismo equipo.
--
-- Reglas:
--   1. `estacion_codigo` es opcional (NULL = "Por definir").
--   2. Si viene, debe existir en `recursos_planeacion` (activo o no: una
--      cotización histórica no se invalida si después desactivan el equipo).
--      La UI solo ofrece los activos.
--   3. La línea de descuento no lleva datos de producción: se rechaza igual que
--      área, procesos o externo.
--
-- Aditiva e idempotente: solo agrega una columna y recrea dos RPC ya existentes
-- con su misma firma, sin tocar datos históricos.

ALTER TABLE public.cotizacion_lineas
  ADD COLUMN IF NOT EXISTS estacion_codigo text;

COMMENT ON COLUMN public.cotizacion_lineas.estacion_codigo IS
  'OBS-04: código del recurso de Planeación (equipo/estación) que atenderá la línea; NULL = por definir.';

-- -----------------------------------------------------------------------------
-- 1. Guardado atómico: persiste y valida `estacion_codigo`.
--    Base: 20260916000005 (área/externo/descuento). Identidad, lock,
--    compare-and-set y validaciones quedan igual.
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
       -- OBS-04: equipo/estación por línea, contra el catálogo de recursos de
       -- Planeación (exista, activo o no, por la misma razón que el área).
       OR jsonb_typeof(coalesce(entrada.linea -> 'estacion_codigo', 'null'::jsonb)) NOT IN ('string', 'null')
       OR char_length(btrim(coalesce(entrada.linea ->> 'estacion_codigo', ''))) > 60
       OR (
            nullif(btrim(coalesce(entrada.linea ->> 'estacion_codigo', '')), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.recursos_planeacion AS recurso
              WHERE recurso.codigo = btrim(entrada.linea ->> 'estacion_codigo')
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
    estacion_codigo,
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
    nullif(btrim(coalesce(entrada.linea ->> 'estacion_codigo', '')), ''),
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
-- 2. Aprobación comercial: la estación de la línea viaja a la partida como
--    `maquina_asignada`, sin alterar ninguna otra regla (D-04 incluida).
--    Base: 20260919000005.
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
  -- D-04: importe comercial congelado en la AR no cobrable.
  v_iva_porcentaje numeric(4, 2);
  v_moneda text;
  v_bruto numeric(18, 4);
  v_descuento numeric(18, 4);
  v_base numeric(18, 4);
  v_iva numeric(18, 4);
  v_total numeric(18, 4);
  v_tipo_cambio numeric(10, 4);
BEGIN
  IF p_fecha_compromiso IS NULL THEN
    RAISE EXCEPTION 'fecha_compromiso_requerida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT etapa, prioridad, es_orden_interna, iva_porcentaje, moneda
  INTO v_etapa, v_prioridad, v_es_interna, v_iva_porcentaje, v_moneda
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
      -- OBS-04: el equipo/estación capturado en la cotización se hereda.
      'maquina_asignada', nullif(btrim(coalesce(linea.estacion_codigo, '')), ''),
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

  -- D-04: la AR puede nacer al aprobar, pero nace NO cobrable. Se activa al
  -- archivar la orden por entrega total (OBS-21). El importe usa las mismas
  -- reglas del documento comercial (descuento restado, IVA de la oportunidad)
  -- y la moneda/TC vigentes quedan congelados en la cuenta. Una cuenta fuera
  -- del rango de numeric(12,4) se omite igual que antes de D-04: la orden no
  -- se bloquea por un importe que el esquema de cobranza no admite.
  IF NOT coalesce(v_es_interna, false) THEN
    SELECT
      coalesce(sum(CASE WHEN linea.es_descuento THEN 0 ELSE linea.cantidad * linea.precio_unitario END), 0),
      coalesce(sum(CASE WHEN linea.es_descuento THEN linea.cantidad * linea.precio_unitario ELSE 0 END), 0)
    INTO v_bruto, v_descuento
    FROM public.cotizacion_lineas AS linea
    WHERE linea.pipeline_id = p_pipeline_id;

    v_base := round(v_bruto - v_descuento, 2);
    v_iva := round(v_base * coalesce(v_iva_porcentaje, 16) / 100, 2);
    v_total := round(v_base + v_iva, 2);

    IF v_total > 0 AND v_total <= 99999999.9999 THEN
      SELECT config.tipo_cambio_usd
      INTO v_tipo_cambio
      FROM public.configuracion_sistema AS config
      LIMIT 1;

      IF v_moneda = 'USD' AND (v_tipo_cambio IS NULL OR v_tipo_cambio <= 0) THEN
        RAISE EXCEPTION 'tipo_cambio_usd_requerido' USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.cuentas_por_cobrar (
        orden_id, cliente_id, monto_total, saldo_pendiente, moneda,
        tipo_cambio_origen, estado, fecha_vencimiento, cobrable_desde
      ) VALUES (
        v_orden_id, p_cliente_id, round(v_total, 4), round(v_total, 4),
        CASE WHEN v_moneda = 'USD' THEN 'USD' ELSE 'MXN' END,
        CASE WHEN v_moneda = 'USD' THEN round(v_tipo_cambio, 4) ELSE 1 END,
        'pendiente', NULL, NULL
      );
    END IF;
  END IF;

  UPDATE public.pipeline
  SET etapa = 'ganada', cliente_id = p_cliente_id
  WHERE pipeline.id = p_pipeline_id;

  RETURN QUERY SELECT v_orden_id, v_folio, false;
END;
$$;

COMMENT ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz) IS
  'Bloquea Pipeline, genera la orden desde sus líneas fabricables (heredando equipo/estación OBS-04) y le crea la AR no cobrable con el total comercial (D-04); excluye TI. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_oportunidad_y_crear_orden(uuid, uuid, timestamptz)
  TO service_role;
