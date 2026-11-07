-- =============================================================================
-- B2 - Producción, materiales, retrabajos y calidad
-- Hallazgos: AUD-01 (retrabajo ligado a inventario legado), AUD-02 (cierre sin
-- consumo propio) y AUD-04 (NOK/scrap contados como conformes y entregables).
--
-- Aclaraciones del cliente (06/11/2026):
--   * El material se registra para consumo y costo real; no hay inventario
--     físico, kardex ni descuentos de existencias.
--   * Una operación puede cerrar sin material propio cuando la ruta no lo
--     exige o cuando el material lo aporta el cliente.
--   * NOK pendiente nunca es conforme ni entregable; recuperable vuelve a ser
--     conforme solo tras una revalidación; scrap definitivo no se entrega.
--   * El retrabajo vive en la misma orden/ítem, no crea otra orden.
--
-- No toca corridas integradas (B4), cálculos financieros (B5), inventario
-- manual (AUD-03) ni el flujo de anulación de notas (AUD-05/AUD-14).
-- Aplicar SOLO local; el PO aplica en remoto con el procedimiento del informe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUD-04 - Contadores de calidad en la partida.
--    `cantidad_producida` sigue siendo la cantidad física declarada (avance y
--    secuencia de procesos). Los entregables usan `cantidad_conforme`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS cantidad_conforme numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_nok_pendiente numeric(14, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_scrap_definitivo numeric(14, 4) NOT NULL DEFAULT 0;

DO $b2_partidas_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.partidas_orden_produccion'::regclass
      AND conname = 'partidas_calidad_cantidades_validas'
  ) THEN
    ALTER TABLE public.partidas_orden_produccion
      ADD CONSTRAINT partidas_calidad_cantidades_validas CHECK (
        cantidad_conforme >= 0
        AND cantidad_nok_pendiente >= 0
        AND cantidad_scrap_definitivo >= 0
        AND cantidad_conforme + cantidad_nok_pendiente + cantidad_scrap_definitivo
          <= cantidad_producida
      );
  END IF;
END;
$b2_partidas_check$;

-- Compatibilidad histórica: lo ya producido se considera conforme hasta que
-- Calidad registre una disposición. Nunca se reduce lo ya entregado.
UPDATE public.partidas_orden_produccion AS partida
SET cantidad_conforme = partida.cantidad_producida
WHERE partida.cantidad_conforme = 0
  AND partida.cantidad_producida > 0
  AND partida.cantidad_nok_pendiente = 0
  AND partida.cantidad_scrap_definitivo = 0;

COMMENT ON COLUMN public.partidas_orden_produccion.cantidad_conforme IS
  'AUD-04: piezas conformes y entregables. Al cerrar se suman provisionalmente; Calidad descuenta recuperables y scrap.';
COMMENT ON COLUMN public.partidas_orden_produccion.cantidad_nok_pendiente IS
  'AUD-04: piezas defectuosas recuperables pendientes de revalidación. No son conformes ni entregables.';
COMMENT ON COLUMN public.partidas_orden_produccion.cantidad_scrap_definitivo IS
  'AUD-04: piezas desechadas de forma definitiva por Calidad. No son conformes ni entregables.';

-- Cierre/avance: todo lo producido entra provisionalmente como conforme; el
-- delta se replica aunque el cierre venga de una corrida integrada (B4).
CREATE OR REPLACE FUNCTION privado.sincronizar_conforme_partida_b2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cantidad_conforme = 0 AND NEW.cantidad_producida > 0 THEN
      NEW.cantidad_conforme := NEW.cantidad_producida;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cantidad_producida > OLD.cantidad_producida THEN
    NEW.cantidad_conforme := NEW.cantidad_conforme
      + (NEW.cantidad_producida - OLD.cantidad_producida);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.sincronizar_conforme_partida_b2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trigger_partida_sincronizar_conforme_b2
  ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_partida_sincronizar_conforme_b2
  BEFORE INSERT OR UPDATE OF cantidad_producida ON public.partidas_orden_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.sincronizar_conforme_partida_b2();

-- -----------------------------------------------------------------------------
-- 2. AUD-02 - ¿La partida exige consumo de material propio?
--    No exige cuando:
--      * no tiene material propio asignado (servicio o material del cliente), o
--      * el cliente aporta material para ese ítem, o
--      * ya existe un consumo registrado para la partida (se captura una vez).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.partida_requiere_consumo_material(p_partida_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN partida.catalogo_material_id IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.ordenes_produccion AS orden
      JOIN public.material_cliente_item AS cliente
        ON cliente.propuesta_revision_id = orden.propuesta_revision_id
       AND cliente.codigo_item = coalesce(partida.codigo_item, partida.codigo_pieza)
      WHERE orden.id = partida.orden_id
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.registros_consumo_material AS consumo
      WHERE consumo.partida_id = partida.id
    ) THEN false
    ELSE true
  END
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id;
$$;

