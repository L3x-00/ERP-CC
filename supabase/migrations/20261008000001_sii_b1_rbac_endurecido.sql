-- =============================================================================
-- Auditoría de cumplimiento B1 — Endurecimiento de usuarios, roles y permisos
-- Hallazgos: H-B1-03, H-B1-05, H-B1-06, H-B1-07, H-B1-09, H-B1-13
--   (docs/plan-erp-sii/auditoria-cumplimiento/B1-hallazgos.md)
-- Documento del cliente: §5 L169-184 (Administrative con cierres
--   administrativos; Admin no elimina su acceso crítico; permisos por acción
--   aplicados en servidor), §6 L200 (control optimista de versión), §6 L204 y
--   §3 L68-69 (auditoría append-only con usuario, fecha, entidad, acción y
--   contexto). Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.1 y §1.2.
--
-- Cambios:
--   1. Un permiso desactivado deja de conceder acceso: los helpers de RLS/RPC
--      exigen permisos.activo y, al desactivar un permiso, un trigger retira
--      sus asignaciones con auditoría (cubre también las RPC que consultan
--      permisos_rol directamente).
--   2. cambiar_rol_usuario / cambiar_estado_usuario: candado común de
--      administradores (sin carrera en la guarda de "último admin activo") y
--      auditoría en la misma transacción con valor anterior, nuevo y motivo.
--   3. actualizar_permisos_rol: candado por rol, CAS por conjunto esperado
--      (`matriz_desactualizada`) y auditoría de permisos agregados/retirados.
--   4. Matriz: Administrative (contador) con orden_cerrar_admin.
-- Idempotente y no destructiva. Aplicar solo en local; el remoto lo aplica el PO.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.permisos') IS NULL OR to_regclass('public.logs') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20261005100001_sii_b1_permisos_catalogo antes de esta migración';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Permisos inactivos: no conceden acceso (H-B1-07)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.usuario_tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS usuario
    INNER JOIN public.permisos_rol AS permiso ON permiso.rol = usuario.rol
    INNER JOIN public.permisos AS catalogo
      ON catalogo.codigo = permiso.permiso AND catalogo.activo
    WHERE usuario.id = (SELECT auth.uid())
      AND usuario.activo = true
      AND permiso.permiso = p_permiso
  );
$$;

CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso(p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.permisos_rol pr ON pr.rol = u.rol
    JOIN public.permisos p ON p.codigo = pr.permiso AND p.activo
    WHERE u.id = auth.uid()
      AND u.activo = true
      AND pr.permiso = p_permiso
  );
$$;

CREATE OR REPLACE FUNCTION privado.actor_con_permiso(p_actor_id uuid, p_permiso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios AS u
    WHERE u.id = p_actor_id
      AND u.activo = true
      AND (
        u.rol = 'admin'
        OR EXISTS (
          SELECT 1
          FROM public.permisos_rol AS pr
          INNER JOIN public.permisos AS catalogo
            ON catalogo.codigo = pr.permiso AND catalogo.activo
          WHERE pr.rol = u.rol AND pr.permiso = p_permiso
        )
      )
  );
$$;

-- Al desactivar un permiso se retiran sus asignaciones (las RPC que consultan
-- permisos_rol directamente dejan de concederlo) y el retiro queda auditado.
-- Reactivar el permiso no restaura asignaciones: el admin las vuelve a otorgar.
CREATE OR REPLACE FUNCTION privado.retirar_asignaciones_permiso_inactivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_roles text[];
  v_actor public.usuarios%ROWTYPE;
BEGIN
  WITH retiradas AS (
    DELETE FROM public.permisos_rol AS pr
    WHERE pr.permiso = new.codigo
    RETURNING pr.rol
  )
  SELECT coalesce(array_agg(rol ORDER BY rol), '{}'::text[]) INTO v_roles FROM retiradas;

  SELECT * INTO v_actor FROM public.usuarios WHERE id = (SELECT auth.uid());

  INSERT INTO public.logs (usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles)
  VALUES (
    v_actor.id,
    coalesce(v_actor.nombre_completo, v_actor.email, 'sistema'),
    coalesce(v_actor.rol, 'admin'),
    'retirar_permiso_inactivo',
    'permisos',
    new.codigo,
    jsonb_build_object('permiso', new.codigo, 'roles_retirados', to_jsonb(v_roles))
  );
  RETURN new;
