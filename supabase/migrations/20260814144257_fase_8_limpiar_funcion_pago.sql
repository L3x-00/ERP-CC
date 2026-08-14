-- Elimina una variable PL/pgSQL no usada sin modificar saldos ni recibos.
DO $$
DECLARE
  v_definicion text;
BEGIN
  SELECT pg_get_functiondef(
    'public.registrar_pago_ar_atomico(uuid, numeric, text, numeric, text, text, uuid, uuid, text, uuid)'::regprocedure
  ) INTO v_definicion;

  v_definicion := replace(v_definicion, E'  v_usuario public.usuarios%ROWTYPE;\n', '');
  v_definicion := replace(
    v_definicion,
    E'  SELECT usuario.*\n  INTO v_usuario\n  FROM public.usuarios AS usuario',
    E'  PERFORM 1\n  FROM public.usuarios AS usuario'
  );
  EXECUTE v_definicion;
END;
$$;