COMMENT ON FUNCTION privado.partida_requiere_consumo_material(uuid) IS
  'AUD-02: true solo si la partida tiene material propio, no es material del cliente y aún no registra consumo.';

REVOKE ALL ON FUNCTION privado.partida_requiere_consumo_material(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Cierre de sesión: si la partida exige material y no hay ningún consumo, se
-- bloquea. El cierre con consumo inserta primero el consumo, por lo que pasa.
CREATE OR REPLACE FUNCTION privado.validar_consumo_cierre_b2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado_sesion = 'finalizada'
     AND OLD.estado_sesion IS DISTINCT FROM 'finalizada'
     AND privado.partida_requiere_consumo_material(NEW.partida_id) THEN
    RAISE EXCEPTION 'consumo_material_requerido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION privado.validar_consumo_cierre_b2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trigger_sesion_validar_consumo_b2 ON public.sesiones_trabajo;
CREATE TRIGGER trigger_sesion_validar_consumo_b2
  BEFORE UPDATE OF estado_sesion ON public.sesiones_trabajo
  FOR EACH ROW EXECUTE FUNCTION privado.validar_consumo_cierre_b2();

-- -----------------------------------------------------------------------------
-- 3. AUD-01 - Retrabajo con catálogo actual, sin inventario legado.
-- -----------------------------------------------------------------------------
ALTER TABLE public.retrabajos_produccion
  ALTER COLUMN material_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS catalogo_material_id uuid
    REFERENCES public.catalogo_materiales (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS resultado text NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS solicitud_id uuid;

DO $b2_retrabajo_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.retrabajos_produccion'::regclass
      AND conname = 'retrabajos_material_requerido'
  ) THEN
    ALTER TABLE public.retrabajos_produccion
      ADD CONSTRAINT retrabajos_material_requerido CHECK (
        catalogo_material_id IS NOT NULL OR material_id IS NOT NULL
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.retrabajos_produccion'::regclass
      AND conname = 'retrabajos_resultado_valido'
  ) THEN
    ALTER TABLE public.retrabajos_produccion
      ADD CONSTRAINT retrabajos_resultado_valido CHECK (
        resultado IN ('PENDIENTE', 'RECUPERADO', 'SCRAP')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.retrabajos_produccion'::regclass
      AND conname = 'retrabajos_solicitud_unica'
  ) THEN
    ALTER TABLE public.retrabajos_produccion
      ADD CONSTRAINT retrabajos_solicitud_unica UNIQUE (solicitud_id);
  END IF;
END;
$b2_retrabajo_check$;

-- Espejo legado: si el catálogo tiene equivalente en `materiales`, se conserva
-- la referencia para los reportes históricos de B5. No se consulta inventario.
UPDATE public.retrabajos_produccion AS retrabajo
SET catalogo_material_id = catalogo.id
FROM public.catalogo_materiales AS catalogo
WHERE retrabajo.catalogo_material_id IS NULL
  AND retrabajo.material_id IS NOT NULL
  AND catalogo.material_legacy_id = retrabajo.material_id;

COMMENT ON COLUMN public.retrabajos_produccion.catalogo_material_id IS
  'AUD-01: material del catálogo actual. Es la fuente para retrabajos nuevos.';
COMMENT ON COLUMN public.retrabajos_produccion.material_id IS
  'AUD-01: espejo legado opcional; ya no requiere stock ni movimientos de inventario.';
COMMENT ON COLUMN public.retrabajos_produccion.resultado IS
  'AUD-01/AUD-04: PENDIENTE, RECUPERADO o SCRAP.';

CREATE OR REPLACE FUNCTION privado.registrar_retrabajo_b2(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_minutos numeric,
  p_causa text,
  p_motivo text,
  p_notas text,
  p_actor_id uuid,
  p_solicitud_id uuid,
  p_resultado text
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  catalogo_material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  resultado text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sesion public.sesiones_trabajo%ROWTYPE;
  v_catalogo public.catalogo_materiales%ROWTYPE;
  v_legado public.materiales%ROWTYPE;
  v_catalogo_id uuid;
  v_legado_id uuid;
  v_costo_origen numeric;
  v_moneda text;
  v_tipo_cambio numeric := 1;
  v_costo_mxn numeric;
  v_total numeric := coalesce(p_cantidad_usada, 0) + coalesce(p_cantidad_scrap, 0);
  v_resultado text := upper(btrim(coalesce(p_resultado, 'PENDIENTE')));
  v_existente public.retrabajos_produccion%ROWTYPE;
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
  IF v_resultado NOT IN ('PENDIENTE', 'RECUPERADO', 'SCRAP') THEN
    RAISE EXCEPTION 'resultado_retrabajo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_sesion
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;
  IF v_sesion.operador_id <> p_actor_id
     AND NOT privado.actor_con_permiso(p_actor_id, 'gestionar_produccion') THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;
  IF v_sesion.estado_sesion <> 'activa'
     AND (v_sesion.estado_sesion <> 'finalizada'
          OR v_sesion.fecha_fin IS NULL
          OR v_sesion.fecha_fin < now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'sesion_no_activa' USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotencia: un reintento con la misma clave devuelve el registro original.
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.retrabajos_produccion AS retrabajo
    WHERE retrabajo.solicitud_id = p_solicitud_id;
    IF FOUND THEN
      IF v_existente.sesion_id IS DISTINCT FROM p_sesion_id
         OR coalesce(v_existente.catalogo_material_id, v_existente.material_id)
            IS DISTINCT FROM p_material_id
         OR v_existente.minutos IS DISTINCT FROM p_minutos THEN
        RAISE EXCEPTION 'solicitud_retrabajo_conflicto' USING ERRCODE = 'check_violation';
      END IF;
      RETURN QUERY
      SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id,
        coalesce(retrabajo.catalogo_material_id, retrabajo.material_id),
        retrabajo.catalogo_material_id, retrabajo.cantidad_usada,
        retrabajo.cantidad_scrap, retrabajo.minutos, retrabajo.causa,
        retrabajo.motivo, retrabajo.resultado, retrabajo.creado_en
      FROM public.retrabajos_produccion AS retrabajo
      WHERE retrabajo.id = v_existente.id;
      RETURN;
    END IF;
  END IF;

  -- Material del catálogo actual (fuente nueva). Si el llamador envía un id
  -- legado, se resuelve su equivalente de catálogo cuando exista; nunca se
  -- consulta ni descuenta `stock_actual_control`.
  SELECT * INTO v_catalogo
  FROM public.catalogo_materiales AS material
  WHERE material.id = p_material_id AND material.activo = true
  FOR KEY SHARE;
  IF FOUND THEN
    v_catalogo_id := v_catalogo.id;
    v_costo_origen := v_catalogo.costo_vigente;
    v_moneda := v_catalogo.moneda_costo;
    SELECT material.id INTO v_legado_id
    FROM public.materiales AS material
    WHERE material.id = v_catalogo.material_legacy_id
    LIMIT 1;
  ELSE
    SELECT * INTO v_legado
    FROM public.materiales AS material
    WHERE material.id = p_material_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'material_retrabajo_inexistente' USING ERRCODE = 'no_data_found';
    END IF;
    v_legado_id := v_legado.id;
    SELECT material.id INTO v_catalogo_id
    FROM public.catalogo_materiales AS material
    WHERE material.material_legacy_id = v_legado.id
    LIMIT 1;
    v_costo_origen := v_legado.costo_unitario_control;
    v_moneda := 'MXN';
  END IF;

  IF v_costo_origen IS NULL OR v_costo_origen < 0 THEN
    RAISE EXCEPTION 'costo_retrabajo_no_configurado' USING ERRCODE = 'check_violation';
  END IF;
  IF v_moneda = 'USD' THEN
    SELECT configuracion.tipo_cambio_usd INTO v_tipo_cambio
    FROM public.configuracion_sistema AS configuracion
    LIMIT 1;
    IF v_tipo_cambio IS NULL OR v_tipo_cambio <= 0 THEN
      RAISE EXCEPTION 'tipo_cambio_no_configurado' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_costo_mxn := round(v_costo_origen * v_tipo_cambio, 4);

  INSERT INTO public.retrabajos_produccion (
    orden_id, partida_id, sesion_id, material_id, catalogo_material_id,
    cantidad_usada, cantidad_scrap, minutos, causa, motivo, notas,
    costo_unitario_momento, movimiento_inventario_id, registrado_por,
    resultado, solicitud_id
  ) VALUES (
    v_sesion.orden_id, v_sesion.partida_id, v_sesion.id, v_legado_id, v_catalogo_id,
    p_cantidad_usada, p_cantidad_scrap, p_minutos, p_causa, btrim(p_motivo),
    nullif(btrim(coalesce(p_notas, '')), ''), v_costo_mxn, NULL, p_actor_id,
    v_resultado, p_solicitud_id
  ) RETURNING retrabajos_produccion.id INTO v_retrabajo_id;

  RETURN QUERY
  SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id,
    coalesce(retrabajo.catalogo_material_id, retrabajo.material_id),
    retrabajo.catalogo_material_id, retrabajo.cantidad_usada,
    retrabajo.cantidad_scrap, retrabajo.minutos, retrabajo.causa,
    retrabajo.motivo, retrabajo.resultado, retrabajo.creado_en
  FROM public.retrabajos_produccion AS retrabajo
  WHERE retrabajo.id = v_retrabajo_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_solicitud_id IS NOT NULL THEN
      SELECT * INTO v_existente FROM public.retrabajos_produccion AS retrabajo
      WHERE retrabajo.solicitud_id = p_solicitud_id;
      IF FOUND THEN
        RETURN QUERY
        SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id,
          coalesce(retrabajo.catalogo_material_id, retrabajo.material_id),
          retrabajo.catalogo_material_id, retrabajo.cantidad_usada,
          retrabajo.cantidad_scrap, retrabajo.minutos, retrabajo.causa,
          retrabajo.motivo, retrabajo.resultado, retrabajo.creado_en
        FROM public.retrabajos_produccion AS retrabajo
        WHERE retrabajo.id = v_existente.id;
        RETURN;
      END IF;
    END IF;
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION privado.registrar_retrabajo_b2(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Contrato histórico de 9 argumentos (compatibilidad con pruebas y llamadas
-- existentes). Delega en la versión idempotente con resultado PENDIENTE.
DROP FUNCTION IF EXISTS public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid);
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
  catalogo_material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  resultado text,
  creado_en timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM privado.registrar_retrabajo_b2(
    p_sesion_id, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    p_minutos, p_causa, p_motivo, p_notas, p_actor_id, NULL, 'PENDIENTE');
$$;

-- Contrato nuevo con clave de idempotencia y resultado de calidad.
CREATE OR REPLACE FUNCTION public.registrar_retrabajo_sesion(
  p_sesion_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_minutos numeric,
  p_causa text,
  p_motivo text,
  p_notas text,
  p_actor_id uuid,
  p_solicitud_id uuid,
  p_resultado text
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  catalogo_material_id uuid,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  resultado text,
  creado_en timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM privado.registrar_retrabajo_b2(
    p_sesion_id, p_material_id, p_cantidad_usada, p_cantidad_scrap,
    p_minutos, p_causa, p_motivo, p_notas, p_actor_id, p_solicitud_id, p_resultado);
$$;

COMMENT ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid) IS
  'C13.2 + AUD-01: registra un retrabajo con material del catálogo actual y costo snapshot; no toca inventario legado. Solo service_role.';
COMMENT ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid, uuid, text) IS
  'AUD-01/AUD-04: retrabajo idempotente por solicitud_id, con resultado PENDIENTE/RECUPERADO/SCRAP. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_retrabajo_sesion(
  uuid, uuid, numeric, numeric, numeric, text, text, text, uuid, uuid, text) TO service_role;

-- Lectura administrativa: resuelve catálogo nuevo y legado sin perder filas.
DROP FUNCTION IF EXISTS public.obtener_retrabajos_orden(uuid, uuid);

CREATE FUNCTION public.obtener_retrabajos_orden(
  p_orden_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  orden_id uuid,
  partida_id uuid,
  material_id uuid,
  catalogo_material_id uuid,
  material_codigo text,
  material_nombre text,
  unidad_control text,
  codigo_pieza text,
  cantidad_usada numeric,
  cantidad_scrap numeric,
  minutos numeric,
  causa text,
  motivo text,
  notas text,
  resultado text,
  registrado_por_nombre text,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_orden_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'retrabajo_invalido' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    privado.actor_con_permiso(p_actor_id, 'gestionar_produccion')
    OR privado.actor_con_permiso(p_actor_id, 'ver_finanzas')
  ) THEN
    RAISE EXCEPTION 'sin_permiso_retrabajo' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT retrabajo.id, retrabajo.orden_id, retrabajo.partida_id,
    coalesce(retrabajo.catalogo_material_id, retrabajo.material_id),
    retrabajo.catalogo_material_id,
    coalesce(catalogo.codigo, material.codigo),
    coalesce(catalogo.nombre, material.nombre),
    coalesce(catalogo.unidad_base, material.unidad_control),
    partida.codigo_pieza,
    retrabajo.cantidad_usada, retrabajo.cantidad_scrap, retrabajo.minutos,
    retrabajo.causa, retrabajo.motivo, retrabajo.notas, retrabajo.resultado,
    coalesce(usuario.nombre_completo, 'Administración'),
    retrabajo.creado_en
  FROM public.retrabajos_produccion AS retrabajo
  LEFT JOIN public.catalogo_materiales AS catalogo
    ON catalogo.id = retrabajo.catalogo_material_id
  LEFT JOIN public.materiales AS material
    ON material.id = retrabajo.material_id
  JOIN public.partidas_orden_produccion AS partida ON partida.id = retrabajo.partida_id
  LEFT JOIN public.usuarios AS usuario ON usuario.id = retrabajo.registrado_por
  WHERE retrabajo.orden_id = p_orden_id
  ORDER BY retrabajo.creado_en DESC;
END;
$$;

COMMENT ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid) IS
  'AUD-01: lista los retrabajos de una orden resolviendo catálogo nuevo o legado. Solo service_role.';

