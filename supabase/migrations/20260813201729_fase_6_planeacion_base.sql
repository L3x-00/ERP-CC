-- =============================================================================
-- Fase 6.1: Planeación por recurso, capacidad por turno y candados base.
--
-- La programación no reutiliza el texto libre de máquina de una partida. Cada
-- fila apunta a un recurso identificable; el candado activo por recurso se
-- impone con un índice único parcial atómico de PostgreSQL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permisos granulares de Planeación.
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
    'gestionar_produccion',
    'ver_planeacion',
    'gestionar_planeacion'
  ));

INSERT INTO public.permisos_rol (rol, permiso) VALUES
  ('admin', 'ver_planeacion'),
  ('admin', 'gestionar_planeacion'),
  ('gerente', 'ver_planeacion'),
  ('gerente', 'gestionar_planeacion')
ON CONFLICT (rol, permiso) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Recursos de planeación y su capacidad normal por turno.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recursos_planeacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  area text NOT NULL CHECK (area IN ('sheet_metal', 'taller', 'acabados', 'ext')),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recursos_planeacion_codigo_formato_valido
    CHECK (codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'),
  CONSTRAINT recursos_planeacion_nombre_no_vacio
    CHECK (btrim(nombre) <> '')
);

COMMENT ON TABLE public.recursos_planeacion IS
  'Recurso programable: máquina concreta, área virtual o capacidad externa.';

CREATE TABLE IF NOT EXISTS public.capacidades_recurso_turno (
  recurso_id uuid NOT NULL REFERENCES public.recursos_planeacion (id) ON DELETE RESTRICT,
  turno text NOT NULL CHECK (turno IN ('matutino', 'vespertino', 'nocturno')),
  horas_capacidad numeric(8, 2) NOT NULL CHECK (horas_capacidad > 0 AND horas_capacidad <= 24),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recurso_id, turno)
);

COMMENT ON TABLE public.capacidades_recurso_turno IS
  'Capacidad normal por recurso y turno; las excepciones se modelan en Fase 6.2.';

-- -----------------------------------------------------------------------------
-- 3. Programación de una partida sobre un recurso y una secuencia de proceso.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programacion_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id) ON DELETE RESTRICT,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id) ON DELETE RESTRICT,
  recurso_id uuid NOT NULL REFERENCES public.recursos_planeacion (id) ON DELETE RESTRICT,
  secuencia smallint NOT NULL DEFAULT 1 CHECK (secuencia > 0),
  estado_planeacion text NOT NULL DEFAULT 'programada'
    CHECK (estado_planeacion IN (
      'programada',
      'en_preparacion',
      'en_proceso',
      'bloqueada',
      'completada',
      'cancelada'
    )),
  fecha_programada date NOT NULL,
  turno text NOT NULL DEFAULT 'matutino'
    CHECK (turno IN ('matutino', 'vespertino', 'nocturno')),
  horas_estimadas numeric(8, 2) NOT NULL CHECK (horas_estimadas > 0 AND horas_estimadas <= 24),
  orden_prioridad integer NOT NULL DEFAULT 1 CHECK (orden_prioridad BETWEEN 1 AND 9999),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programacion_areas_partida_recurso_unico UNIQUE (partida_id, recurso_id),
  CONSTRAINT programacion_areas_partida_secuencia_unica UNIQUE (partida_id, secuencia)
);

COMMENT ON TABLE public.programacion_areas IS
  'Programación secuenciada de partidas por recurso, fecha y turno.';

CREATE INDEX IF NOT EXISTS idx_recursos_planeacion_area_activo
  ON public.recursos_planeacion (area, activo);
CREATE INDEX IF NOT EXISTS idx_programacion_areas_calendario
  ON public.programacion_areas (recurso_id, fecha_programada, turno)
  WHERE estado_planeacion NOT IN ('cancelada', 'completada');
CREATE INDEX IF NOT EXISTS idx_programacion_areas_orden
  ON public.programacion_areas (orden_id);
