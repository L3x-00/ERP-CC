-- A20/ORD-07: metas ordenadas por proceso, separadas de la cantidad física
-- final de la partida. El historial previo no se inventa como avance granular.
CREATE TABLE IF NOT EXISTS public.metas_proceso_partida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion(id) ON DELETE CASCADE,
  secuencia smallint NOT NULL CHECK (secuencia BETWEEN 1 AND 20),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
  meta_piezas numeric(14,4) NOT NULL CHECK (meta_piezas > 0 AND meta_piezas <= 9999999999.9999),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_proceso_partida_secuencia_unica UNIQUE (partida_id, secuencia)
);

CREATE INDEX IF NOT EXISTS idx_metas_proceso_partida_partida
  ON public.metas_proceso_partida(partida_id, secuencia);

DROP TRIGGER IF EXISTS trigger_metas_proceso_partida_actualizado_en ON public.metas_proceso_partida;
CREATE TRIGGER trigger_metas_proceso_partida_actualizado_en
  BEFORE UPDATE ON public.metas_proceso_partida FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

ALTER TABLE public.metas_proceso_partida ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.metas_proceso_partida FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.metas_proceso_partida TO authenticated;
GRANT ALL ON TABLE public.metas_proceso_partida TO service_role;
DROP POLICY IF EXISTS metas_proceso_partida_lectura ON public.metas_proceso_partida;
CREATE POLICY metas_proceso_partida_lectura ON public.metas_proceso_partida
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.usuarios usuario
      WHERE usuario.id = auth.uid() AND usuario.activo)
  );

-- Las altas nuevas heredan la lista RFQ en su orden. Si la fuente no especifica
-- procesos, se crea una única etapa explícita para la fabricación física.
CREATE OR REPLACE FUNCTION public.inicializar_metas_proceso_partida()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.metas_proceso_partida(partida_id, secuencia, nombre, meta_piezas)
  SELECT NEW.id, proceso.ordinality::smallint, btrim(proceso.nombre), NEW.cantidad_solicitada
  FROM unnest(CASE WHEN cardinality(NEW.procesos) = 0
    THEN ARRAY['Fabricación']::text[] ELSE NEW.procesos END)
    WITH ORDINALITY AS proceso(nombre, ordinality);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_inicializar_metas_proceso_partida
  ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_inicializar_metas_proceso_partida
  AFTER INSERT ON public.partidas_orden_produccion FOR EACH ROW
  EXECUTE FUNCTION public.inicializar_metas_proceso_partida();

