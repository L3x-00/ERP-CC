-- =============================================================================
-- Auditoría 2026-09-11 — Endurecimiento de RLS, grants y validaciones SQL.
--
-- Hallazgos corregidos:
--   A) `usuarios` exponía el hash bcrypt del PIN (`pin_operador`) a todo
--      `authenticated` (política SELECT sobre la fila completa). Se revoca el
--      SELECT de tabla y se otorgan solo columnas seguras.
--   B) `movimientos_inventario` quedó con política original `USING (true)`: el
--      CPP histórico era visible para vendedores/contadores. Se alinea con
--      `gestionar_inventario`.
--   C) La política de lectura de `gastos` no incluía al admin explícito.
--   D) Referencias sin FK en kardex/reservas/pagos; CHECKs de stock no
--      negativo y URL de firma; ajuste negativo de inventario inalcanzable.
--   E) `menciones_json` admitía valores no UUID en reposo.
--   F) `seq_folio_op` (folio comercial legado) no estaba revocada.
--   G) `movimientos_inventario` no estaba publicado para Realtime.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) PIN de operador: nunca legible por `authenticated`.
-- -----------------------------------------------------------------------------
REVOKE SELECT ON TABLE public.usuarios FROM anon, authenticated;
REVOKE SELECT ON TABLE public.usuarios FROM PUBLIC;

GRANT SELECT (
  id,
  email,
  nombre_completo,
  rol,
  activo,
  ultimo_login_at,
  creado_en,
  actualizado_en
) ON TABLE public.usuarios TO authenticated;

-- service_role conserva el acceso completo (Server Actions y auditoría).

-- -----------------------------------------------------------------------------
-- B) Costos del kardex: solo admin o gestión de inventario.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS movimientos_inventario_seleccionar ON public.movimientos_inventario;
CREATE POLICY movimientos_inventario_seleccionar
  ON public.movimientos_inventario
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
  );

-- -----------------------------------------------------------------------------
-- C) Gastos: admin explícito o finanzas.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS gastos_seleccionar_finanzas ON public.gastos;
CREATE POLICY gastos_seleccionar_finanzas
  ON public.gastos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_finanzas'))
  );

-- -----------------------------------------------------------------------------
-- D1) Integridad referencial de columnas que hoy solo validan las RPC.
--     NOT VALID aplica a filas nuevas sin fallar por históricos.
-- -----------------------------------------------------------------------------
DO $auditoria$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_inventario_orden_fk') THEN
    ALTER TABLE public.movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_orden_fk
      FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF to_regclass('public.reservas_material') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_material_orden_fk') THEN
    ALTER TABLE public.reservas_material
      ADD CONSTRAINT reservas_material_orden_fk
      FOREIGN KEY (orden_id) REFERENCES public.ordenes_produccion(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  -- `cuentas_bancarias` llega con Fase 11 (aún no aplicada al remoto).
  IF to_regclass('public.cuentas_bancarias') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagos_ar_cuenta_bancaria_fk') THEN
    ALTER TABLE public.pagos_ar
      ADD CONSTRAINT pagos_ar_cuenta_bancaria_fk
      FOREIGN KEY (cuenta_bancaria_id) REFERENCES public.cuentas_bancarias(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$auditoria$;

-- D2) Stock nunca negativo, también a nivel de tabla.
DO $auditoria$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materiales_stock_no_negativo') THEN
    ALTER TABLE public.materiales
      ADD CONSTRAINT materiales_stock_no_negativo
      CHECK (stock_actual_control >= 0) NOT VALID;
  END IF;
END;
$auditoria$;

-- D3) Firma de entrega: solo http(s).
DO $auditoria$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_entrega_firma_url_segura') THEN
    ALTER TABLE public.notas_entrega
      ADD CONSTRAINT notas_entrega_firma_url_segura
      CHECK (
        firma_cliente_url IS NULL
        OR firma_cliente_url ~* '^https?://[^[:space:]]+$'
      ) NOT VALID;
  END IF;
END;
$auditoria$;

