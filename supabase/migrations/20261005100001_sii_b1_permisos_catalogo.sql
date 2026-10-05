-- =============================================================================
-- SII-B1.2 — Permisos por acción: catálogo, FK y RPC de administración
-- Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.2 (ADR-SII-05)
-- Documento del cliente: §5 (roles y permisos), §15 (configuración auditable)
--
-- Idempotente y no destructiva:
--   * crea el catálogo `permisos` y siembra los 14 códigos vigentes + los nuevos
--   * reemplaza el CHECK enumerado de `permisos_rol` por una FK al catálogo
--   * agrega RPC de administración de matriz y de usuarios (solo service_role)
-- Aplicación: SOLO local hasta autorización del Product Owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo de permisos por acción
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permisos (
  codigo      text PRIMARY KEY,
  modulo      text NOT NULL,
  descripcion text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.permisos IS
  'Catálogo de permisos por acción (ADR-SII-05). Los permisos retirados se desactivan (activo=false), nunca se borran.';
COMMENT ON COLUMN public.permisos.codigo IS
  'Código estable en snake_case minúsculo (el documento del cliente los cita en MAYÚSCULAS como notación).';

ALTER TABLE public.permisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permisos_seleccionar ON public.permisos;
CREATE POLICY permisos_seleccionar
  ON public.permisos
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.permisos FROM anon, authenticated;
GRANT SELECT ON TABLE public.permisos TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.permisos TO service_role;

-- Seed: 14 permisos vigentes + conjunto nuevo (matriz del plan §1.2).
-- No pisa estado: si el código ya existe, se conserva (DO NOTHING).
INSERT INTO public.permisos (codigo, modulo, descripcion) VALUES
  -- Legacy (mismos códigos que ya usa la aplicación)
  ('ver_clientes',                'clientes',    'Ver clientes'),
  ('aprobar_ordenes',             'ordenes',     'Aprobar/liberar órdenes'),
  ('registrar_pagos',             'cobranza',    'Registrar pagos'),
  ('registrar_gastos',            'gastos',      'Registrar gastos'),
  ('aplicar_saldos',              'cobranza',    'Aplicar saldos a favor'),
  ('eliminar',                    'sistema',     'Eliminar registros autorizados'),
  ('ver_finanzas',                'finanzas',    'Ver finanzas'),
  ('ver_pipeline_equipo',         'comercial',   'Ver pipeline de todo el equipo'),
  ('configuracion',               'sistema',     'Editar configuración'),
  ('cancelar_ordenes_en_proceso', 'ordenes',     'Cancelar órdenes en proceso'),
  ('gestionar_inventario',        'inventario',  'Gestionar inventario'),
  ('gestionar_produccion',        'produccion',  'Operar producción'),
  ('ver_planeacion',              'planeacion',  'Ver planeación'),
  ('gestionar_planeacion',        'planeacion',  'Gestionar planeación'),
  -- Clientes (B2)
  ('cliente_vista',               'clientes',    'Ver clientes (lista y ficha)'),
  ('cliente_editar',              'clientes',    'Crear y editar clientes'),
  ('cliente_documentos',          'clientes',    'Subir/reemplazar documentos del cliente'),
  ('cliente_comercial',           'clientes',    'Editar condiciones comerciales y crédito'),
  -- RFQ (B3)
  ('rfq_vista',                   'rfq',         'Ver RFQ'),
  ('rfq_crear',                   'rfq',         'Crear RFQ'),
  ('rfq_editar',                  'rfq',         'Editar datos generales del RFQ'),
  ('rfq_item_editar',             'rfq',         'Editar ítems y operaciones solicitadas'),
  ('rfq_marcar_listo',            'rfq',         'Marcar RFQ listo para propuesta'),
  ('rfq_cerrar',                  'rfq',         'Cerrar o cancelar RFQ'),
  -- Propuestas (B4)
  ('propuesta_vista',             'propuestas',  'Ver propuestas'),
  ('propuesta_editar_articulo',   'propuestas',  'Editar artículos/cantidades de la revisión'),
  ('propuesta_editar_precio',     'propuestas',  'Editar precios unitarios'),
  ('propuesta_editar_ruteo',      'propuestas',  'Editar ruteo estimado'),
  ('propuesta_editar_costo',      'propuestas',  'Editar costo interno (solo Management/Admin)'),
  ('propuesta_validar',           'propuestas',  'Validar propuesta (READY_TO_SEND)'),
  ('propuesta_generar_pdf',       'propuestas',  'Generar PDF de la revisión'),
  ('propuesta_enviar',            'propuestas',  'Marcar revisión como enviada'),
  ('propuesta_seguimiento',       'propuestas',  'Registrar seguimiento y próxima acción'),
  ('propuesta_aceptar',           'propuestas',  'Aceptar revisión / confirmar venta'),
  ('propuesta_crear_revision',    'propuestas',  'Crear nueva revisión (B, C…)'),
  ('propuesta_cerrar',            'propuestas',  'Rechazar o cerrar propuesta'),
  -- Órdenes (B5)
  ('orden_vista',                 'ordenes',     'Ver órdenes de trabajo'),
  ('orden_editar',                'ordenes',     'Editar orden en estados permitidos'),
  ('orden_liberar',               'ordenes',     'Liberar orden a producción'),
  ('orden_reprogramar',           'ordenes',     'Reprogramar orden'),
  ('orden_cerrar_admin',          'ordenes',     'Cierre administrativo de la orden'),
  ('orden_cancelar',              'ordenes',     'Cancelar orden'),
  ('orden_crear_interna',         'ordenes',     'Crear orden interna (TI) autorizada'),
  -- Producción (B6)
  ('produccion_operar',           'produccion',  'Operar producción (piso)'),
  ('calidad_liberar_primera_pieza','produccion', 'Liberar primera pieza'),
  ('calidad_inspeccionar',        'produccion',  'Registrar inspecciones de calidad'),
  -- Entregas (B7)
  ('entrega_generar',             'entregas',    'Generar notas de entrega'),
  ('entrega_evidencia',           'entregas',    'Gestionar evidencia y firma de entrega'),
  -- Sistema (B1)
  ('actividad_vista',             'sistema',     'Ver Actividad/Auditoría operativa'),
  ('catalogo_ver',                'sistema',     'Ver catálogos configurables'),
  ('catalogo_editar',             'sistema',     'Editar catálogos configurables'),
  ('usuario_admin',               'sistema',     'Administrar usuarios y roles'),
  ('permiso_admin',               'sistema',     'Administrar la matriz de permisos')
ON CONFLICT (codigo) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. `permisos_rol`: del CHECK enumerado a FK del catálogo
-- -----------------------------------------------------------------------------
ALTER TABLE public.permisos_rol DROP CONSTRAINT IF EXISTS permisos_rol_permiso_check;
ALTER TABLE public.permisos_rol DROP CONSTRAINT IF EXISTS permisos_rol_permiso_fk;
ALTER TABLE public.permisos_rol
  ADD CONSTRAINT permisos_rol_permiso_fk
  FOREIGN KEY (permiso) REFERENCES public.permisos (codigo);

-- -----------------------------------------------------------------------------
-- 3. Matriz por defecto (solo pares nuevos; nunca pisa lo ya otorgado)
--    admin → todos por diseño (`can()` siempre concede; la matriz es informativa)
-- -----------------------------------------------------------------------------
INSERT INTO public.permisos_rol (rol, permiso) VALUES
  -- vendedor (Customer Service): comercial completo, costos fuera
  ('vendedor', 'cliente_vista'),
  ('vendedor', 'cliente_editar'),
  ('vendedor', 'cliente_documentos'),
  ('vendedor', 'rfq_vista'),
  ('vendedor', 'rfq_crear'),
  ('vendedor', 'rfq_editar'),
  ('vendedor', 'rfq_item_editar'),
  ('vendedor', 'rfq_marcar_listo'),
  ('vendedor', 'propuesta_vista'),
  ('vendedor', 'propuesta_editar_articulo'),
  ('vendedor', 'propuesta_editar_precio'),
  ('vendedor', 'propuesta_editar_ruteo'),
  ('vendedor', 'propuesta_validar'),
  ('vendedor', 'propuesta_generar_pdf'),
  ('vendedor', 'propuesta_enviar'),
  ('vendedor', 'propuesta_seguimiento'),
  ('vendedor', 'propuesta_crear_revision'),
  ('vendedor', 'catalogo_ver'),
  -- gerente (Management): todo el flujo + costos + aprobaciones + catálogos
  ('gerente', 'cliente_vista'),
  ('gerente', 'cliente_editar'),
  ('gerente', 'cliente_documentos'),
  ('gerente', 'cliente_comercial'),
  ('gerente', 'rfq_vista'),
  ('gerente', 'rfq_crear'),
  ('gerente', 'rfq_editar'),
  ('gerente', 'rfq_item_editar'),
  ('gerente', 'rfq_marcar_listo'),
  ('gerente', 'rfq_cerrar'),
  ('gerente', 'propuesta_vista'),
  ('gerente', 'propuesta_editar_articulo'),
  ('gerente', 'propuesta_editar_precio'),
  ('gerente', 'propuesta_editar_ruteo'),
  ('gerente', 'propuesta_editar_costo'),
  ('gerente', 'propuesta_validar'),
  ('gerente', 'propuesta_generar_pdf'),
  ('gerente', 'propuesta_enviar'),
  ('gerente', 'propuesta_seguimiento'),
  ('gerente', 'propuesta_aceptar'),
  ('gerente', 'propuesta_crear_revision'),
  ('gerente', 'propuesta_cerrar'),
  ('gerente', 'orden_vista'),
  ('gerente', 'orden_editar'),
  ('gerente', 'orden_liberar'),
  ('gerente', 'orden_reprogramar'),
  ('gerente', 'orden_cerrar_admin'),
  ('gerente', 'orden_cancelar'),
  ('gerente', 'orden_crear_interna'),
  ('gerente', 'produccion_operar'),
  ('gerente', 'calidad_liberar_primera_pieza'),
  ('gerente', 'calidad_inspeccionar'),
  ('gerente', 'entrega_generar'),
  ('gerente', 'entrega_evidencia'),
  ('gerente', 'actividad_vista'),
  ('gerente', 'catalogo_ver'),
  ('gerente', 'catalogo_editar'),
  -- contador (Administrative): consulta comercial + operación de entregas
  ('contador', 'cliente_vista'),
  ('contador', 'rfq_vista'),
  ('contador', 'propuesta_vista'),
  ('contador', 'orden_vista'),
  ('contador', 'entrega_generar'),
  ('contador', 'entrega_evidencia'),
  -- operador (Operator): solo producción/calidad; nunca precios
  ('operador', 'produccion_operar'),
  ('operador', 'calidad_liberar_primera_pieza'),
  ('operador', 'calidad_inspeccionar')
ON CONFLICT (rol, permiso) DO NOTHING;

INSERT INTO public.permisos_rol (rol, permiso)
SELECT 'admin', p.codigo FROM public.permisos p
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. RPC: reemplazo atómico de la matriz de un rol (admin no editable)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actualizar_permisos_rol(
  p_rol text,
  p_permisos text[],
  p_actor_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.usuarios WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.rol <> 'admin' OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso_permisos' USING ERRCODE = '42501';
  END IF;

  IF p_rol IS NULL OR p_rol NOT IN ('admin','vendedor','gerente','operador','contador') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  -- El rol admin siempre tiene todos los permisos por diseño de `can()`;
  -- su fila no se administra desde la matriz para evitar un estado engañoso.
  IF p_rol = 'admin' THEN
    RAISE EXCEPTION 'admin_permisos_inmutables' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_permisos, '{}'::text[])) AS x(codigo)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permisos p WHERE p.codigo = x.codigo AND p.activo
    )
  ) THEN
    RAISE EXCEPTION 'permiso_desconocido' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.permisos_rol WHERE rol = p_rol;
  INSERT INTO public.permisos_rol (rol, permiso)
  SELECT p_rol, s.codigo
  FROM (SELECT DISTINCT unnest(coalesce(p_permisos, '{}'::text[])) AS codigo) s
  ON CONFLICT (rol, permiso) DO NOTHING;

  RETURN (SELECT count(*)::integer FROM public.permisos_rol WHERE rol = p_rol);
