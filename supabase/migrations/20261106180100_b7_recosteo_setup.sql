-- =============================================================================
-- B7 - Recosteo controlado de consumos y setup identificable
-- Documento de aclaraciones 06/11/2026:
--   * Sección 2: administración puede sustituir el costo provisional por el
--     comprobado, sin sumar dos veces el mismo consumo.
--   * Sección 4: en doblado individual se identifica el setup cuando aplique;
--     si es compartido se registra una sola vez como costo de la operación.
--
-- Decisiones de implementación:
--   * El recosteo NO crea consumos nuevos: actualiza el costo congelado de los
--     consumos ya registrados y deja auditoría append-only con el detalle.
--   * `minutos_setup` identifica la parte del tiempo real de la sesión que fue
--     setup. No se suma otra vez al costo: `horas_netas` ya contiene ese tiempo.
--   * Solo service_role ejecuta las RPC; la Server Action exige
--     `gestionar_inventario` (administración) y motivo obligatorio.
--
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Setup identificable en la sesión (no duplica el costo de la sesión).
-- -----------------------------------------------------------------------------
ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS minutos_setup numeric(8, 2);

DO $b7_setup_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sesiones_trabajo'::regclass
      AND conname = 'sesiones_trabajo_minutos_setup_validos'
  ) THEN
    ALTER TABLE public.sesiones_trabajo
      ADD CONSTRAINT sesiones_trabajo_minutos_setup_validos
      CHECK (minutos_setup IS NULL OR (minutos_setup >= 0 AND minutos_setup <= 1440));
  END IF;
END;
$b7_setup_check$;

COMMENT ON COLUMN public.sesiones_trabajo.minutos_setup IS
  'B7: minutos de setup identificados dentro del tiempo real de la sesión. No se suman otra vez al costo.';