END;
$$;

COMMENT ON FUNCTION privado.retirar_asignaciones_permiso_inactivo() IS
  'Al desactivar un permiso, retira sus asignaciones de permisos_rol y lo audita (H-B1-07).';

DROP TRIGGER IF EXISTS retirar_asignaciones_permiso_inactivo ON public.permisos;
CREATE TRIGGER retirar_asignaciones_permiso_inactivo
  AFTER UPDATE OF activo ON public.permisos
  FOR EACH ROW
  WHEN (old.activo IS TRUE AND new.activo IS FALSE)
  EXECUTE FUNCTION privado.retirar_asignaciones_permiso_inactivo();

REVOKE ALL ON FUNCTION privado.retirar_asignaciones_permiso_inactivo() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Cambio de rol y de estado: candado común y auditoría (H-B1-06, H-B1-09)
--    Orden de candados: candado de administradores (advisory) → fila objetivo.
--    El candado serializa todo cambio que pueda reducir los admins activos, así
--    dos admins que se degradan mutuamente ya no dejan el sistema sin admins.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cambiar_rol_usuario(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.cambiar_rol_usuario(
  p_usuario_id uuid,
  p_rol text,
  p_actor_id uuid,
  p_motivo text,
  p_correlation_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_objetivo public.usuarios%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sii_b1_usuarios_admin'));

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

  IF p_usuario_id = p_actor_id THEN
    RAISE EXCEPTION 'no_puede_autodegradarse' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_objetivo FROM public.usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = '22023';
  END IF;

  IF v_objetivo.rol = 'admin' AND v_objetivo.activo AND p_rol <> 'admin' THEN
    IF (SELECT count(*) FROM public.usuarios WHERE rol = 'admin' AND activo) <= 1 THEN
      RAISE EXCEPTION 'ultimo_admin' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.usuarios
  SET rol = p_rol, actualizado_en = now()
  WHERE id = p_usuario_id;

  INSERT INTO public.logs (usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id)
  VALUES (
    v_actor.id,
    coalesce(v_actor.nombre_completo, v_actor.email, 'admin'),
    v_actor.rol,
    'cambiar_rol_usuario',
    'usuarios',
    p_usuario_id::text,
    jsonb_build_object(
      'usuario', coalesce(v_objetivo.nombre_completo, v_objetivo.email),
      'rol_anterior', v_objetivo.rol,
      'rol_nuevo', p_rol,
      'motivo', btrim(p_motivo)
    ),
    p_correlation_id
  );
END;
$$;

COMMENT ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text, uuid) IS
  'Cambia el rol de un usuario: candado común de administradores, protección anti-auto-bloqueo y de último admin, auditoría con rol anterior/nuevo en la misma transacción. Solo service_role.';

DROP FUNCTION IF EXISTS public.cambiar_estado_usuario(uuid, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario(
  p_usuario_id uuid,
  p_activo boolean,
  p_actor_id uuid,
  p_motivo text,
  p_correlation_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_objetivo public.usuarios%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sii_b1_usuarios_admin'));

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

  INSERT INTO public.logs (usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id)
  VALUES (
    v_actor.id,
    coalesce(v_actor.nombre_completo, v_actor.email, 'admin'),
    v_actor.rol,
    'cambiar_estado_usuario',
    'usuarios',
    p_usuario_id::text,
    jsonb_build_object(
      'usuario', coalesce(v_objetivo.nombre_completo, v_objetivo.email),
      'activo_anterior', v_objetivo.activo,
      'activo_nuevo', p_activo,
      'motivo', btrim(p_motivo)
    ),
    p_correlation_id
  );
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text, uuid) IS
  'Activa/desactiva un usuario: candado común de administradores, protección de último admin y auto-desactivación, auditoría con estado anterior/nuevo en la misma transacción. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 3. Matriz de permisos: candado por rol, CAS y auditoría (H-B1-05, H-B1-09)
--    Orden de candados: candado del rol (advisory) → filas de permisos_rol.
--    p_permisos_esperados es el conjunto que la pantalla cargó; si el vigente
--    cambió entretanto se rechaza con `matriz_desactualizada`.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.actualizar_permisos_rol(text, text[], uuid);

CREATE OR REPLACE FUNCTION public.actualizar_permisos_rol(
  p_rol text,
  p_permisos text[],
  p_actor_id uuid,
  p_permisos_esperados text[],
  p_correlation_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE;
  v_vigentes text[];
  v_esperados text[];
  v_nuevos text[];
  v_agregados text[];
  v_retirados text[];
BEGIN
  SELECT * INTO v_actor FROM public.usuarios WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.rol <> 'admin' OR v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'sin_permiso_permisos' USING ERRCODE = '42501';
  END IF;

  IF p_rol IS NULL OR p_rol NOT IN ('admin','vendedor','gerente','operador','contador') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  -- El rol admin siempre tiene todos los permisos por diseño de `can()`.
  IF p_rol = 'admin' THEN
    RAISE EXCEPTION 'admin_permisos_inmutables' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sii_b1_permisos_rol:' || p_rol));

  SELECT coalesce(array_agg(pr.permiso ORDER BY pr.permiso), '{}'::text[])
  INTO v_vigentes
  FROM public.permisos_rol AS pr
  WHERE pr.rol = p_rol;

  SELECT coalesce(array_agg(DISTINCT x.codigo ORDER BY x.codigo), '{}'::text[])
  INTO v_esperados
  FROM unnest(coalesce(p_permisos_esperados, '{}'::text[])) AS x(codigo);

  IF p_permisos_esperados IS NULL OR v_vigentes IS DISTINCT FROM v_esperados THEN
    RAISE EXCEPTION 'matriz_desactualizada' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(DISTINCT x.codigo ORDER BY x.codigo), '{}'::text[])
  INTO v_nuevos
  FROM unnest(coalesce(p_permisos, '{}'::text[])) AS x(codigo);

  IF EXISTS (
    SELECT 1
    FROM unnest(v_nuevos) AS x(codigo)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permisos AS p WHERE p.codigo = x.codigo AND p.activo
    )
  ) THEN
    RAISE EXCEPTION 'permiso_desconocido' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(x.codigo ORDER BY x.codigo), '{}'::text[])
  INTO v_agregados
  FROM unnest(v_nuevos) AS x(codigo)
  WHERE NOT (x.codigo = ANY (v_vigentes));

  SELECT coalesce(array_agg(x.codigo ORDER BY x.codigo), '{}'::text[])
  INTO v_retirados
  FROM unnest(v_vigentes) AS x(codigo)
  WHERE NOT (x.codigo = ANY (v_nuevos));

  DELETE FROM public.permisos_rol AS pr
  WHERE pr.rol = p_rol AND pr.permiso = ANY (v_retirados);

  INSERT INTO public.permisos_rol (rol, permiso)
  SELECT p_rol, x.codigo FROM unnest(v_agregados) AS x(codigo)
  ON CONFLICT (rol, permiso) DO NOTHING;

  INSERT INTO public.logs (usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id)
  VALUES (
    v_actor.id,
    coalesce(v_actor.nombre_completo, v_actor.email, 'admin'),
    v_actor.rol,
    'actualizar_permisos_rol',
    'permisos',
    p_rol,
    jsonb_build_object(
      'rol', p_rol,
      'agregados', to_jsonb(v_agregados),
      'retirados', to_jsonb(v_retirados),
      'total', cardinality(v_nuevos)
    ),
    p_correlation_id
  );

  RETURN cardinality(v_nuevos);
END;
$$;

COMMENT ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid, text[], uuid) IS
  'Reemplaza la matriz de un rol (excluye admin) con candado por rol, CAS por conjunto esperado (matriz_desactualizada) y auditoría de agregados/retirados. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 4. Matriz por defecto alineada con §5: Administrative cierra administrativamente
--    la orden (decisión del cliente #9: al 100 % entregado). (H-B1-03)
-- -----------------------------------------------------------------------------
INSERT INTO public.permisos_rol (rol, permiso)
SELECT 'contador', p.codigo
FROM public.permisos AS p
WHERE p.codigo = 'orden_cerrar_admin' AND p.activo
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Privilegios de ejecución (solo servidor)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid, text[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_permisos_rol(text, text[], uuid, text[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_rol_usuario(uuid, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_usuario(uuid, boolean, uuid, text, uuid) TO service_role;
