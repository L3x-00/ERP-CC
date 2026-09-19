-- =============================================================================
-- Cobertura funcional 2026-09-13 — Guardado atómico de cotización.
--
-- Problema corregido:
--   `crearCotizacionAccion` / `actualizarCotizacionAccion` hacían DELETE + INSERT
--   en dos viajes PostgREST separados. Un fallo del INSERT (o una desconexión
--   entre ambos) dejaba la oportunidad SIN líneas: pérdida silenciosa de la
--   cotización. Tampoco había compare-and-set, así que dos pantallas abiertas se
--   sobrescribían entre sí (lost update), ni bloqueo frente a la aprobación
--   (`aprobar_oportunidad_y_crear_orden` lee `cotizacion_lineas` para fabricar
--   las partidas de la OP: reemplazarlas durante la aprobación producía una OP
--   incoherente con la cotización aceptada).
--
-- Diseño:
--   - Una sola RPC transaccional reemplaza el juego completo de líneas.
--   - SECURITY DEFINER porque debe bloquear la oportunidad (`FOR UPDATE`) y
--     escribir sus líneas como una unidad, con la identidad y los permisos
--     verificados DENTRO de la función; `search_path` vacío y todo calificado.
--   - La identidad NO se recibe por parámetro: se toma de `auth.uid()`, para que
--     un llamador no pueda declarar ser otro vendedor.
--   - Autorización equivalente a la RLS vigente de `pipeline`: dueño de la
--     oportunidad, admin o permiso `ver_pipeline_equipo`; siempre usuario activo.
--   - La escritura directa de `cotizacion_lineas` deja de estar disponible para
--     `authenticated`: esta RPC es el único camino de edición desde la app.
-- =============================================================================

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
  SELECT oportunidad.vendedor_id, oportunidad.etapa, oportunidad.actualizado_en
  INTO v_vendedor_id, v_etapa, v_actualizado_en
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

COMMENT ON FUNCTION public.guardar_cotizacion_atomica(uuid, jsonb, timestamptz) IS
  'Reemplaza las líneas de cotización de una oportunidad en una transacción, con identidad auth.uid(), autorización equivalente a la RLS de pipeline, etapa abierta y compare-and-set opcional por actualizado_en.';

-- Grants exactos: la ejecuta el usuario autenticado (la función resuelve su
-- identidad y sus permisos). `anon` y `service_role` no la necesitan —
-- service_role escribe las líneas directamente en semillas y no tiene auth.uid().
REVOKE ALL ON FUNCTION public.guardar_cotizacion_atomica(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_cotizacion_atomica(uuid, jsonb, timestamptz)
  TO authenticated;

-- La app ya no escribe líneas por PostgREST: sin este REVOKE, cualquier cliente
-- autenticado podría repetir el DELETE/INSERT no atómico que esta RPC sustituye
-- (y saltarse etapa editable, token de concurrencia y bloqueo por OP existente).
-- Las políticas RLS se conservan: son la segunda línea de defensa si alguna vez
-- se vuelve a otorgar el privilegio.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cotizacion_lineas FROM authenticated;

-- =============================================================================
-- Verificación local sugerida (NO se ejecuta aquí ni contra el remoto).
-- Requiere una base local con el esquema completo; correr en una transacción y
-- terminar con ROLLBACK.
--
--   BEGIN;
--   -- 1. Sin identidad (sin JWT): cotizacion_sin_identidad.
--   SELECT public.guardar_cotizacion_atomica(
--     '00000000-0000-4000-8000-000000000000'::uuid, '[]'::jsonb);
--
--   -- 2. Con JWT del vendedor dueño (set_config('request.jwt.claims', ...)):
--   --    a) líneas válidas → lineas_guardadas = n y actualizado_en nuevo;
--   --    b) repetir con el actualizado_en ANTERIOR → cotizacion_conflicto;
--   --    c) etapa 'ganada' o 'perdida' → cotizacion_no_editable;
--   --    d) OP con cotizacion_id = pipeline → cotizacion_con_orden;
--   --    e) cantidad 0 / precio negativo / procesos no textuales →
--   --       cotizacion_lineas_invalidas y las líneas previas intactas;
--   --    f) otro vendedor sin 'ver_pipeline_equipo' →
--   --       usuario_sin_acceso_oportunidad;
--   --    g) cantidad con 3 decimales o precio/área con 5 →
--   --       cotizacion_lineas_invalidas (no se redondea en silencio).
--   -- 3. Con rol authenticated, INSERT/UPDATE/DELETE directo sobre
--   --    public.cotizacion_lineas debe fallar por privilegios.
--   ROLLBACK;
-- =============================================================================
