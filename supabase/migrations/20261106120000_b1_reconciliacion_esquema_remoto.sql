-- =============================================================================
-- B1 - Reconciliacion del esquema remoto (AUD-20)
-- =============================================================================
-- Objetivo: restaurar EXCLUSIVAMENTE los objetos que el repositorio define y que
-- el proyecto Supabase remoto no tiene, sin reaplicar migraciones historicas ni
-- redefinir RPC que ya evolucionaron (C11-C13).
--
-- Diferencias confirmadas por comparacion de catalogos (local vs remoto):
--   1. privado.recurso_compatible_con_partida(uuid, uuid)          -> ausente
--   2. privado.emitir_evento_cambio_estado_orden()                 -> ausente
--   3. privado.emitir_evento_nota_entrega()                        -> ausente
--   4. trigger_orden_evento_cambio_estado (ordenes_produccion)     -> ausente
--   5. trigger_nota_entrega_evento (notas_entrega)                 -> ausente
--   6. 16 restricciones (CxC/pagos MXN, catalogo legado, inventario) -> ausentes
--   7. public.cerrar_sesion_con_consumo_operador                   -> error antiguo
--
-- NO se reaplican:
--   * 20261017140000_c9_2_recurso_incompatible.sql
--   * 20261017120000_c8_5_eventos_negocio_orden.sql
--     (se copian solo las definiciones faltantes; el resto de esas migraciones
--      redefiniria programar_partida_recurso con la version previa a C11/C12)
--   * 20260911000003_auditoria_cobranza_pipeline.sql (solo sus 2 CHECK)
--   * 20260707000002_crear_inventario.sql (solo sus CHECK inline)
--
-- Seguridad de ejecucion:
--   * Idempotente: cada objeto se crea solo si falta; las funciones usan
--     CREATE OR REPLACE. Reejecutarla no duplica nada.
--   * Sin DROP CASCADE, sin DROP de objetos y sin reescritura de datos.
--   * Las dos restricciones financieras se agregan NOT VALID (grandfathering
--     documentado en 20260911000003): solo aplican a filas nuevas/actualizadas.
--   * La FK de inventario se agrega NOT VALID y se valida despues; las tablas
--     legadas estan vacias en el proyecto vinculado.
--   * Reversion: ver ESTABILIZACION-B1-SUPABASE.md (bloque "Reversion").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Compatibilidad de recurso por partida (dependencia de C11)
--    C9.2 la define; C11 la invoca desde recurso_compatible_con_operacion
--    cuando p_meta_proceso_id IS NULL (partidas heredadas o sin ruteo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.recurso_compatible_con_partida(
  p_partida_id uuid,
  p_recurso_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grupo_recurso uuid;
  v_grupos_requeridos uuid[];
BEGIN
  SELECT recurso.grupo_equipo_id
  INTO v_grupo_recurso
  FROM public.recursos_planeacion AS recurso
  WHERE recurso.id = p_recurso_id;

  -- Sin grupo en el recurso: «sin dato», nunca bloquea.
  IF v_grupo_recurso IS NULL THEN
    RETURN true;
  END IF;

  -- Grupos de los procesos del ruteo (por codigo o nombre, normalizados).
  SELECT array_agg(DISTINCT proceso.grupo_equipo_id)
  INTO v_grupos_requeridos
  FROM public.partidas_orden_produccion AS partida
  CROSS JOIN LATERAL unnest(coalesce(partida.procesos, ARRAY[]::text[])) AS ruteo(valor)
  JOIN public.catalogo_procesos AS proceso
    ON lower(regexp_replace(btrim(proceso.codigo), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(ruteo.valor), '[[:space:]]+', ' ', 'g'))
    OR lower(regexp_replace(btrim(proceso.nombre), '[[:space:]]+', ' ', 'g'))
       = lower(regexp_replace(btrim(ruteo.valor), '[[:space:]]+', ' ', 'g'))
  WHERE partida.id = p_partida_id
    AND proceso.grupo_equipo_id IS NOT NULL;

  -- Respaldo: sin grupos del ruteo, la estacion del desglose (maquina_asignada).
  IF v_grupos_requeridos IS NULL THEN
    SELECT array_agg(DISTINCT respaldo.grupo_equipo_id)
    INTO v_grupos_requeridos
    FROM public.partidas_orden_produccion AS partida
    JOIN public.recursos_planeacion AS respaldo
      ON lower(regexp_replace(btrim(respaldo.codigo), '[[:space:]]+', ' ', 'g'))
         = lower(regexp_replace(btrim(partida.maquina_asignada), '[[:space:]]+', ' ', 'g'))
    WHERE partida.id = p_partida_id
      AND partida.maquina_asignada IS NOT NULL
      AND btrim(partida.maquina_asignada) <> ''
      AND respaldo.grupo_equipo_id IS NOT NULL;
  END IF;

  -- Sin grupos requeridos resueltos: «sin dato», nunca bloquea.
  IF v_grupos_requeridos IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_grupo_recurso = ANY (v_grupos_requeridos);
END;
$$;

COMMENT ON FUNCTION privado.recurso_compatible_con_partida(uuid, uuid) IS
  'C9.2/P-04: true cuando el recurso puede programarse para la partida (compatible o sin dato); solo false cuando ambos lados se conocen y difieren.';

-- Mismo criterio de seguridad que su consumidora C11
-- (recurso_compatible_con_operacion): helper interno, no expuesto a la API.
REVOKE ALL ON FUNCTION privado.recurso_compatible_con_partida(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Eventos de negocio de la Orden (C8.5 / O-13)
--    Alimentan orden_eventos_cambio en las transiciones reales de estado y en
--    cada nota de entrega. Ninguna otra funcion inserta estos tipos, por lo que
--    no se duplican eventos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.emitir_evento_cambio_estado_orden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo text;
BEGIN
  IF NEW.estado_sii IS NOT DISTINCT FROM OLD.estado_sii THEN
    RETURN NEW;
  END IF;

  v_tipo := CASE NEW.estado_sii
    WHEN 'PLANIFICADA' THEN 'orden_planificada'
    WHEN 'EN_PRODUCCION' THEN 'produccion_iniciada'
    WHEN 'PRODUCCION_COMPLETADA' THEN 'produccion_completada'
    WHEN 'CANCELADA' THEN 'orden_cancelada'
    ELSE NULL
  END;

  IF v_tipo IS NOT NULL THEN
    INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id, correlation_id)
    VALUES (
      NEW.id,
      v_tipo,
      jsonb_build_object('estado_anterior', OLD.estado_sii, 'estado_nuevo', NEW.estado_sii),
      CASE WHEN v_tipo = 'orden_cancelada' THEN NEW.motivo_cancelacion ELSE NULL END,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.emitir_evento_cambio_estado_orden() IS
  'C8.5 / O-13: emite orden_planificada, produccion_iniciada, produccion_completada y orden_cancelada solo cuando estado_sii cambia; permitido para otros estados sin duplicar.';

DROP TRIGGER IF EXISTS trigger_orden_evento_cambio_estado ON public.ordenes_produccion;
CREATE TRIGGER trigger_orden_evento_cambio_estado
  AFTER UPDATE OF estado_sii ON public.ordenes_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.emitir_evento_cambio_estado_orden();

CREATE OR REPLACE FUNCTION privado.emitir_evento_nota_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.orden_eventos_cambio (orden_id, tipo, detalle, motivo, actor_id, correlation_id)
  VALUES (
    NEW.orden_id,
    'orden_entregada',
    jsonb_build_object('folio', NEW.folio, 'folio_sii', NEW.folio_sii, 'es_parcial', NEW.es_parcial),
    CASE WHEN NEW.es_parcial THEN 'Entrega parcial' ELSE 'Entrega total' END,
    NEW.creado_por,
    NEW.solicitud_id
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.emitir_evento_nota_entrega() IS
  'C8.5 / O-13: emite orden_entregada por cada nota de entrega registrada (parcial o total); correlation_id es la solicitud idempotente.';

DROP TRIGGER IF EXISTS trigger_nota_entrega_evento ON public.notas_entrega;
CREATE TRIGGER trigger_nota_entrega_evento
  AFTER INSERT ON public.notas_entrega
  FOR EACH ROW EXECUTE FUNCTION privado.emitir_evento_nota_entrega();

REVOKE ALL ON FUNCTION privado.emitir_evento_cambio_estado_orden()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION privado.emitir_evento_nota_entrega()
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Restricciones de integridad ausentes
--    Se restauran con el mismo nombre, definicion e intencion que el repositorio.
--    Guardas por (conrelid, conname) para que la migracion sea reintentable.
-- -----------------------------------------------------------------------------

-- 3.1 CxC y pagos AR: MXN siempre con tipo de cambio 1.
--     NOT VALID conserva el grandfathering de 20260911000003: no bloquea ni
--     reescribe filas historicas; solo valida filas nuevas o actualizadas.
DO $b1_cxc$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cuentas_por_cobrar'::regclass
      AND conname = 'cuentas_por_cobrar_mxn_tc_uno'
  ) THEN
    ALTER TABLE public.cuentas_por_cobrar
      ADD CONSTRAINT cuentas_por_cobrar_mxn_tc_uno
      CHECK (moneda <> 'MXN' OR tipo_cambio_origen = 1) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pagos_ar'::regclass
      AND conname = 'pagos_ar_mxn_tc_uno'
  ) THEN
    ALTER TABLE public.pagos_ar
      ADD CONSTRAINT pagos_ar_mxn_tc_uno
      CHECK (moneda_pago <> 'MXN' OR tipo_cambio_pago = 1) NOT VALID;
  END IF;
END;
$b1_cxc$;

-- 3.2 Catalogo legado de materiales (inline en 20260707000002; el remoto creo
--     la tabla antes de esas reglas y CREATE TABLE IF NOT EXISTS no las agrego).
DO $b1_materiales$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_categoria_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_categoria_check
      CHECK (categoria IN ('materia_prima', 'insumo', 'semiterminado', 'terminado'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_unidad_compra_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_unidad_compra_check
      CHECK (unidad_compra IN ('hoja', 'barra', 'rollo', 'pieza'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_unidad_control_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_unidad_control_check
      CHECK (unidad_control IN ('m2', 'ml', 'pieza', 'kg'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_factor_conversion_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_factor_conversion_check
      CHECK (factor_conversion > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_costo_unitario_compra_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_costo_unitario_compra_check
      CHECK (costo_unitario_compra >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_costo_unitario_control_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_costo_unitario_control_check
      CHECK (costo_unitario_control >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_stock_reservado_control_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_stock_reservado_control_check
      CHECK (stock_reservado_control >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_stock_minimo_control_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_stock_minimo_control_check
      CHECK (stock_minimo_control >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiales'::regclass
      AND conname = 'materiales_factor_merma_porcentaje_check') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_factor_merma_porcentaje_check
      CHECK (factor_merma_porcentaje >= 0 AND factor_merma_porcentaje <= 100);
  END IF;
END;
$b1_materiales$;

-- 3.3 Kardex y reservas de material.
DO $b1_inventario$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'movimientos_inventario_tipo_movimiento_check') THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_tipo_movimiento_check
      CHECK (tipo_movimiento IN ('entrada_compra', 'salida_produccion', 'ajuste_inventario', 'devolucion'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'movimientos_inventario_costo_unitario_momento_check') THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_costo_unitario_momento_check
      CHECK (costo_unitario_momento >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'movimientos_inventario_operador_id_fkey') THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_operador_id_fkey
      FOREIGN KEY (operador_id) REFERENCES public.usuarios(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reservas_material'::regclass
      AND conname = 'reservas_material_cantidad_reservada_check') THEN
    ALTER TABLE public.reservas_material
      ADD CONSTRAINT reservas_material_cantidad_reservada_check
      CHECK (cantidad_reservada > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reservas_material'::regclass
      AND conname = 'reservas_material_estado_check') THEN
    ALTER TABLE public.reservas_material
      ADD CONSTRAINT reservas_material_estado_check
      CHECK (estado IN ('activa', 'consumida', 'cancelada'));
  END IF;
END;
$b1_inventario$;

-- La FK se agrego NOT VALID para no bloquear la tabla; validarla en el mismo
-- paso la deja equivalente a la definicion del repositorio.
DO $b1_inventario_fk$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_inventario'::regclass
      AND conname = 'movimientos_inventario_operador_id_fkey'
      AND NOT convalidated
  ) THEN
    ALTER TABLE public.movimientos_inventario
      VALIDATE CONSTRAINT movimientos_inventario_operador_id_fkey;
  END IF;
END;
$b1_inventario_fk$;

-- -----------------------------------------------------------------------------
-- 4. Contrato de errores tipados del cierre con consumo (C10)
--    El remoto conserva 'cierre_consumo_invalido'; el servicio TypeScript
--    reconoce 'cierre_sesion_invalido'. La logica es identica, por lo que no se
--    pierde ninguna mejora posterior: 20261027173000 es la ultima definicion.
--    Se replica cuerpo, firma, comentario y permisos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cerrar_sesion_con_consumo_operador(
  p_sesion_id uuid,
  p_operador_id uuid,
  p_piezas_producidas numeric,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_meta_proceso_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  estado_sesion text,
  horas_brutas numeric,
  horas_netas numeric,
  piezas_producidas numeric,
  cantidad_producida_partida numeric,
  estado_orden text,
  estado_planeacion text,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_partida_id uuid;
BEGIN
  IF p_sesion_id IS NULL
     OR p_operador_id IS NULL
     OR p_material_id IS NULL
     OR p_piezas_producidas IS NULL
     OR p_piezas_producidas < 0
     OR p_cantidad_usada IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_usada < 0
     OR p_cantidad_scrap < 0
     OR p_cantidad_usada + p_cantidad_scrap <= 0
  THEN
    RAISE EXCEPTION 'cierre_sesion_invalido'
      USING ERRCODE = '23514';
  END IF;

  SELECT sesion.partida_id
  INTO v_partida_id
  FROM public.sesiones_trabajo AS sesion
  WHERE sesion.id = p_sesion_id
    AND sesion.operador_id = p_operador_id
    AND sesion.estado_sesion = 'activa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sesion_no_activa'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.registrar_consumo_material_operador_op(
    v_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap,
    p_operador_id
  );

  RETURN QUERY
  SELECT cierre.*
  FROM public.cerrar_sesion_trabajo_operador(
    p_sesion_id,
    p_operador_id,
    p_piezas_producidas,
    'finalizada',
    NULL::text,
    p_notas,
    p_meta_proceso_id
  ) AS cierre;
END;
$function$;

COMMENT ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) IS
  'C10: registra consumo y cierra una sesión finalizada en una única transacción. Solo service_role.';

REVOKE ALL ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cerrar_sesion_con_consumo_operador(
  uuid, uuid, numeric, uuid, numeric, numeric, uuid, text
) TO service_role;
