-- =============================================================================
-- C13.2 - Retrabajo declarado por el operador al cerrar la sesión.
--
-- El retrabajo es trabajo extra con material de la empresa: descuenta inventario
-- con costo CPP y queda en un registro propio, sin mover el avance declarado ni
-- las metas del ítem. Visible para administración en Producción.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.retrabajos_produccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL
    REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  partida_id uuid NOT NULL
    REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  sesion_id uuid
    REFERENCES public.sesiones_trabajo (id) ON DELETE SET NULL,
  material_id uuid NOT NULL
    REFERENCES public.materiales (id) ON DELETE RESTRICT,
  cantidad_usada numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_usada >= 0),
  cantidad_scrap numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_scrap >= 0),
  minutos numeric(10, 2) NOT NULL CHECK (minutos > 0 AND minutos <= 1440),
  causa text NOT NULL CHECK (causa IN ('operador', 'cliente', 'material', 'otro')),
  motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 300),
  notas text,
  costo_unitario_momento numeric(14, 4) NOT NULL CHECK (costo_unitario_momento >= 0),
  movimiento_inventario_id uuid,
  registrado_por uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retrabajos_produccion_cantidad_positiva
    CHECK ((cantidad_usada + cantidad_scrap) > 0)
);

COMMENT ON TABLE public.retrabajos_produccion IS
  'C13.2: trabajo extra (retrabajo) con material real, tiempo y causa; no altera el avance declarado.';
COMMENT ON COLUMN public.retrabajos_produccion.causa IS
  'operador = error de fabricación; cliente = cambio/error del cliente; material = defecto del material; otro.';

CREATE INDEX IF NOT EXISTS idx_retrabajos_produccion_orden
  ON public.retrabajos_produccion (orden_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_retrabajos_produccion_partida
  ON public.retrabajos_produccion (partida_id, creado_en DESC);

ALTER TABLE public.retrabajos_produccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retrabajos_produccion_seleccionar
  ON public.retrabajos_produccion;
CREATE POLICY retrabajos_produccion_seleccionar
  ON public.retrabajos_produccion FOR SELECT TO authenticated
  USING (
    (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

REVOKE ALL PRIVILEGES ON TABLE public.retrabajos_produccion FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.retrabajos_produccion TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.retrabajos_produccion TO service_role;

-- -----------------------------------------------------------------------------
-- Registro del retrabajo: consume inventario propio y guarda el snapshot de costo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_retrabajo_sesion(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_minutos numeric,
  p_causa text,
  p_motivo text,
  p_notas text,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_material public.materiales%ROWTYPE;
  v_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_movimiento_id uuid;
  v_retrabajo_id uuid;
BEGIN
  IF p_sesion_id IS NULL OR p_actor_id IS NULL OR p_material_id IS NULL THEN
    RAISE EXCEPTION 'retrabajo_invalido' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cantidad_usada IS NULL OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0 OR p_cantidad_scrap < 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_retrabajo_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF p_minutos IS NULL OR p_minutos <= 0 OR p_minutos > 1440 THEN
    RAISE EXCEPTION 'minutos_retrabajo_invalidos' USING ERRCODE = 'check_violation';
  END IF;
  IF p_causa NOT IN ('operador', 'cliente', 'material', 'otro') THEN
    RAISE EXCEPTION 'causa_retrabajo_invalida' USING ERRCODE = 'check_violation';
  END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'motivo_retrabajo_requerido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- Solo el operador dueño de la sesión o quien gestiona producción.
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;

  -- Se declara al cerrar: se admite la sesión activa o recién finalizada.
  IF v_sesion.estado_sesion <> 'activa'
     AND (v_sesion.estado_sesion <> 'finalizada'
          OR v_sesion.fecha_fin IS NULL
          OR v_sesion.fecha_fin < now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_material
  FROM public.materiales AS material
  WHERE material.id = p_material_id
  FOR UPDATE;

  IF NOT FOUND OR v_material.stock_actual_control < v_total THEN
    RAISE EXCEPTION 'stock_insuficiente' USING ERRCODE = 'check_violation';
  END IF;

  v_movimiento_id := public.registrar_movimiento_inventario(
    p_material_id,
    'salida_produccion',
    'SAL',
    v_total,
    v_material.costo_unitario_control,
    NULL,
    v_sesion.orden_id,
    NULL,
    'RETRABAJO-OP',
    'Retrabajo de la partida ' || v_sesion.partida_id::text
  );

  INSERT INTO public.retrabajos_produccion (
    orden_id, partida_id, sesion_id, material_id, cantidad_usada, cantidad_scrap,
    minutos, causa, motivo, notas, costo_unitario_momento, movimiento_inventario_id,
    registrado_por
  ) VALUES (
    v_sesion.orden_id, v_sesion.partida_id, v_sesion.id, p_material_id,
    p_cantidad_usada, p_cantidad_scrap, p_minutos, p_causa, btrim(p_motivo),
    nullif(btrim(coalesce(p_notas, '')), ''), v_material.costo_unitario_control,
    v_movimiento_id, p_actor_id
  )
  RETURNING retrabajos_produccion.id INTO v_retrabajo_id;

  RETURN QUERY
  SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id, retrabajo.material_id,
    retrabajo.cantidad_usada, retrabajo.cantidad_scrap, retrabajo.minutos,
    retrabajo.causa, retrabajo.motivo, retrabajo.creado_en
  FROM public.retrabajos_produccion AS retrabajo
  WHERE retrabajo.id = v_retrabajo_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_retrabajo_sesion(uuid, uuid, numeric, numeric, numeric, text, text, text, uuid) IS
  'C13.2: registra un retrabajo con salida de inventario y costo CPP; no altera el avance. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_retrabajo_sesion(uuid, uuid, numeric, numeric, numeric, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_retrabajo_sesion(uuid, uuid, numeric, numeric, numeric, text, text, text, uuid)
  TO service_role;