-- D4) El ajuste de inventario puede ser negativo (delta con signo); solo se
--     prohíbe el cero. El stock negativo se detiene por el lock/BLOCK/RPC.
--     Se conserva la firma y lógica de `20260707000005`; únicamente cambia el
--     guard de signo y se endurece `search_path`.
CREATE OR REPLACE FUNCTION public.registrar_movimiento_inventario(
  p_material_id uuid,
  p_tipo text,
  p_prefijo_folio text,
  p_cantidad_control numeric,
  p_costo_unitario_momento numeric,
  p_cantidad_compra numeric DEFAULT NULL,
  p_orden_id uuid DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL,
  p_referencia_externa text DEFAULT NULL,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stock numeric;
  v_costo numeric;
  v_delta numeric;
  v_nuevo_stock numeric;
  v_nuevo_costo numeric;
  v_folio text;
  v_id uuid;
BEGIN
  IF p_cantidad_control IS NULL
     OR p_cantidad_control IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_cantidad_control = 0 THEN
    RAISE EXCEPTION 'cantidad_invalida';
  END IF;
  -- Solo el ajuste admite delta negativo; el resto de tipos exige magnitud.
  IF p_tipo <> 'ajuste_inventario' AND p_cantidad_control < 0 THEN
    RAISE EXCEPTION 'cantidad_invalida';
  END IF;
  IF p_costo_unitario_momento IS NULL OR p_costo_unitario_momento < 0 THEN
    RAISE EXCEPTION 'costo_invalido';
  END IF;

  -- Lock de la fila del material: serializa concurrencia del mismo material.
  SELECT material.stock_actual_control, material.costo_unitario_control
    INTO v_stock, v_costo
    FROM public.materiales AS material
    WHERE material.id = p_material_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_inexistente';
  END IF;

  IF p_tipo IN ('entrada_compra', 'devolucion') THEN
    v_delta := p_cantidad_control;
  ELSIF p_tipo = 'salida_produccion' THEN
    v_delta := -p_cantidad_control;
  ELSIF p_tipo = 'ajuste_inventario' THEN
    v_delta := p_cantidad_control; -- el llamador pasa el delta con su signo
  ELSE
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  v_nuevo_stock := v_stock + v_delta;
  IF v_nuevo_stock < 0 THEN
    RAISE EXCEPTION 'stock_insuficiente';
  END IF;

  IF p_tipo = 'entrada_compra' AND (v_stock + p_cantidad_control) > 0 THEN
    v_nuevo_costo := ((v_stock * v_costo) + (p_cantidad_control * p_costo_unitario_momento))
                     / (v_stock + p_cantidad_control);
  ELSE
    v_nuevo_costo := v_costo;
  END IF;

  v_folio := public.generar_folio_inventario(p_prefijo_folio);

  INSERT INTO public.movimientos_inventario (
    folio, material_id, tipo_movimiento, cantidad_compra, cantidad_control,
    costo_unitario_momento, orden_id, operador_id, referencia_externa, notas
  ) VALUES (
    v_folio, p_material_id, p_tipo, p_cantidad_compra, p_cantidad_control,
    p_costo_unitario_momento, p_orden_id, p_operador_id, p_referencia_externa, p_notas
  )
  RETURNING id INTO v_id;

  UPDATE public.materiales
     SET stock_actual_control = v_nuevo_stock,
         costo_unitario_control = v_nuevo_costo
     WHERE id = p_material_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) IS 'Registra un movimiento de inventario de forma atómica (lock del material, prohíbe stock negativo, recalcula CPP, folio y kardex). Los ajustes admiten delta con signo. Solo service_role.';

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento_inventario(
  uuid, text, text, numeric, numeric, numeric, uuid, uuid, text, text
) TO service_role;

-- -----------------------------------------------------------------------------
-- E) `menciones_json` solo UUIDs válidos (regla 13).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.procesar_menciones_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enlace text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.menciones_json) AS mencion(valor)
    WHERE mencion.valor !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'mencion_invalida' USING ERRCODE = 'check_violation';
  END IF;

  v_enlace := CASE NEW.entidad_tipo::text
    WHEN 'orden' THEN '/ordenes?ordenId=' || NEW.entidad_id::text
    WHEN 'cotizacion' THEN '/pipeline?cotizacionId=' || NEW.entidad_id::text
    WHEN 'cliente' THEN '/clientes?clienteId=' || NEW.entidad_id::text
    ELSE NULL
  END;

  INSERT INTO public.notificaciones_usuario (
    usuario_id,
    emisor_id,
    tipo,
    titulo,
    mensaje,
    enlace
  )
  SELECT DISTINCT
    usuario.id,
    NEW.autor_id,
    'mencion',
    'Te mencionaron en un comentario',
    left(NEW.contenido, 500),
    v_enlace
  FROM jsonb_array_elements_text(NEW.menciones_json) AS mencion(valor)
  INNER JOIN public.usuarios AS usuario
    ON usuario.id = CASE
      WHEN mencion.valor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN mencion.valor::uuid
      ELSE NULL
    END
  WHERE usuario.activo = true
    AND usuario.id IS DISTINCT FROM NEW.autor_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.procesar_menciones_comentario() IS
  'Valida UUIDs de menciones y crea notificaciones en la misma transacción del comentario.';

REVOKE ALL ON FUNCTION public.procesar_menciones_comentario() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- F) Secuencia legada del folio comercial: sin acceso de cliente.
-- -----------------------------------------------------------------------------
DO $auditoria$
BEGIN
  IF to_regclass('public.seq_folio_op') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE public.seq_folio_op FROM PUBLIC, anon, authenticated';
  END IF;
END;
$auditoria$;

-- -----------------------------------------------------------------------------
-- G) Kardex visible en Realtime para invalidación de TanStack Query.
-- -----------------------------------------------------------------------------
DO $auditoria$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'movimientos_inventario'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.movimientos_inventario';
  END IF;
END;
$auditoria$;