CREATE INDEX IF NOT EXISTS idx_programacion_areas_partida
  ON public.programacion_areas (partida_id);

-- Un recurso solo puede estar tomado por una preparación o ejecución a la vez.
-- El índice es la garantía concurrente; las RPCs de 6.2 añadirán los locks y
-- comprobaciones de capacidad antes de intentar la transición.
CREATE UNIQUE INDEX IF NOT EXISTS idx_programacion_areas_candado_recurso_activo
  ON public.programacion_areas (recurso_id)
  WHERE estado_planeacion IN ('en_preparacion', 'en_proceso');

-- La relación entre orden y partida no puede expresarse con dos FKs simples.
-- Este trigger impide programar una partida perteneciente a otra orden.
CREATE OR REPLACE FUNCTION public.validar_partida_corresponde_orden_programacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.partidas_orden_produccion AS partida
  WHERE partida.id = NEW.partida_id
    AND partida.orden_id = NEW.orden_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partida_no_corresponde_orden' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_partida_corresponde_orden_programacion()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_programacion_areas_partida_orden_valida
  ON public.programacion_areas;
CREATE TRIGGER trigger_programacion_areas_partida_orden_valida
  BEFORE INSERT OR UPDATE OF orden_id, partida_id ON public.programacion_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_partida_corresponde_orden_programacion();

DROP TRIGGER IF EXISTS trigger_recursos_planeacion_actualizado_en
  ON public.recursos_planeacion;
CREATE TRIGGER trigger_recursos_planeacion_actualizado_en
  BEFORE UPDATE ON public.recursos_planeacion
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_capacidades_recurso_turno_actualizado_en
  ON public.capacidades_recurso_turno;
CREATE TRIGGER trigger_capacidades_recurso_turno_actualizado_en
  BEFORE UPDATE ON public.capacidades_recurso_turno
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_programacion_areas_actualizado_en
  ON public.programacion_areas;
CREATE TRIGGER trigger_programacion_areas_actualizado_en
  BEFORE UPDATE ON public.programacion_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 4. Privilegios SQL y RLS. La lectura exige permiso explícito y las escrituras
--    siguen exclusivamente por service_role/RPCs de servidor.
-- -----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.recursos_planeacion
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.capacidades_recurso_turno
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.programacion_areas
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recursos_planeacion TO authenticated;
GRANT SELECT ON TABLE public.capacidades_recurso_turno TO authenticated;
GRANT SELECT ON TABLE public.programacion_areas TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.recursos_planeacion TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.capacidades_recurso_turno TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.programacion_areas TO service_role;

ALTER TABLE public.recursos_planeacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacidades_recurso_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programacion_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recursos_planeacion_seleccionar ON public.recursos_planeacion;
CREATE POLICY recursos_planeacion_seleccionar
  ON public.recursos_planeacion FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_planeacion'))
    OR (SELECT privado.usuario_tiene_permiso('gestionar_planeacion'))
  );

DROP POLICY IF EXISTS capacidades_recurso_turno_seleccionar ON public.capacidades_recurso_turno;
CREATE POLICY capacidades_recurso_turno_seleccionar
  ON public.capacidades_recurso_turno FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_planeacion'))
    OR (SELECT privado.usuario_tiene_permiso('gestionar_planeacion'))
  );

DROP POLICY IF EXISTS programacion_areas_seleccionar ON public.programacion_areas;
CREATE POLICY programacion_areas_seleccionar
  ON public.programacion_areas FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('ver_planeacion'))
    OR (SELECT privado.usuario_tiene_permiso('gestionar_planeacion'))
  );

-- -----------------------------------------------------------------------------
-- 5. Realtime idempotente. Las políticas SELECT anteriores gobiernan qué puede
--    recibir cada cliente autenticado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'recursos_planeacion',
    'capacidades_recurso_turno',
    'programacion_areas'
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
