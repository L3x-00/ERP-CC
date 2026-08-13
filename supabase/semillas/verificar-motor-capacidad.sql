-- Verificación remota reutilizable de capacidad y candado para la Sub-fase 6.2.
-- Conserva fixtures SIM-PLN y elimina todas las filas temporales que crea.
DO $$
DECLARE
  v_programacion_persistente uuid;
  v_actualizado_persistente timestamptz;
  v_orden_uno uuid := gen_random_uuid();
  v_orden_dos uuid := gen_random_uuid();
  v_partida_uno uuid := gen_random_uuid();
  v_partida_dos uuid := gen_random_uuid();
  v_programacion_temporal uuid;
  v_actualizado_temporal timestamptz;
BEGIN
  SELECT id, actualizado_en
  INTO v_programacion_persistente, v_actualizado_persistente
  FROM public.programacion_areas
  WHERE partida_id = '60000000-0000-4000-8000-000000000201'::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fixture_persistente_inexistente';
  END IF;

  PERFORM 1
  FROM public.activar_modo_preparacion(v_programacion_persistente, v_actualizado_persistente);

  INSERT INTO public.ordenes_produccion (
    id, folio, cliente_id, estado, prioridad, fecha_compromiso
  ) VALUES
    (
      v_orden_uno,
      'OP-900191',
      '60000000-0000-4000-8000-000000000001'::uuid,
      'programada',
      'normal',
      '2026-09-30T18:00:00Z'
    ),
    (
      v_orden_dos,
      'OP-900192',
      '60000000-0000-4000-8000-000000000001'::uuid,
      'programada',
      'normal',
      '2026-09-30T18:00:00Z'
    );

  INSERT INTO public.partidas_orden_produccion (
    id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida
  ) VALUES
    (v_partida_uno, v_orden_uno, 'TMP-F6-MOTOR-01', 1, 'pieza'),
    (v_partida_dos, v_orden_dos, 'TMP-F6-MOTOR-02', 1, 'pieza');

  SELECT id, actualizado_en
  INTO v_programacion_temporal, v_actualizado_temporal
  FROM public.programar_partida_recurso(
    v_orden_uno,
    v_partida_uno,
    '60000000-0000-4000-8000-000000000301'::uuid,
    1::smallint,
    '2026-09-15'::date,
    'matutino'::text,
    2::numeric,
    1::integer
  );

  BEGIN
    PERFORM 1
    FROM public.activar_modo_preparacion(v_programacion_temporal, v_actualizado_temporal);
    RAISE EXCEPTION 'candado_no_rechazo';
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM NOT LIKE 'recurso_ocupado%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM 1
    FROM public.programar_partida_recurso(
      v_orden_dos,
      v_partida_dos,
      '60000000-0000-4000-8000-000000000301'::uuid,
      1::smallint,
      '2026-09-15'::date,
      'matutino'::text,
      4::numeric,
      1::integer
    );
    RAISE EXCEPTION 'capacidad_no_rechazo';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE 'capacidad_insuficiente%' THEN RAISE; END IF;
  END;

  DELETE FROM public.programacion_areas WHERE id = v_programacion_temporal;
  DELETE FROM public.ordenes_produccion WHERE id IN (v_orden_uno, v_orden_dos);
  IF EXISTS (
    SELECT 1
    FROM public.ordenes_produccion
    WHERE id IN (v_orden_uno, v_orden_dos)
  ) THEN
    RAISE EXCEPTION 'limpieza_temporal_incompleta';
  END IF;
END;
$$;

SELECT
  has_function_privilege(
    'authenticated',
    'public.programar_partida_recurso(uuid,uuid,uuid,smallint,date,text,numeric,integer)',
    'EXECUTE'
  ) AS authenticated_puede_programar,
  has_function_privilege(
    'authenticated',
    'public.activar_modo_preparacion(uuid,timestamp with time zone)',
    'EXECUTE'
  ) AS authenticated_puede_preparar,
  has_function_privilege(
    'service_role',
    'public.programar_partida_recurso(uuid,uuid,uuid,smallint,date,text,numeric,integer)',
    'EXECUTE'
  ) AS servicio_puede_programar;
