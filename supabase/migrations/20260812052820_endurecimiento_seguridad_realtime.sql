-- =============================================================================
-- Migración: endurecimiento integral de seguridad, integridad y Realtime.
-- Auditoría transversal de Fases 0–5 — ORCA MFG ERP.
--
-- Corrige exposición de escrituras heredadas, traslada helpers de RLS a un
-- esquema no expuesto, elimina la escalación de rol por user_metadata, impone
-- asignación explícita de partidas a operadores y publica los cambios de piso
-- para sincronización en tiempo real.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers de RLS fuera del esquema expuesto por la Data API.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA privado TO authenticated;

CREATE OR REPLACE FUNCTION privado.es_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = (SELECT auth.uid())
      AND rol = 'admin'
      AND activo = true
  );
$$;

CREATE OR REPLACE FUNCTION privado.usuario_tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS usuario
    INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
    WHERE usuario.id = (SELECT auth.uid())
      AND usuario.activo = true
      AND permiso.permiso = p_permiso
  );
$$;

REVOKE ALL ON FUNCTION privado.es_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION privado.usuario_tiene_permiso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privado.es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION privado.usuario_tiene_permiso(text) TO authenticated;

-- Las versiones públicas dejan de ser endpoints RPC. Las políticas se recrean
-- abajo con los helpers del esquema `privado`.
REVOKE EXECUTE ON FUNCTION public.es_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.usuario_tiene_permiso(text)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Funciones de trigger y Auth: search_path fijo y rol por mínimo privilegio.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.manejar_nuevo_usuario_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre_completo, rol, activo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'nombre_completo'), ''), NEW.email),
    'vendedor',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_intento_fallido(
  p_identificador text,
  p_contexto text,
  p_max_intentos integer,
  p_bloqueo_segundos integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.intentos_login (
    identificador, contexto, intentos, bloqueado_hasta, actualizado_en
  )
  VALUES (p_identificador, p_contexto, 1, NULL, now())
  ON CONFLICT (identificador, contexto) DO UPDATE
  SET intentos = public.intentos_login.intentos + 1,
      bloqueado_hasta = CASE
        WHEN public.intentos_login.intentos + 1 >= p_max_intentos
          THEN now() + make_interval(secs => p_bloqueo_segundos)
        ELSE public.intentos_login.bloqueado_hasta
      END,
      actualizado_en = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.manejar_nuevo_usuario_auth()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_intento_fallido(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_fallido(text, text, integer, integer)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Permisos explícitos de inventario y producción.
-- -----------------------------------------------------------------------------
ALTER TABLE public.permisos_rol
  DROP CONSTRAINT IF EXISTS permisos_rol_permiso_check;
ALTER TABLE public.permisos_rol
  ADD CONSTRAINT permisos_rol_permiso_check
  CHECK (permiso IN (
    'ver_clientes',
    'aprobar_ordenes',
    'registrar_pagos',
    'registrar_gastos',
    'aplicar_saldos',
    'eliminar',
    'ver_finanzas',
    'ver_pipeline_equipo',
    'configuracion',
    'cancelar_ordenes_en_proceso',
    'gestionar_inventario',
    'gestionar_produccion'
  ));

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('admin', 'gestionar_inventario'),
  ('admin', 'gestionar_produccion'),
  ('gerente', 'gestionar_inventario'),
  ('gerente', 'gestionar_produccion')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Cierra políticas y privilegios heredados que permitían escritura directa
--    en inventario a cualquier usuario autenticado.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Escritura materiales autorizada" ON public.materiales;
DROP POLICY IF EXISTS "Escritura movimientos autorizada" ON public.movimientos_inventario;
DROP POLICY IF EXISTS "Escritura proveedores autorizada" ON public.proveedores;
DROP POLICY IF EXISTS "Escritura reservas autorizada" ON public.reservas_material;
DROP POLICY IF EXISTS "Lectura materiales autenticados" ON public.materiales;
DROP POLICY IF EXISTS "Lectura movimientos autenticados" ON public.movimientos_inventario;
DROP POLICY IF EXISTS "Lectura proveedores autenticados" ON public.proveedores;
DROP POLICY IF EXISTS "Lectura reservas autenticados" ON public.reservas_material;

REVOKE ALL PRIVILEGES ON TABLE public.proveedores FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.materiales FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.movimientos_inventario FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.reservas_material FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.proveedores TO authenticated;
GRANT SELECT ON TABLE public.materiales TO authenticated;
GRANT SELECT ON TABLE public.movimientos_inventario TO authenticated;
GRANT SELECT ON TABLE public.reservas_material TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.proveedores TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.materiales TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.movimientos_inventario TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.reservas_material TO service_role;

-- Una entrada de compra siempre debe conservar su cantidad de compra. La
-- restricción NOT VALID evita bloquear una instalación existente con histórico
-- heredado; sí se aplica a toda nueva fila o modificación.
ALTER TABLE public.movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_entrada_compra_cantidad_check;
ALTER TABLE public.movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_entrada_compra_cantidad_check
  CHECK (
    tipo_movimiento <> 'entrada_compra'
    OR (cantidad_compra IS NOT NULL AND cantidad_compra > 0)
  ) NOT VALID;

-- -----------------------------------------------------------------------------
-- 5. Asignación explícita y trazabilidad de trabajo de piso.
-- -----------------------------------------------------------------------------
ALTER TABLE public.partidas_orden_produccion
  ADD COLUMN IF NOT EXISTS operador_asignado_id uuid
    REFERENCES public.usuarios (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partidas_orden_operador_asignado
  ON public.partidas_orden_produccion (operador_asignado_id)
  WHERE operador_asignado_id IS NOT NULL;

ALTER TABLE public.partidas_orden_produccion
  DROP CONSTRAINT IF EXISTS partidas_orden_produccion_producida_no_excede_solicitada;
ALTER TABLE public.partidas_orden_produccion
  ADD CONSTRAINT partidas_orden_produccion_producida_no_excede_solicitada
  CHECK (cantidad_producida <= cantidad_solicitada) NOT VALID;

CREATE TABLE IF NOT EXISTS public.registros_avance_partida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  operador_id uuid NOT NULL REFERENCES public.usuarios (id) ON DELETE RESTRICT,
  cantidad_producida numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_producida >= 0),
  cantidad_scrap numeric(14, 4) NOT NULL DEFAULT 0 CHECK (cantidad_scrap >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registros_avance_partida_cantidad_positiva
    CHECK ((cantidad_producida + cantidad_scrap) > 0)
);

CREATE INDEX IF NOT EXISTS idx_registros_avance_partida_partida_creado
  ON public.registros_avance_partida (partida_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_registros_avance_partida_operador_creado
  ON public.registros_avance_partida (operador_id, creado_en DESC);

ALTER TABLE public.registros_avance_partida ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.registros_avance_partida
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.registros_avance_partida TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.registros_avance_partida TO service_role;

DROP POLICY IF EXISTS registros_avance_partida_seleccionar ON public.registros_avance_partida;
CREATE POLICY registros_avance_partida_seleccionar
  ON public.registros_avance_partida
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

-- El historial sensible de costos y tiempos ya no queda abierto a todos los
-- autenticados, incluidos operadores y vendedores.
DROP POLICY IF EXISTS registros_consumo_material_seleccionar ON public.registros_consumo_material;
CREATE POLICY registros_consumo_material_seleccionar
  ON public.registros_consumo_material
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
  );

DROP POLICY IF EXISTS registros_tiempo_operador_seleccionar ON public.registros_tiempo_operador;
CREATE POLICY registros_tiempo_operador_seleccionar
  ON public.registros_tiempo_operador
  FOR SELECT
  TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
  );

CREATE OR REPLACE FUNCTION public.asignar_operador_a_partida_op(
  p_partida_id uuid,
  p_operador_id uuid
)
RETURNS TABLE (
  partida_id uuid,
  operador_asignado_id uuid,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
BEGIN
  SELECT partida.orden_id
  INTO v_orden_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado NOT IN ('completada', 'cancelada')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_asignable' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET operador_asignado_id = p_operador_id
  WHERE partida.id = p_partida_id
  RETURNING partida.id, partida.operador_asignado_id, partida.actualizado_en;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_consumo_material_operador_op(
  p_partida_id uuid,
  p_material_id uuid,
  p_cantidad_usada numeric,
  p_cantidad_scrap numeric,
  p_operador_id uuid
)
RETURNS TABLE (
  id uuid,
  costo_unitario_momento numeric,
  cantidad_total numeric,
  movimiento_inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operador_asignado_id uuid;
BEGIN
  SELECT partida.operador_asignado_id
  INTO v_operador_asignado_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.registrar_consumo_material_op(
    p_partida_id,
    p_material_id,
    p_cantidad_usada,
    p_cantidad_scrap
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Las RPC de tiempo y avance verifican la asignación en la misma
--    transacción que los locks de partida/OP.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_tiempo_operador_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_accion text,
  p_notas text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  partida_id uuid,
  operador_id uuid,
  accion text,
  fecha_registro timestamptz,
  notas text,
  creado_en timestamptz,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
BEGIN
  IF p_accion NOT IN ('inicio', 'pausa', 'fin') THEN
    RAISE EXCEPTION 'accion_tiempo_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id, partida.operador_asignado_id
  INTO v_orden_id, v_operador_asignado_id
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.registros_tiempo_operador (
    partida_id,
    operador_id,
    accion,
    notas
  )
  VALUES (
    p_partida_id,
    p_operador_id,
    p_accion,
    NULLIF(btrim(p_notas), '')
  )
  RETURNING
    registros_tiempo_operador.id,
    registros_tiempo_operador.partida_id,
    registros_tiempo_operador.operador_id,
    registros_tiempo_operador.accion,
    registros_tiempo_operador.fecha_registro,
    registros_tiempo_operador.notas,
    registros_tiempo_operador.creado_en,
    registros_tiempo_operador.actualizado_en;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_avance_partida_op(
  p_partida_id uuid,
  p_operador_id uuid,
  p_cantidad_producida numeric,
  p_cantidad_scrap numeric
)
RETURNS TABLE (
  partida_id uuid,
  cantidad_producida numeric,
  cantidad_scrap numeric,
  actualizado_en timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_orden_id uuid;
  v_operador_asignado_id uuid;
  v_cantidad_producida_actual numeric;
  v_cantidad_solicitada numeric;
BEGIN
  IF p_cantidad_producida IS NULL
     OR p_cantidad_scrap IS NULL
     OR p_cantidad_producida < 0
     OR p_cantidad_scrap < 0
     OR (p_cantidad_producida + p_cantidad_scrap) <= 0 THEN
    RAISE EXCEPTION 'cantidad_avance_invalida' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    partida.orden_id,
    partida.operador_asignado_id,
    partida.cantidad_producida,
    partida.cantidad_solicitada
  INTO
    v_orden_id,
    v_operador_asignado_id,
    v_cantidad_producida_actual,
    v_cantidad_solicitada
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = p_partida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_operador_asignado_id IS DISTINCT FROM p_operador_id THEN
    RAISE EXCEPTION 'operador_no_asignado_partida' USING ERRCODE = 'check_violation';
  END IF;

  IF v_cantidad_producida_actual + p_cantidad_producida > v_cantidad_solicitada THEN
    RAISE EXCEPTION 'cantidad_producida_excede_solicitada' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.ordenes_produccion AS orden
  WHERE orden.id = v_orden_id
    AND orden.estado = 'en_proceso'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orden_no_en_proceso' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id
    AND operador.rol = 'operador'
    AND operador.activo = true
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_no_activo' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.registros_avance_partida (
    partida_id,
    operador_id,
    cantidad_producida,
    cantidad_scrap
  )
  VALUES (
    p_partida_id,
    p_operador_id,
    p_cantidad_producida,
    p_cantidad_scrap
  );

  RETURN QUERY
  UPDATE public.partidas_orden_produccion AS partida
  SET
    cantidad_producida = partida.cantidad_producida + p_cantidad_producida,
    cantidad_scrap = partida.cantidad_scrap + p_cantidad_scrap
  WHERE partida.id = p_partida_id
  RETURNING
    partida.id,
    partida.cantidad_producida,
    partida.cantidad_scrap,
    partida.actualizado_en;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_tiempo_operador_op(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_operador_a_partida_op(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_material_operador_op(
  uuid, uuid, numeric, numeric, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_tiempo_operador_op(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_avance_partida_op(uuid, uuid, numeric, numeric)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Políticas reescritas: helpers no expuestos y auth.uid evaluado una vez.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS usuarios_seleccionar ON public.usuarios;
CREATE POLICY usuarios_seleccionar
  ON public.usuarios FOR SELECT TO authenticated
  USING ((SELECT privado.es_admin()) OR (SELECT auth.uid()) = id);

DROP POLICY IF EXISTS usuarios_actualizar ON public.usuarios;
CREATE POLICY usuarios_actualizar
  ON public.usuarios FOR UPDATE TO authenticated
  USING ((SELECT privado.es_admin()))
  WITH CHECK ((SELECT privado.es_admin()));

DROP POLICY IF EXISTS logs_seleccionar ON public.logs;
CREATE POLICY logs_seleccionar
  ON public.logs FOR SELECT TO authenticated
  USING ((SELECT privado.es_admin()) OR usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS pipeline_seleccionar ON public.pipeline;
CREATE POLICY pipeline_seleccionar
  ON public.pipeline FOR SELECT TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    OR (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
  );

DROP POLICY IF EXISTS pipeline_insertar ON public.pipeline;
CREATE POLICY pipeline_insertar
  ON public.pipeline FOR INSERT TO authenticated
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    AND etapa = 'prospecto'
    AND folio_cnc IS NULL
    AND cliente_id IS NULL
  );

DROP POLICY IF EXISTS pipeline_actualizar ON public.pipeline;
CREATE POLICY pipeline_actualizar
  ON public.pipeline FOR UPDATE TO authenticated
  USING (
    vendedor_id = (SELECT auth.uid())
    OR (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
  )
  WITH CHECK (
    vendedor_id = (SELECT auth.uid())
    OR (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
  );

DROP POLICY IF EXISTS pipeline_eliminar ON public.pipeline;
CREATE POLICY pipeline_eliminar
  ON public.pipeline FOR DELETE TO authenticated
  USING ((SELECT privado.es_admin()));

DROP POLICY IF EXISTS cotizacion_lineas_seleccionar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_seleccionar
  ON public.cotizacion_lineas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_insertar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_insertar
  ON public.cotizacion_lineas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_actualizar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_actualizar
  ON public.cotizacion_lineas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS cotizacion_lineas_eliminar ON public.cotizacion_lineas;
CREATE POLICY cotizacion_lineas_eliminar
  ON public.cotizacion_lineas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id = cotizacion_lineas.pipeline_id
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS clientes_seleccionar ON public.clientes;
CREATE POLICY clientes_seleccionar
  ON public.clientes FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
  );

DROP POLICY IF EXISTS documentos_cliente_seleccionar ON public.documentos_cliente;
CREATE POLICY documentos_cliente_seleccionar
  ON public.documentos_cliente FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
  );

DROP POLICY IF EXISTS documentos_cliente_storage_seleccionar ON storage.objects;
CREATE POLICY documentos_cliente_storage_seleccionar
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-cliente'
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
    )
  );

DROP POLICY IF EXISTS documentos_cliente_storage_insertar ON storage.objects;
CREATE POLICY documentos_cliente_storage_insertar
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-cliente'
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('ver_clientes'))
    )
  );

DROP POLICY IF EXISTS documentos_cliente_storage_eliminar ON storage.objects;
CREATE POLICY documentos_cliente_storage_eliminar
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-cliente'
    AND (
      (SELECT privado.es_admin())
      OR (SELECT privado.usuario_tiene_permiso('eliminar'))
    )
  );

DROP POLICY IF EXISTS adjuntos_seleccionar ON storage.objects;
CREATE POLICY adjuntos_seleccionar
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_insertar ON storage.objects;
CREATE POLICY adjuntos_insertar
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

DROP POLICY IF EXISTS adjuntos_eliminar ON storage.objects;
CREATE POLICY adjuntos_eliminar
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'adjuntos-cotizacion'
    AND EXISTS (
      SELECT 1 FROM public.pipeline AS pipeline
      WHERE pipeline.id::text = (storage.foldername(name))[1]
        AND (
          pipeline.vendedor_id = (SELECT auth.uid())
          OR (SELECT privado.es_admin())
          OR (SELECT privado.usuario_tiene_permiso('ver_pipeline_equipo'))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 8. Realtime: tablas operativas publicadas de forma idempotente. Los clientes
--    autenticados respetan RLS; el relay de piso no expone payloads ni credenciales.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'ordenes_produccion',
    'partidas_orden_produccion',
    'registros_tiempo_operador',
    'registros_consumo_material',
    'registros_avance_partida',
    'materiales'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabla);
    END IF;
  END LOOP;
END;
$$;