REVOKE ALL ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_retrabajos_orden(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. AUD-04 - Inspecciones: recuperable, scrap y revalidación.
-- -----------------------------------------------------------------------------
ALTER TABLE public.inspecciones_calidad
  ADD COLUMN IF NOT EXISTS cantidad_scrap numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sesion_id uuid REFERENCES public.sesiones_trabajo (id);

ALTER TABLE public.inspecciones_calidad
  DROP CONSTRAINT IF EXISTS inspecciones_calidad_tipo_valido;
ALTER TABLE public.inspecciones_calidad
  ADD CONSTRAINT inspecciones_calidad_tipo_valido CHECK (
    tipo IN ('PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE', 'REVALIDACION'));

DO $b2_inspeccion_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inspecciones_calidad'::regclass
      AND conname = 'inspecciones_calidad_scrap_no_negativo'
  ) THEN
    ALTER TABLE public.inspecciones_calidad
      ADD CONSTRAINT inspecciones_calidad_scrap_no_negativo
      CHECK (cantidad_scrap >= 0);
  END IF;
END;
$b2_inspeccion_check$;

CREATE UNIQUE INDEX IF NOT EXISTS inspecciones_calidad_sesion_cierre_unico
  ON public.inspecciones_calidad (sesion_id)
  WHERE tipo = 'CIERRE' AND sesion_id IS NOT NULL;