-- La última etapa produce las piezas físicas que se entregan. Si se cambia la
-- cantidad de un borrador, su meta final acompaña la nueva cantidad.
CREATE OR REPLACE FUNCTION public.ajustar_meta_final_partida()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.cantidad_solicitada IS DISTINCT FROM OLD.cantidad_solicitada THEN
    UPDATE public.metas_proceso_partida meta
    SET meta_piezas = NEW.cantidad_solicitada
    WHERE meta.partida_id = NEW.id AND meta.secuencia = (
      SELECT max(ultima.secuencia) FROM public.metas_proceso_partida ultima
      WHERE ultima.partida_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_ajustar_meta_final_partida
  ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_ajustar_meta_final_partida
  AFTER UPDATE OF cantidad_solicitada ON public.partidas_orden_produccion
  FOR EACH ROW EXECUTE FUNCTION public.ajustar_meta_final_partida();

-- Solo borradores son configurables sin inventar progreso pasado. Los trabajos
-- históricos en ejecución o completados conservan su modalidad anterior.
INSERT INTO public.metas_proceso_partida(partida_id, secuencia, nombre, meta_piezas)
SELECT partida.id, proceso.ordinality::smallint, btrim(proceso.nombre), partida.cantidad_solicitada
FROM public.partidas_orden_produccion partida
JOIN public.ordenes_produccion orden ON orden.id = partida.orden_id
CROSS JOIN LATERAL unnest(CASE WHEN cardinality(partida.procesos) = 0
  THEN ARRAY['Fabricación']::text[] ELSE partida.procesos END)
  WITH ORDINALITY AS proceso(nombre, ordinality)
WHERE orden.estado = 'borrador'
ON CONFLICT (partida_id, secuencia) DO NOTHING;

CREATE OR REPLACE FUNCTION public.configurar_metas_proceso_partida(
  p_partida_id uuid, p_orden_actualizado_en timestamptz,
  p_procesos jsonb, p_actor_id uuid
)
RETURNS TABLE (partida_id uuid, orden_actualizado_en timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_orden_id uuid;
  v_orden public.ordenes_produccion%ROWTYPE;
  v_cantidad_solicitada numeric;
BEGIN
  IF p_partida_id IS NULL OR p_orden_actualizado_en IS NULL OR p_actor_id IS NULL
     OR p_procesos IS NULL OR jsonb_typeof(p_procesos) <> 'array'
     OR jsonb_array_length(p_procesos) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'metas_proceso_invalidas' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_procesos) AS elemento(proceso)
    WHERE jsonb_typeof(elemento.proceso) <> 'object'
       OR jsonb_typeof(elemento.proceso -> 'nombre') IS DISTINCT FROM 'string'
       OR length(btrim(elemento.proceso ->> 'nombre')) NOT BETWEEN 1 AND 60
       OR CASE WHEN jsonb_typeof(elemento.proceso -> 'meta_piezas') = 'number'
         THEN (elemento.proceso ->> 'meta_piezas')::numeric <= 0
           OR (elemento.proceso ->> 'meta_piezas')::numeric > 9999999999.9999
           OR scale((elemento.proceso ->> 'meta_piezas')::numeric) > 4
         ELSE true END
  ) THEN
    RAISE EXCEPTION 'metas_proceso_invalidas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT partida.orden_id INTO v_orden_id
  FROM public.partidas_orden_produccion partida WHERE partida.id = p_partida_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT partida.cantidad_solicitada INTO v_cantidad_solicitada
    FROM public.partidas_orden_produccion partida
    WHERE partida.id = p_partida_id FOR UPDATE;
  IF (p_procesos -> (jsonb_array_length(p_procesos) - 1) ->> 'meta_piezas')::numeric
     <> v_cantidad_solicitada THEN
    RAISE EXCEPTION 'meta_final_no_equivale_a_cantidad' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_orden FROM public.ordenes_produccion orden
    WHERE orden.id = v_orden_id FOR UPDATE;
  IF NOT FOUND OR v_orden.estado <> 'borrador' THEN
    RAISE EXCEPTION 'orden_no_editable' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orden.actualizado_en <> p_orden_actualizado_en THEN
    RAISE EXCEPTION 'orden_desactualizada' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.usuarios actor
  JOIN public.permisos_rol permiso ON permiso.rol = actor.rol
  WHERE actor.id = p_actor_id AND actor.activo AND permiso.permiso = 'aprobar_ordenes'
  FOR KEY SHARE OF actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin_permiso_configurar_procesos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registros_avance_partida avance
    WHERE avance.partida_id = p_partida_id)
     OR EXISTS (SELECT 1 FROM public.sesiones_trabajo sesion
       WHERE sesion.partida_id = p_partida_id)
     OR EXISTS (SELECT 1 FROM public.programacion_areas programa
       WHERE programa.partida_id = p_partida_id
         AND programa.estado_planeacion <> 'cancelada') THEN
    RAISE EXCEPTION 'partida_con_historial' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.metas_proceso_partida meta WHERE meta.partida_id = p_partida_id;
  INSERT INTO public.metas_proceso_partida(partida_id, secuencia, nombre, meta_piezas)
  SELECT p_partida_id, proceso.ordinality::smallint,
    btrim(proceso.valor ->> 'nombre'), (proceso.valor ->> 'meta_piezas')::numeric
  FROM jsonb_array_elements(p_procesos) WITH ORDINALITY AS proceso(valor, ordinality);
  UPDATE public.partidas_orden_produccion partida
  SET procesos = ARRAY(
    SELECT btrim(proceso.valor ->> 'nombre')
    FROM jsonb_array_elements(p_procesos) WITH ORDINALITY AS proceso(valor, ordinality)
    ORDER BY proceso.ordinality
  )
  WHERE partida.id = p_partida_id;
  UPDATE public.ordenes_produccion orden SET actualizado_en = clock_timestamp()
    WHERE orden.id = v_orden_id;
  RETURN QUERY SELECT p_partida_id, orden.actualizado_en
    FROM public.ordenes_produccion orden WHERE orden.id = v_orden_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_metas_proceso_partida(uuid, timestamptz, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_metas_proceso_partida(uuid, timestamptz, jsonb, uuid)
  TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'metas_proceso_partida') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_proceso_partida;
  END IF;
END $$;
