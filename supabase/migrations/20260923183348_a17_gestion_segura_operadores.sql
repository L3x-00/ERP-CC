-- A17/CFG-05: el PIN se administra únicamente en una transacción autorizada.
-- pgcrypto ya forma parte del stack Supabase; no se mueve de su esquema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS pin_cambiado_en timestamptz;

COMMENT ON COLUMN public.usuarios.pin_cambiado_en IS
  'Marca de rotación del PIN; sesiones de piso iniciadas antes quedan revocadas.';

-- A01 protegió SELECT del hash. El GRANT de UPDATE a authenticated de la
-- instalación limpia aún permitía a un admin cambiar el hash fuera del gate.
REVOKE UPDATE ON TABLE public.usuarios FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (pin_operador, rol, activo, email, nombre_completo)
  ON TABLE public.usuarios FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_operador_admin(
  p_actor_id uuid,
  p_operador_id uuid,
  p_nombre text,
  p_pin text,
  p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_operador public.usuarios%ROWTYPE;
  v_existente record;
  v_hash_comparable text;
  v_hash_nuevo text;
BEGIN
  IF p_actor_id IS NULL OR p_operador_id IS NULL OR p_activo IS NULL
     OR p_nombre IS NULL OR char_length(btrim(p_nombre)) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'datos_operador_invalidos' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.usuarios AS actor
  WHERE actor.id = p_actor_id AND actor.rol = 'admin' AND actor.activo
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_sin_permiso' USING ERRCODE = '42501';
  END IF;

  -- Un único orden de escritura serializa los cambios de PIN entre procesos y
  -- servidores; el scan bcrypt y la actualización ocurren en la misma tx.
  PERFORM pg_catalog.pg_advisory_xact_lock(17001, 20260923);
  SELECT * INTO v_operador FROM public.usuarios AS operador
  WHERE operador.id = p_operador_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operador_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF v_operador.rol NOT IN ('operador', 'vendedor') THEN
    RAISE EXCEPTION 'usuario_no_convertible_a_operador' USING ERRCODE = '23514';
  END IF;
  IF p_pin IS NULL AND (v_operador.rol <> 'operador'
      OR (p_activo AND NOT v_operador.activo)
      OR (p_activo AND v_operador.pin_operador IS NULL)) THEN
    RAISE EXCEPTION 'pin_requerido' USING ERRCODE = '23514';
  END IF;

  v_hash_nuevo := v_operador.pin_operador;
  IF p_pin IS NOT NULL THEN
    IF p_pin !~ '^[0-9]{4,6}$' THEN
      RAISE EXCEPTION 'pin_formato_invalido' USING ERRCODE = '23514';
    END IF;
    FOR v_existente IN
      SELECT operador.id, operador.pin_operador
      FROM public.usuarios AS operador
      WHERE operador.rol = 'operador' AND operador.activo
        AND operador.id <> p_operador_id
        AND operador.pin_operador IS NOT NULL
    LOOP
      -- bcryptjs persiste $2b$; pgcrypto acepta el mismo hash con $2a$.
      v_hash_comparable := CASE
        WHEN left(v_existente.pin_operador, 4) = '$2b$'
        THEN '$2a$' || substr(v_existente.pin_operador, 5)
        ELSE v_existente.pin_operador
      END;
      IF extensions.crypt(p_pin, v_hash_comparable) = v_hash_comparable THEN
        RAISE EXCEPTION 'pin_duplicado' USING ERRCODE = '23505';
      END IF;
    END LOOP;
    v_hash_nuevo := extensions.crypt(p_pin, extensions.gen_salt('bf', 10));
  END IF;

  UPDATE public.usuarios AS operador
  SET nombre_completo = btrim(p_nombre),
      rol = 'operador',
      activo = p_activo,
      pin_operador = v_hash_nuevo,
      pin_cambiado_en = CASE WHEN p_pin IS NOT NULL
        THEN clock_timestamp() ELSE operador.pin_cambiado_en END
  WHERE operador.id = p_operador_id;
END;
$$;

COMMENT ON FUNCTION public.guardar_operador_admin(uuid, uuid, text, text, boolean) IS
  'A17: administra operador y PIN bajo lock, autoriza admin activo en SQL, rechaza duplicados bcrypt y conserva historia al retirar.';

REVOKE EXECUTE ON FUNCTION public.guardar_operador_admin(uuid, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_operador_admin(uuid, uuid, text, text, boolean)
  TO service_role;
