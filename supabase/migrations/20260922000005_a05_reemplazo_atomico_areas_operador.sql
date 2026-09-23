-- =============================================================================
-- A05 — Reemplazo atómico de las áreas habilitadas de un operador.
--
-- Hallazgo (auditoría global 2026-09-22): el servicio borraba
-- `operadores_areas` y después insertaba. Con la entrada `ACABADOS/acabados`
-- (duplicados tras normalizar) el DELETE ya había ocurrido cuando el INSERT
-- falló: el operador quedaba con CERO áreas y, por tanto, SIN restricción en el
-- helper de piso. Un error de guardado ampliaba permisos.
--
-- Reglas de esta migración:
--   1. Una sola RPC `SECURITY DEFINER` con `search_path` vacío hace todo el
--      reemplazo dentro de una transacción: ante cualquier fallo se revierte y
--      la configuración anterior sobrevive intacta.
--   2. El actor debe ser admin activo o tener el permiso `configuracion`; el
--      operador debe existir, tener rol `operador` y estar activo.
--   3. Los códigos se normalizan (`btrim` + `upper`) y se validan TODOS antes
--      de escribir: NULL, formato inválido, duplicados tras normalizar e
--      inexistentes/inactivos del catálogo rechazan la operación completa.
--   4. Serialización por operador ANTES del DELETE/INSERT: se toma
--      `FOR NO KEY UPDATE` sobre la fila del operador, así dos ediciones
--      simultáneas se ordenan y cada una deja su conjunto COMPLETO (nunca una
--      mezcla de ambas ni un conjunto vacío). `FOR NO KEY UPDATE` no entra en
--      conflicto con el `FOR KEY SHARE` que toman las RPC de piso sobre
--      `usuarios`, así que la configuración no bloquea la operación.
--      No se introduce control de versión optimista (CAS) en la UI: la regla
--      del contrato es "gana la última escritura serializada", que queda
--      documentada en docs/cierre-auditoria-2026-09-22/A05-A06.md.
--   5. La lista VACÍA sigue siendo válida y explícita (contrato de transición:
--      operador sin filas = sin restricción). Lo que deja de ocurrir es llegar
--      a esa lista vacía por un fallo a mitad del guardado.
--
-- Aditiva e idempotente. No cambia RLS ni los grants de la tabla; la RPC es
-- exclusiva de `service_role`. La aplica el PO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reemplazar_areas_operador(
  p_operador_id uuid,
  p_areas text[],
  p_actor_id uuid
)
RETURNS TABLE (area_codigo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalizadas text[];
  v_total integer;
BEGIN
  -- `p_areas` NULL no es "lista vacía": es una entrada rota y se rechaza.
  IF p_operador_id IS NULL OR p_actor_id IS NULL OR p_areas IS NULL THEN
    RAISE EXCEPTION 'areas_operador_entrada_invalida' USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Actor autorizado. El service role no basta: la acción viaja siempre con
  --    el usuario que la pidió y ese usuario debe poder configurar.
  PERFORM 1
  FROM public.usuarios AS actor
  WHERE actor.id = p_actor_id
    AND actor.activo = true
    AND (
      actor.rol = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.permisos_rol AS permiso
        WHERE permiso.rol = actor.rol
          AND permiso.permiso = 'configuracion'
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actor_no_autorizado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Serialización por operador antes de cualquier escritura.
  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Normalización y validación COMPLETA antes de tocar `operadores_areas`.
  IF EXISTS (
    SELECT 1 FROM unnest(p_areas) AS entrada(codigo) WHERE entrada.codigo IS NULL
  ) THEN
    RAISE EXCEPTION 'area_codigo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(array_agg(upper(btrim(entrada.codigo)) ORDER BY upper(btrim(entrada.codigo))), ARRAY[]::text[])
  INTO v_normalizadas
  FROM unnest(p_areas) AS entrada(codigo);

  v_total := coalesce(array_length(v_normalizadas, 1), 0);

  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalizadas) AS normalizada(codigo)
    WHERE normalizada.codigo !~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ) THEN
    RAISE EXCEPTION 'area_codigo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  -- `ACABADOS` y `acabados` son el mismo código: se rechaza en vez de insertar
  -- dos filas con la misma clave primaria (que es lo que vaciaba la asignación).
  IF (
    SELECT count(DISTINCT normalizada.codigo)::integer
    FROM unnest(v_normalizadas) AS normalizada(codigo)
  ) <> v_total THEN
    RAISE EXCEPTION 'areas_duplicadas' USING ERRCODE = 'unique_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_normalizadas) AS normalizada(codigo)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.areas_trabajo_config AS area
      WHERE area.codigo = normalizada.codigo
        AND area.activo = true
    )
  ) THEN
    RAISE EXCEPTION 'area_inexistente_o_inactiva' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 4. Reemplazo. Todo lo anterior ya validó; si algo fallara aquí, la
  --    transacción revierte y la asignación previa queda intacta.
  DELETE FROM public.operadores_areas AS asignada
  WHERE asignada.operador_id = p_operador_id;

  IF v_total > 0 THEN
    INSERT INTO public.operadores_areas (operador_id, area_codigo, creado_por)
    SELECT p_operador_id, normalizada.codigo, p_actor_id
    FROM unnest(v_normalizadas) AS normalizada(codigo);
  END IF;

  RETURN QUERY
  SELECT asignada.area_codigo
  FROM public.operadores_areas AS asignada
  WHERE asignada.operador_id = p_operador_id
  ORDER BY asignada.area_codigo;
END;
$$;

COMMENT ON FUNCTION public.reemplazar_areas_operador(uuid, text[], uuid) IS
  'A05/OBS-09: reemplazo atómico de las áreas habilitadas de un operador. Valida actor, operador y todos los códigos antes de escribir; serializa por operador y conserva la asignación previa ante cualquier fallo. Gana la última escritura serializada.';

REVOKE EXECUTE ON FUNCTION public.reemplazar_areas_operador(uuid, text[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_areas_operador(uuid, text[], uuid)
  TO service_role;