COMMENT ON COLUMN public.inspecciones_calidad.cantidad_scrap IS
  'AUD-04: piezas descartadas definitivamente en la disposición de calidad.';
COMMENT ON COLUMN public.inspecciones_calidad.sesion_id IS
  'AUD-04: sesión cuyo lote se dispone en una inspección de CIERRE; única por sesión.';

CREATE OR REPLACE FUNCTION public.registrar_inspeccion_b2(
  p_orden_id uuid,
  p_corrida_id uuid,
  p_partida_id uuid,
  p_codigo_item text,
  p_tipo text,
  p_referencia integer,
  p_resultado text,
  p_tolerancias jsonb,
  p_cantidad_inspeccionada numeric,
  p_cantidad_ok numeric,
  p_cantidad_nok numeric,
  p_cantidad_retrabajo numeric,
  p_material_usado jsonb,
  p_observaciones text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_cantidad_scrap numeric DEFAULT 0,
  p_sesion_id uuid DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_codigo_item text := nullif(btrim(coalesce(p_codigo_item, '')), '');
  v_total numeric;
  v_intervalo integer;
  v_inspeccion_id uuid;
  v_permiso text;
  v_partida public.partidas_orden_produccion%ROWTYPE;
  v_piezas_sesion numeric;
  v_recuperable numeric := coalesce(p_cantidad_retrabajo, 0);
  v_scrap numeric := coalesce(p_cantidad_scrap, 0);
  v_ok numeric := coalesce(p_cantidad_ok, 0);
BEGIN
  IF p_tipo NOT IN ('PRIMERA_PIEZA', 'REFERENCIA_LOTE', 'CIERRE', 'REVALIDACION')
     OR p_resultado NOT IN ('APROBADA', 'RECHAZADA') THEN
    RAISE EXCEPTION 'inspeccion_invalida' USING ERRCODE = '22023';
  END IF;

  v_permiso := CASE WHEN p_tipo = 'PRIMERA_PIEZA'
    THEN 'calidad_liberar_primera_pieza' ELSE 'calidad_inspeccionar' END;
  IF p_actor_id IS NULL OR NOT privado.actor_con_permiso(p_actor_id, v_permiso) THEN
    RAISE EXCEPTION 'sin_permiso_calidad' USING ERRCODE = '42501';
  END IF;

  IF p_orden_id IS NULL OR v_codigo_item IS NULL THEN
    RAISE EXCEPTION 'inspeccion_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.ordenes_produccion AS orden WHERE orden.id = p_orden_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = '22023';
  END IF;
  IF p_partida_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = p_partida_id AND partida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'partida_no_corresponde' USING ERRCODE = '23514';
  END IF;
  IF p_corrida_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.corridas AS corrida
    WHERE corrida.id = p_corrida_id AND corrida.orden_id = p_orden_id
  ) THEN
    RAISE EXCEPTION 'corrida_no_corresponde' USING ERRCODE = '23514';
  END IF;
  IF p_sesion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = p_sesion_id AND sesion.orden_id = p_orden_id
      AND (p_partida_id IS NULL OR sesion.partida_id = p_partida_id)
  ) THEN
    RAISE EXCEPTION 'sesion_no_corresponde' USING ERRCODE = '23514';
  END IF;

  IF p_tipo = 'REFERENCIA_LOTE' THEN
    IF p_referencia IS NULL OR p_referencia <= 0 THEN
      RAISE EXCEPTION 'referencia_lote_invalida' USING ERRCODE = '22023';
    END IF;
    IF p_corrida_id IS NOT NULL THEN
      SELECT corrida.cantidad_planificada INTO v_total
      FROM public.corridas AS corrida WHERE corrida.id = p_corrida_id;
      SELECT proceso.intervalo_inspeccion_lote INTO v_intervalo
      FROM public.corridas AS corrida
      JOIN public.catalogo_procesos AS proceso ON proceso.id = corrida.proceso_id
      WHERE corrida.id = p_corrida_id;
    ELSIF p_partida_id IS NOT NULL THEN
      SELECT partida.cantidad_solicitada INTO v_total
      FROM public.partidas_orden_produccion AS partida WHERE partida.id = p_partida_id;
    END IF;
    IF coalesce(v_total, 0) >= 5
       AND p_referencia NOT IN (1, 3, 5)
       AND (coalesce(v_intervalo, 0) = 0 OR p_referencia % v_intervalo <> 0) THEN
      RAISE EXCEPTION 'referencia_lote_invalida' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_tipo = 'CIERRE' AND p_sesion_id IS NOT NULL THEN
    SELECT * INTO v_partida
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = p_partida_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'partida_no_corresponde' USING ERRCODE = '23514';
    END IF;
    SELECT sesion.piezas_producidas INTO v_piezas_sesion
    FROM public.sesiones_trabajo AS sesion
    WHERE sesion.id = p_sesion_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sesion_no_corresponde' USING ERRCODE = '23514';
    END IF;
    IF v_recuperable + v_scrap > v_piezas_sesion
       OR v_ok + v_recuperable + v_scrap <> v_piezas_sesion THEN
      RAISE EXCEPTION 'disposicion_calidad_incompleta' USING ERRCODE = '23514';
    END IF;
    IF v_partida.cantidad_conforme < v_recuperable + v_scrap THEN
      RAISE EXCEPTION 'disposicion_excede_conforme' USING ERRCODE = '23514';
    END IF;
    UPDATE public.partidas_orden_produccion AS partida
    SET cantidad_conforme = partida.cantidad_conforme - (v_recuperable + v_scrap),
        cantidad_nok_pendiente = partida.cantidad_nok_pendiente + v_recuperable,
        cantidad_scrap_definitivo = partida.cantidad_scrap_definitivo + v_scrap
    WHERE partida.id = p_partida_id;
  ELSIF p_tipo = 'REVALIDACION' THEN
    IF p_partida_id IS NULL THEN
      RAISE EXCEPTION 'partida_requerida' USING ERRCODE = '23514';
    END IF;
    IF p_resultado <> 'APROBADA' THEN
      RAISE EXCEPTION 'revalidacion_no_aprobada' USING ERRCODE = '23514';
    END IF;
    IF v_ok <= 0 AND v_scrap <= 0 THEN
      RAISE EXCEPTION 'revalidacion_sin_cantidad' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_partida
    FROM public.partidas_orden_produccion AS partida
    WHERE partida.id = p_partida_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'partida_no_corresponde' USING ERRCODE = '23514';
    END IF;
    IF v_ok + v_scrap > v_partida.cantidad_nok_pendiente THEN
      RAISE EXCEPTION 'revalidacion_excede_pendiente' USING ERRCODE = '23514';
    END IF;
    UPDATE public.partidas_orden_produccion AS partida
    SET cantidad_conforme = partida.cantidad_conforme + v_ok,
        cantidad_nok_pendiente = partida.cantidad_nok_pendiente - (v_ok + v_scrap),
        cantidad_scrap_definitivo = partida.cantidad_scrap_definitivo + v_scrap
    WHERE partida.id = p_partida_id;
  END IF;

  INSERT INTO public.inspecciones_calidad (
    orden_id, corrida_id, partida_id, codigo_item, tipo, referencia, resultado,
    tolerancias, cantidad_inspeccionada, cantidad_ok, cantidad_nok, cantidad_retrabajo,
    cantidad_scrap, sesion_id, material_usado, observaciones, liberado_por
  ) VALUES (
    p_orden_id, p_corrida_id, p_partida_id, v_codigo_item, p_tipo, p_referencia,
    p_resultado, coalesce(p_tolerancias, '{}'::jsonb),
    coalesce(p_cantidad_inspeccionada, 0), v_ok,
    coalesce(p_cantidad_nok, 0), v_recuperable, v_scrap, p_sesion_id,
    coalesce(p_material_usado, '{}'::jsonb),
    nullif(btrim(coalesce(p_observaciones, '')), ''), p_actor_id
  )
  RETURNING id INTO v_inspeccion_id;

  RETURN jsonb_build_object(
    'id', v_inspeccion_id,
    'tipo', p_tipo,
    'resultado', p_resultado,
    'codigo_item', v_codigo_item,
    'referencia', p_referencia
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'inspeccion_cierre_duplicada' USING ERRCODE = '23505';
END;
$function$;

-- Compatibilidad: la firma histórica de 16 argumentos sigue existiendo y
-- delega en la implementación nueva sin sesión (solo registra evidencia).
CREATE OR REPLACE FUNCTION public.registrar_inspeccion(
  p_orden_id uuid,
  p_corrida_id uuid,
  p_partida_id uuid,
  p_codigo_item text,
  p_tipo text,
  p_referencia integer,
  p_resultado text,
  p_tolerancias jsonb,
  p_cantidad_inspeccionada numeric,
  p_cantidad_ok numeric,
  p_cantidad_nok numeric,
  p_cantidad_retrabajo numeric,
  p_material_usado jsonb,
  p_observaciones text,
  p_actor_id uuid,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.registrar_inspeccion_b2(
    p_orden_id, p_corrida_id, p_partida_id, p_codigo_item, p_tipo, p_referencia,
    p_resultado, p_tolerancias, p_cantidad_inspeccionada, p_cantidad_ok,
    p_cantidad_nok, p_cantidad_retrabajo, p_material_usado, p_observaciones,
    p_actor_id, p_correlation_id, 0, NULL::uuid, NULL::uuid);
$$;

COMMENT ON FUNCTION public.registrar_inspeccion_b2(
  uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric,
  numeric, jsonb, text, uuid, uuid, numeric, uuid, uuid) IS
  'SII-B6.3 + AUD-04: inspección con disposición de recuperables/scrap y revalidación; actualiza conformes de la partida. Solo service_role.';

REVOKE ALL ON FUNCTION public.registrar_inspeccion_b2(
  uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric,
  numeric, jsonb, text, uuid, uuid, numeric, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_inspeccion(
  uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric,
  numeric, jsonb, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_inspeccion_b2(
  uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric,
  numeric, jsonb, text, uuid, uuid, numeric, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inspeccion(
  uuid, uuid, uuid, text, text, integer, text, jsonb, numeric, numeric, numeric,
  numeric, jsonb, text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Entregas: el tope es la cantidad conforme, no la producida.
--    Se conserva el código de error para no romper los contratos de la UI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_entrega(
  p_orden_id uuid,
  p_renglones jsonb,
  p_recibido_por text,
  p_contacto_id uuid DEFAULT NULL,
  p_entregado_por uuid DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_orden public.ordenes_produccion%ROWTYPE;
  v_nota public.notas_entrega%ROWTYPE;
  v_existente public.notas_entrega%ROWTYPE;
  v_recibido text;
  v_entregado_por uuid;
  v_cantidad_renglones integer;
  v_renglones integer;
  v_folio_legacy text;
  v_es_parcial boolean;
BEGIN
  IF p_actor IS NULL OR NOT privado.actor_con_permiso(p_actor, 'entrega_generar') THEN
    RAISE EXCEPTION 'sin_permiso_entrega' USING ERRCODE = '42501';
  END IF;

  v_recibido := btrim(coalesce(p_recibido_por, ''));
  IF p_orden_id IS NULL
     OR char_length(v_recibido) NOT BETWEEN 3 AND 120
     OR p_renglones IS NULL
     OR jsonb_typeof(p_renglones) <> 'array'
     OR jsonb_array_length(p_renglones) = 0
     OR jsonb_array_length(p_renglones) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_cantidad_renglones
  FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_renglones <> jsonb_array_length(p_renglones)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
       WHERE entrada.partida_id IS NULL
          OR entrada.cantidad_entregada IS NULL
          OR entrada.cantidad_entregada <= 0
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT entrada.partida_id
         FROM jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
         GROUP BY entrada.partida_id
         HAVING count(*) > 1
       ) AS duplicada
     ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = '23514';
  END IF;

  v_entregado_por := coalesce(p_entregado_por, p_actor);

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_renglones THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_orden
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_encontrada' USING ERRCODE = '22023';
  END IF;
  IF v_orden.estado_sii <> 'PRODUCCION_COMPLETADA' THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = '23514', DETAIL = v_orden.estado_sii;
  END IF;

  PERFORM 1
  FROM public.usuarios AS entregador
  WHERE entregador.id = v_entregado_por AND entregador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entregador_no_activo' USING ERRCODE = '23514';
  END IF;

  IF p_contacto_id IS NOT NULL THEN
    PERFORM 1
    FROM public.contactos_cliente AS contacto
    WHERE contacto.id = p_contacto_id
      AND contacto.cliente_id = v_orden.cliente_id
      AND contacto.activo = true
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'contacto_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_conforme, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_conforme
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_solicitada
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_pendiente' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  v_folio_legacy := public.generar_folio_nota_entrega('NE');

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, recibido_por, recibido_por_id,
    entregado_por_id, solicitud_id, creado_por
  ) VALUES (
    v_folio_legacy, p_orden_id, v_es_parcial, v_recibido, p_contacto_id,
    v_entregado_por, p_solicitud_id, p_actor
  )
  RETURNING * INTO v_nota;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, codigo_item, cantidad_solicitada, cantidad_entregada
  )
  SELECT v_nota.id, partida.id, partida.codigo_item, partida.cantidad_solicitada, entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_renglones) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;
  GET DIAGNOSTICS v_renglones = ROW_COUNT;

  RETURN jsonb_build_object(
    'notaId', v_nota.id,
    'folio', v_nota.folio,
    'folioSii', v_nota.folio_sii,
    'esParcial', v_nota.es_parcial,
    'creadoEn', v_nota.creado_en,
    'renglones', v_renglones,
    'yaExistia', false
  );
EXCEPTION WHEN unique_violation THEN
  IF p_solicitud_id IS NOT NULL THEN
    SELECT * INTO v_existente FROM public.notas_entrega WHERE solicitud_id = p_solicitud_id;
    IF FOUND THEN
      SELECT count(*) INTO v_renglones
      FROM public.partidas_nota_entrega WHERE nota_entrega_id = v_existente.id;
      RETURN jsonb_build_object(
        'notaId', v_existente.id,
        'folio', v_existente.folio,
        'folioSii', v_existente.folio_sii,
        'esParcial', v_existente.es_parcial,
        'creadoEn', v_existente.creado_en,
        'renglones', v_renglones,
        'yaExistia', true
      );
    END IF;
  END IF;
  RAISE;
END;
$function$;

COMMENT ON FUNCTION public.registrar_entrega(uuid, jsonb, text, uuid, uuid, uuid, uuid, uuid) IS
  'SII-B7.1 / O-08 + AUD-04: entrega parcial/total por ITxx con PRODUCCION_COMPLETADA; el tope es la cantidad conforme, no la producida. Idempotente por solicitud_id. Solo service_role.';

-- Nota legacy usada por Producción: mismo tope conforme, sin cambiar su regla
-- de estado (AUD-05 se atiende en B3).
CREATE OR REPLACE FUNCTION public.generar_nota_entrega(
  p_orden_id uuid,
  p_recibido_por text,
  p_firma_cliente_url text,
  p_creado_por uuid,
  p_partidas jsonb
)
RETURNS TABLE (
  id uuid,
  folio text,
  es_parcial boolean,
  creado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_nota_id uuid;
  v_folio text;
  v_es_parcial boolean;
  v_cantidad_partidas integer;
BEGIN
  IF p_orden_id IS NULL
     OR p_creado_por IS NULL
     OR char_length(btrim(coalesce(p_recibido_por, ''))) < 3
     OR jsonb_typeof(p_partidas) <> 'array'
     OR jsonb_array_length(p_partidas) = 0
     OR jsonb_array_length(p_partidas) > 100 THEN
    RAISE EXCEPTION 'nota_entrega_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_cantidad_partidas
  FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric);
  IF v_cantidad_partidas <> jsonb_array_length(p_partidas) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    WHERE entrada.partida_id IS NULL OR entrada.cantidad_entregada IS NULL OR entrada.cantidad_entregada <= 0
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT entrada.partida_id
      FROM jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      GROUP BY entrada.partida_id
      HAVING count(*) > 1
    ) AS duplicada
  ) THEN
    RAISE EXCEPTION 'partidas_entrega_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id
  ORDER BY partida.id
  FOR UPDATE;
  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
  ) <> v_cantidad_partidas THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = p_orden_id
    AND orden.estado IN ('en_proceso', 'completada')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_entregable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS creador
  WHERE creador.id = p_creado_por
    AND creador.activo = true
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'creador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    LEFT JOIN public.partidas_nota_entrega AS historico
      ON historico.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_conforme, entrada.cantidad_entregada
    HAVING entrada.cantidad_entregada + coalesce(sum(historico.cantidad_entregada), 0::numeric)
      > partida.cantidad_conforme
  ) THEN
    RAISE EXCEPTION 'cantidad_entrega_excede_producida' USING ERRCODE = 'check_violation';
  END IF;

  v_folio := public.generar_folio_nota_entrega('NE');
  SELECT EXISTS (
    SELECT 1
    FROM public.partidas_orden_produccion AS partida
    LEFT JOIN public.partidas_nota_entrega AS historico ON historico.partida_id = partida.id
    LEFT JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
      ON entrada.partida_id = partida.id
    WHERE partida.orden_id = p_orden_id
    GROUP BY partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
    HAVING coalesce(sum(historico.cantidad_entregada), 0::numeric)
      + coalesce(max(entrada.cantidad_entregada), 0::numeric) < partida.cantidad_solicitada
  ) INTO v_es_parcial;

  INSERT INTO public.notas_entrega (
    folio, orden_id, es_parcial, firma_cliente_url, recibido_por, creado_por
  ) VALUES (
    v_folio, p_orden_id, v_es_parcial, nullif(btrim(p_firma_cliente_url), ''),
    btrim(p_recibido_por), p_creado_por
  ) RETURNING notas_entrega.id INTO v_nota_id;

  INSERT INTO public.partidas_nota_entrega (
    nota_entrega_id, partida_id, cantidad_solicitada, cantidad_entregada
  )
  SELECT
    v_nota_id, partida.id, partida.cantidad_solicitada, entrada.cantidad_entregada
  FROM public.partidas_orden_produccion AS partida
  JOIN jsonb_to_recordset(p_partidas) AS entrada(partida_id uuid, cantidad_entregada numeric)
    ON entrada.partida_id = partida.id
  WHERE partida.orden_id = p_orden_id;

  RETURN QUERY
  SELECT nota.id, nota.folio, nota.es_parcial, nota.creado_en
  FROM public.notas_entrega AS nota
  WHERE nota.id = v_nota_id;
END;
$function$;

COMMENT ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) IS
  'C7 legacy + AUD-04: nota de entrega con tope en cantidad_conforme. Su regla de estado se mantiene para B3 (AUD-05). Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_nota_entrega(uuid, text, text, uuid, jsonb) TO service_role;