END;
$$;

COMMENT ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid) IS
  'Reemplaza la matriz de permisos de un rol (excluye admin). Solo service_role; valida actor admin activo.';

-- -----------------------------------------------------------------------------
-- 5. RPC: cambio de rol de usuario (protecciones de auto-bloqueo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_rol_usuario(
  p_usuario_id uuid,
  p_rol text,
  p_actor_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_objetivo public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.usuarios WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.rol <> 'admin' OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso_usuarios' USING ERRCODE = '42501';
  END IF;

  IF p_rol IS NULL OR p_rol NOT IN ('admin','vendedor','gerente','operador','contador') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  -- Un admin no puede modificarse a sí mismo (evita auto-bloqueo).
  IF p_usuario_id = p_actor_id THEN
    RAISE EXCEPTION 'no_puede_autodegradarse' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_objetivo FROM public.usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '22023';
  END IF;

  -- No dejar el sistema sin ningún admin activo.
  IF v_objetivo.rol = 'admin' AND v_objetivo.activo AND p_rol <> 'admin' THEN
    IF (SELECT count(*) FROM public.usuarios WHERE rol = 'admin' AND activo) <= 1 THEN
      RAISE EXCEPTION 'ultimo_admin' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.usuarios
  SET rol = p_rol, actualizado_en = now()
  WHERE id = p_usuario_id;
END;
$$;

COMMENT ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text) IS
  'Cambia el rol de un usuario con protección anti-auto-bloqueo y de último admin. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 6. RPC: activar/desactivar usuario (protecciones de auto-bloqueo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean,
  p_actor_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_objetivo public.usuarios%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.usuarios WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.rol <> 'admin' OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso_usuarios' USING ERRCODE = '42501';
  END IF;

  IF p_activo IS NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido' USING ERRCODE = '22023';
  END IF;

  IF p_usuario_id = p_actor_id THEN
    RAISE EXCEPTION 'no_puede_autodesactivarse' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_objetivo FROM public.usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '22023';
  END IF;

  IF p_activo IS FALSE AND v_objetivo.rol = 'admin' AND v_objetivo.activo THEN
    IF (SELECT count(*) FROM public.usuarios WHERE rol = 'admin' AND activo) <= 1 THEN
      RAISE EXCEPTION 'ultimo_admin' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.usuarios
  SET activo = p_activo, actualizado_en = now()
  WHERE id = p_usuario_id;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text) IS
  'Activa/desactiva un usuario con protección de último admin y auto-desactivación. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 7. Privilegios de ejecución (solo servidor)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text) TO service_role;
