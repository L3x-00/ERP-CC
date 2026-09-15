-- Datos técnicos aditivos; las líneas anteriores permanecen sin instantánea.
ALTER TABLE public.cotizacion_lineas ADD COLUMN IF NOT EXISTS calculo_tecnico jsonb;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cotizacion_calculo_tecnico_formato' AND conrelid='public.cotizacion_lineas'::regclass) THEN
  ALTER TABLE public.cotizacion_lineas ADD CONSTRAINT cotizacion_calculo_tecnico_formato CHECK (
    calculo_tecnico IS NULL OR (jsonb_typeof(calculo_tecnico)='object' AND (calculo_tecnico->'version' IS NOT DISTINCT FROM '1'::jsonb) AND octet_length(calculo_tecnico::text)<=32768)
  );
 END IF;
END $$;
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
  ) THEN
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