CREATE OR REPLACE FUNCTION public.registrar_setup_sesion_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_minutos_setup numeric
)
RETURNS TABLE (
  sesion_id uuid,
  minutos_setup numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_elapsed_minutes numeric;
  v_minutos numeric := round(coalesce(p_minutos_setup, -1), 2);
BEGIN
  IF p_sesion_id IS NULL OR p_operador_id IS NULL
     OR v_minutos IS NULL OR v_minutos < 0 OR v_minutos > 1440 THEN
    RAISE EXCEPTION 'setup_invalido' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND OR v_sesion.estado_sesion <> 'activa' THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = '23514';
  END IF;
  IF v_sesion.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'sin_permiso_setup' USING ERRCODE = '42501';
  END IF;

  v_elapsed_minutes := greatest(
    extract(epoch FROM (now() - v_sesion.fecha_inicio)) / 60,
    0
  );
  IF v_minutos > v_elapsed_minutes + 0.01 THEN
    RAISE EXCEPTION 'minutos_setup_exceden_sesion' USING ERRCODE = '23514';
  END IF;

  UPDATE public.sesiones_trabajo AS sesion
  SET minutos_setup = v_minutos,
      actualizado_en = now()
  WHERE sesion.id = p_sesion_id
  RETURNING sesion.id, sesion.minutos_setup, sesion.actualizado_en
  INTO sesion_id, minutos_setup, actualizado_en;

  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.registrar_setup_sesion_operador(uuid, uuid, numeric) IS
  'B7: identifica los minutos de setup dentro del tiempo real de la sesión del operador.';

REVOKE ALL ON FUNCTION public.registrar_setup_sesion_operador(uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_setup_sesion_operador(uuid, uuid, numeric)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Auditoría append-only del recosteo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recosteo_consumos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL UNIQUE,
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  costo_nuevo_mxn numeric(14, 4) NOT NULL CHECK (costo_nuevo_mxn >= 0),
  costo_origen_nuevo numeric(14, 4) NOT NULL CHECK (costo_origen_nuevo >= 0),
  moneda_costo text NOT NULL CHECK (moneda_costo IN ('MXN', 'USD')),
  tipo_cambio numeric(14, 4) NOT NULL CHECK (tipo_cambio > 0),
  consumos_actualizados integer NOT NULL DEFAULT 0 CHECK (consumos_actualizados >= 0),
  retrabajos_actualizados integer NOT NULL DEFAULT 0 CHECK (retrabajos_actualizados >= 0),
  importe_anterior_total numeric(24, 4) NOT NULL DEFAULT 0,
  importe_nuevo_total numeric(24, 4) NOT NULL DEFAULT 0,
  motivo text NOT NULL CHECK (btrim(motivo) <> '' AND char_length(motivo) <= 500),
  actor_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recosteo_consumos_material_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recosteo_id uuid NOT NULL
    REFERENCES public.recosteo_consumos_material (id) ON DELETE RESTRICT,
  origen text NOT NULL CHECK (origen IN ('CONSUMO', 'RETRABAJO')),
  registro_id uuid NOT NULL,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  cantidad numeric(14, 4) NOT NULL CHECK (cantidad >= 0),
  costo_anterior_mxn numeric(14, 4) NOT NULL CHECK (costo_anterior_mxn >= 0),
  costo_nuevo_mxn numeric(14, 4) NOT NULL CHECK (costo_nuevo_mxn >= 0),
  importe_anterior numeric(24, 4) NOT NULL,
  importe_nuevo numeric(24, 4) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recosteo_consumos_material_material
  ON public.recosteo_consumos_material (material_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_recosteo_consumos_detalle_recosteo
  ON public.recosteo_consumos_material_detalle (recosteo_id);

ALTER TABLE public.recosteo_consumos_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recosteo_consumos_material_detalle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recosteo_consumos_material FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recosteo_consumos_material_detalle FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.recosteo_consumos_material IS
  'B7: cabecera append-only de cada revaluación de costo de material ya consumido.';
COMMENT ON TABLE public.recosteo_consumos_material_detalle IS
  'B7: detalle por consumo/retrabajo con costo anterior y nuevo; evita sumar dos veces el consumo.';

-- -----------------------------------------------------------------------------
-- 3. RPC de recosteo controlado.
--    Actualiza únicamente snapshots ya registrados (origen NUEVO) y retrabajos
--    con catálogo actual. No crea consumos, no toca inventario y no modifica
--    el historial de costos del catálogo (eso lo hace confirmar_costo_material).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revaluar_costo_material_consumido(
  p_material_id uuid,
  p_costo numeric,
  p_moneda text,
  p_motivo text,
  p_solicitud_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  auditoria_id uuid,
  material_id uuid,
  costo_nuevo_mxn numeric,
  consumos_actualizados integer,
  retrabajos_actualizados integer,
  importe_anterior_total numeric,
  importe_nuevo_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_material public.catalogo_materiales%ROWTYPE;
  v_tipo_cambio numeric;
  v_costo_mxn numeric;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_auditoria public.recosteo_consumos_material%ROWTYPE;
  v_consumo record;
  v_retrabajo record;
  v_consumos integer := 0;
  v_retrabajos integer := 0;
  v_importe_anterior numeric := 0;
  v_importe_nuevo numeric := 0;
  v_cantidad numeric;
  v_importe_anterior_fila numeric;
  v_importe_nuevo_fila numeric;
  v_auditoria_id uuid;
BEGIN
  IF p_material_id IS NULL OR p_solicitud_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'recosteo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_costo IS NULL OR p_costo < 0 OR p_costo > 1000000000
     OR abs(p_costo * 10000 - round(p_costo * 10000)) > 0.000001 THEN
    RAISE EXCEPTION 'recosteo_invalido' USING ERRCODE = '23514';
  END IF;
  IF p_moneda IS NULL OR p_moneda NOT IN ('MXN', 'USD') THEN
    RAISE EXCEPTION 'recosteo_invalido' USING ERRCODE = '23514';
  END IF;
  IF v_motivo = '' OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'motivo_recosteo_requerido' USING ERRCODE = '23514';
  END IF;
  IF NOT privado.actor_con_permiso(p_actor_id, 'gestionar_inventario') THEN
    RAISE EXCEPTION 'sin_permiso_materiales' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_material
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF p_moneda = 'MXN' THEN
    v_tipo_cambio := 1;
  ELSE
    SELECT configuracion.tipo_cambio_usd INTO v_tipo_cambio
    FROM public.configuracion_sistema AS configuracion
    LIMIT 1;
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'tipo_cambio_no_configurado' USING ERRCODE = '23514';
    END IF;
  END IF;
  v_costo_mxn := round(p_costo * v_tipo_cambio, 4);

  -- Idempotencia por clave de solicitud: un reintento devuelve la misma
  -- auditoría y no vuelve a revaluar.
  SELECT * INTO v_auditoria
  FROM public.recosteo_consumos_material AS recosteo
  WHERE recosteo.solicitud_id = p_solicitud_id;
  IF FOUND THEN
    IF v_auditoria.material_id <> p_material_id
       OR v_auditoria.costo_nuevo_mxn <> v_costo_mxn
       OR v_auditoria.costo_origen_nuevo <> round(p_costo, 4)
       OR v_auditoria.moneda_costo <> p_moneda
       OR v_auditoria.motivo <> v_motivo THEN
      RAISE EXCEPTION 'solicitud_recosteo_conflicto' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT
      v_auditoria.id, v_auditoria.material_id, v_auditoria.costo_nuevo_mxn,
      v_auditoria.consumos_actualizados, v_auditoria.retrabajos_actualizados,
      v_auditoria.importe_anterior_total, v_auditoria.importe_nuevo_total;
    RETURN;
  END IF;

  INSERT INTO public.recosteo_consumos_material (
    solicitud_id, material_id, costo_nuevo_mxn, costo_origen_nuevo,
    moneda_costo, tipo_cambio, motivo, actor_id
  ) VALUES (
    p_solicitud_id, p_material_id, v_costo_mxn, round(p_costo, 4),
    p_moneda, v_tipo_cambio, v_motivo, p_actor_id
  ) RETURNING recosteo_consumos_material.id INTO v_auditoria_id;

  FOR v_consumo IN
    SELECT
      consumo.id,
      consumo.partida_id,
      consumo.cantidad_usada + consumo.cantidad_scrap AS cantidad,
      consumo.costo_unitario_momento
    FROM public.registros_consumo_material AS consumo
    WHERE consumo.origen = 'NUEVO'
      AND consumo.catalogo_material_id = p_material_id
      AND consumo.costo_unitario_momento <> v_costo_mxn
    ORDER BY consumo.id
    FOR UPDATE
  LOOP
    v_cantidad := v_consumo.cantidad;
    v_importe_anterior_fila := round(v_consumo.costo_unitario_momento * v_cantidad, 4);
    v_importe_nuevo_fila := round(v_costo_mxn * v_cantidad, 4);

    UPDATE public.registros_consumo_material AS consumo
    SET costo_unitario_origen = round(p_costo, 4),
        moneda_costo = p_moneda,
        tipo_cambio = v_tipo_cambio,
        costo_unitario_momento = v_costo_mxn
    WHERE consumo.id = v_consumo.id;

    INSERT INTO public.recosteo_consumos_material_detalle (
      recosteo_id, origen, registro_id, partida_id, cantidad,
      costo_anterior_mxn, costo_nuevo_mxn, importe_anterior, importe_nuevo
    ) VALUES (
      v_auditoria_id, 'CONSUMO', v_consumo.id, v_consumo.partida_id, v_cantidad,
      v_consumo.costo_unitario_momento, v_costo_mxn,
      v_importe_anterior_fila, v_importe_nuevo_fila
    );

    v_consumos := v_consumos + 1;
    v_importe_anterior := v_importe_anterior + v_importe_anterior_fila;
    v_importe_nuevo := v_importe_nuevo + v_importe_nuevo_fila;
  END LOOP;

  FOR v_retrabajo IN
    SELECT
      retrabajo.id,
      retrabajo.partida_id,
      retrabajo.cantidad_usada + retrabajo.cantidad_scrap AS cantidad,
      retrabajo.costo_unitario_momento
    FROM public.retrabajos_produccion AS retrabajo
    WHERE retrabajo.catalogo_material_id = p_material_id
      AND retrabajo.costo_unitario_momento <> v_costo_mxn
    ORDER BY retrabajo.id
    FOR UPDATE
  LOOP
    v_cantidad := v_retrabajo.cantidad;
    v_importe_anterior_fila := round(v_retrabajo.costo_unitario_momento * v_cantidad, 4);
    v_importe_nuevo_fila := round(v_costo_mxn * v_cantidad, 4);

    UPDATE public.retrabajos_produccion AS retrabajo
    SET costo_unitario_momento = v_costo_mxn
    WHERE retrabajo.id = v_retrabajo.id;

    INSERT INTO public.recosteo_consumos_material_detalle (
      recosteo_id, origen, registro_id, partida_id, cantidad,
      costo_anterior_mxn, costo_nuevo_mxn, importe_anterior, importe_nuevo
    ) VALUES (
      v_auditoria_id, 'RETRABAJO', v_retrabajo.id, v_retrabajo.partida_id, v_cantidad,
      v_retrabajo.costo_unitario_momento, v_costo_mxn,
      v_importe_anterior_fila, v_importe_nuevo_fila
    );

    v_retrabajos := v_retrabajos + 1;
    v_importe_anterior := v_importe_anterior + v_importe_anterior_fila;
    v_importe_nuevo := v_importe_nuevo + v_importe_nuevo_fila;
  END LOOP;

  UPDATE public.recosteo_consumos_material AS recosteo
  SET consumos_actualizados = v_consumos,
      retrabajos_actualizados = v_retrabajos,
      importe_anterior_total = v_importe_anterior,
      importe_nuevo_total = v_importe_nuevo
  WHERE recosteo.id = v_auditoria_id;

  RETURN QUERY SELECT
    v_auditoria_id, p_material_id, v_costo_mxn,
    v_consumos, v_retrabajos, v_importe_anterior, v_importe_nuevo;
END;
$function$;

COMMENT ON FUNCTION public.revaluar_costo_material_consumido(
  uuid, numeric, text, text, uuid, uuid) IS
  'B7: sustituye el costo provisional de consumos ya registrados por el comprobado, sin duplicar consumos y con auditoría append-only.';

REVOKE ALL ON FUNCTION public.revaluar_costo_material_consumido(
  uuid, numeric, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revaluar_costo_material_consumido(
  uuid, numeric, text, text, uuid, uuid)
  TO service_role;
