-- =============================================================================
-- SII-B6.1 — Producción básica ola 1: corridas, pausas, horas extra y calidad
-- Plan: docs/plan-erp-sii/06-produccion.md §6.1–§6.3 (ADR-SII-07/09)
-- Documento del cliente: §12 completa
--
-- Entrega (modelo, sin UI):
--   * `corridas` + `corrida_items` (unidad de ejecución por orden/proceso)
--   * `catalogo_motivos_pausa` con seeds + columnas de pausa en sesiones
--   * `autorizaciones_hora_extra` y `inspecciones_calidad`
--   * RLS de lectura por permiso de producción/calidad, Realtime de `corridas`
--   * backfill de motivos legacy y CHECK legacy conservado (grandfathering)
--
-- No asume B5: ninguna referencia a `estado_sii` (los hooks van guardados en la
-- migración de acciones). Idempotente y aditiva; remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias (A B1 catálogos y piso existente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sesiones_trabajo') IS NULL
     OR to_regclass('public.partidas_orden_produccion') IS NULL THEN
    RAISE EXCEPTION 'aplicar 20260814044151_fase_7_produccion_base.sql antes (falta piso)';
  END IF;
  IF to_regclass('public.catalogo_procesos') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'catalogo_procesos'
         AND column_name = 'requiere_primera_pieza'
     ) THEN
    RAISE EXCEPTION 'aplicar 20261006100001_sii_b1_catalogos_base.sql antes (faltan catálogos B1)';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Corridas: unidad de ejecución (§6.1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corridas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id),
  codigo text NOT NULL,
  proceso_id uuid NOT NULL REFERENCES public.catalogo_procesos (id),
  estado text NOT NULL DEFAULT 'PLANIFICADA',
  cantidad_planificada numeric(12,2) NOT NULL,
  corrida_origen_id uuid REFERENCES public.corridas (id),
  creado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corridas_estado_valido CHECK (
    estado IN ('PLANIFICADA','EN_PROCESO','PAUSADA','COMPLETADA','CANCELADA')),
  CONSTRAINT corridas_cantidad_positiva CHECK (cantidad_planificada > 0),
  CONSTRAINT corridas_codigo_valido CHECK (codigo ~ '^[A-Z]{2,6}[0-9]{2,}$'),
  CONSTRAINT corridas_orden_codigo_unico UNIQUE (orden_id, codigo)
);

COMMENT ON TABLE public.corridas IS
  'SII-B6.1: unidad de ejecución de piso. Agrupa ítems compatibles (misma orden + proceso + grupo de equipo); nunca agrupa órdenes distintas.';
COMMENT ON COLUMN public.corridas.codigo IS
  '<PREFIJO_PROCESO><NN> (LAS01…LAS99, LAS100…): el consecutivo crece sin truncarse.';

CREATE INDEX IF NOT EXISTS ix_corridas_orden ON public.corridas (orden_id);
CREATE INDEX IF NOT EXISTS ix_corridas_estado ON public.corridas (estado);

DROP TRIGGER IF EXISTS trigger_corridas_actualizado_en ON public.corridas;
CREATE TRIGGER trigger_corridas_actualizado_en
  BEFORE UPDATE ON public.corridas
  FOR EACH ROW
  EXECUTE FUNCTION public.actualizar_timestamp();

CREATE TABLE IF NOT EXISTS public.corrida_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id uuid NOT NULL REFERENCES public.corridas (id) ON DELETE CASCADE,
  partida_id uuid NOT NULL REFERENCES public.partidas_orden_produccion (id),
  codigo_item text NOT NULL,
  cantidad numeric(12,2) NOT NULL,
  CONSTRAINT corrida_items_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT corrida_items_corrida_partida_unico UNIQUE (corrida_id, partida_id)
);

COMMENT ON TABLE public.corrida_items IS
  'SII-B6.1: ítems agrupados en una corrida, con su código ITxx (o pieza legacy) y cantidad.';

CREATE INDEX IF NOT EXISTS ix_corrida_items_corrida ON public.corrida_items (corrida_id);
CREATE INDEX IF NOT EXISTS ix_corrida_items_partida ON public.corrida_items (partida_id);

ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS corrida_id uuid REFERENCES public.corridas (id);

CREATE INDEX IF NOT EXISTS ix_sesiones_corrida ON public.sesiones_trabajo (corrida_id);

COMMENT ON COLUMN public.sesiones_trabajo.corrida_id IS
  'SII-B6.1: corrida de la sesión. Nullable por grandfathering; las órdenes legacy generan corrida automática al primer inicio.';

-- -----------------------------------------------------------------------------
-- 2. Catálogo de motivos de pausa (§6.2) + columnas de sesión
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_motivos_pausa (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  requiere_nota boolean NOT NULL DEFAULT false,
  libera_maquina boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  CONSTRAINT catalogo_motivos_pausa_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  CONSTRAINT catalogo_motivos_pausa_nombre_valido CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT catalogo_motivos_pausa_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.catalogo_motivos_pausa IS
  'SII-B6.2: causas de pausa configurables; `libera_maquina` habilita la reclamación >1 h (DUDA/MATERIAL por decisión de diseño).';

INSERT INTO public.catalogo_motivos_pausa (codigo, nombre, requiere_nota, libera_maquina, orden) VALUES
  ('DUDA',        'Duda / aclaración técnica', false, true,  1),
  ('MATERIAL',    'Falta de material',         false, true,  2),
  ('FALLA',       'Falla técnica / mantenimiento', true, false, 3),
  ('COMIDA',      'Comida',                    false, false, 4),
  ('FIN_JORNADA', 'Fin de jornada',            false, false, 5),
  ('OTRA',        'Otra causa',                true,  false, 6)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.sesiones_trabajo
  ADD COLUMN IF NOT EXISTS motivo_pausa_codigo text REFERENCES public.catalogo_motivos_pausa (codigo),
  ADD COLUMN IF NOT EXISTS motivo_pausa_nota text,
  ADD COLUMN IF NOT EXISTS recurso_liberado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificacion_inicio jsonb;

COMMENT ON COLUMN public.sesiones_trabajo.motivo_pausa_codigo IS
  'SII-B6.2: causa de pausa del catálogo; `motivo_pausa` legacy se conserva por grandfathering.';
COMMENT ON COLUMN public.sesiones_trabajo.recurso_liberado IS
  'SII-B6.2: true cuando un supervisor reclamó el recurso tras ≥60 min de pausa liberable.';
COMMENT ON COLUMN public.sesiones_trabajo.verificacion_inicio IS
  'SII-B6.2: checklist de eventos críticos capturado al iniciar (material, espesor, cantidad, archivo, proceso/equipo, observaciones).';

-- Backfill de motivos legacy → código de catálogo (idempotente).
UPDATE public.sesiones_trabajo AS sesion
SET motivo_pausa_codigo = CASE sesion.motivo_pausa
    WHEN 'falta_informacion' THEN 'DUDA'
    WHEN 'material_pendiente' THEN 'MATERIAL'
    WHEN 'aprobacion_cliente' THEN 'DUDA'
    WHEN 'problema_tecnico' THEN 'FALLA'
    WHEN 'mantenimiento' THEN 'FALLA'
    WHEN 'otro' THEN 'OTRA'
    ELSE NULL
  END
WHERE sesion.motivo_pausa IS NOT NULL
  AND sesion.motivo_pausa_codigo IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Autorizaciones de hora extra (§6.2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autorizaciones_hora_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id),
  sesion_id uuid REFERENCES public.sesiones_trabajo (id),
  horas_autorizadas numeric(6,2) NOT NULL,
  motivo text NOT NULL,
  autorizado_por uuid NOT NULL REFERENCES public.usuarios (id),
  estado text NOT NULL DEFAULT 'VIGENTE',
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT autorizaciones_hora_extra_horas_positivas CHECK (horas_autorizadas > 0),
  CONSTRAINT autorizaciones_hora_extra_motivo_valido CHECK (char_length(btrim(motivo)) BETWEEN 3 AND 300),
  CONSTRAINT autorizaciones_hora_extra_estado_valido CHECK (
    estado IN ('VIGENTE','USADA','REVOCADA'))
);

COMMENT ON TABLE public.autorizaciones_hora_extra IS
  'SII-B6.2: autorización de Management/Admin para exceder la jornada configurada del turno (sin hardcodear horas).';

CREATE INDEX IF NOT EXISTS ix_autorizaciones_hora_extra_orden
  ON public.autorizaciones_hora_extra (orden_id, estado);
CREATE INDEX IF NOT EXISTS ix_autorizaciones_hora_extra_sesion
  ON public.autorizaciones_hora_extra (sesion_id) WHERE sesion_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Inspecciones de calidad básica (§6.3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspecciones_calidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_produccion (id),
  corrida_id uuid REFERENCES public.corridas (id),
  partida_id uuid REFERENCES public.partidas_orden_produccion (id),
  codigo_item text NOT NULL,
  tipo text NOT NULL,
  referencia integer,
  resultado text NOT NULL,
  tolerancias jsonb NOT NULL DEFAULT '{}'::jsonb,
  cantidad_inspeccionada numeric(12,2) NOT NULL DEFAULT 0,
  cantidad_ok numeric(12,2) NOT NULL DEFAULT 0,
  cantidad_nok numeric(12,2) NOT NULL DEFAULT 0,
  cantidad_retrabajo numeric(12,2) NOT NULL DEFAULT 0,
  material_usado jsonb NOT NULL DEFAULT '{}'::jsonb,
  observaciones text,
  liberado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspecciones_calidad_tipo_valido CHECK (
    tipo IN ('PRIMERA_PIEZA','REFERENCIA_LOTE','CIERRE')),
  CONSTRAINT inspecciones_calidad_resultado_valido CHECK (
    resultado IN ('APROBADA','RECHAZADA')),
  CONSTRAINT inspecciones_calidad_referencia_positiva CHECK (
    referencia IS NULL OR referencia > 0),
  CONSTRAINT inspecciones_calidad_cantidades_no_negativas CHECK (
    cantidad_inspeccionada >= 0 AND cantidad_ok >= 0
    AND cantidad_nok >= 0 AND cantidad_retrabajo >= 0),
  CONSTRAINT inspecciones_calidad_codigo_item_no_vacio CHECK (
    char_length(btrim(codigo_item)) BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.inspecciones_calidad IS
  'SII-B6.3: primera pieza, referencias de lote (1/3/5 y cada 10/20) y cierre con tolerancias/cantidades/material.';

CREATE INDEX IF NOT EXISTS ix_inspecciones_calidad_orden ON public.inspecciones_calidad (orden_id);
CREATE INDEX IF NOT EXISTS ix_inspecciones_calidad_corrida
  ON public.inspecciones_calidad (corrida_id) WHERE corrida_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_inspecciones_calidad_partida
  ON public.inspecciones_calidad (partida_id) WHERE partida_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. RLS de lectura por permiso de producción/calidad + grants
-- -----------------------------------------------------------------------------
ALTER TABLE public.corridas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrida_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_motivos_pausa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autorizaciones_hora_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspecciones_calidad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corridas_seleccionar ON public.corridas;
CREATE POLICY corridas_seleccionar ON public.corridas FOR SELECT TO authenticated
USING (
  (SELECT privado.usuario_activo())
  AND (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('produccion_operar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_inspeccionar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_liberar_primera_pieza'))
  )
);

DROP POLICY IF EXISTS corrida_items_seleccionar ON public.corrida_items;
CREATE POLICY corrida_items_seleccionar ON public.corrida_items FOR SELECT TO authenticated
USING (
  (SELECT privado.usuario_activo())
  AND EXISTS (SELECT 1 FROM public.corridas AS corrida WHERE corrida.id = corrida_items.corrida_id)
  AND (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('produccion_operar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_inspeccionar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_liberar_primera_pieza'))
  )
);

DROP POLICY IF EXISTS catalogo_motivos_pausa_seleccionar ON public.catalogo_motivos_pausa;
CREATE POLICY catalogo_motivos_pausa_seleccionar ON public.catalogo_motivos_pausa FOR SELECT TO authenticated
USING (
  (SELECT privado.usuario_activo())
  AND (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('produccion_operar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_inspeccionar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_liberar_primera_pieza'))
  )
);

DROP POLICY IF EXISTS autorizaciones_hora_extra_seleccionar ON public.autorizaciones_hora_extra;
CREATE POLICY autorizaciones_hora_extra_seleccionar ON public.autorizaciones_hora_extra FOR SELECT TO authenticated
USING (
  (SELECT privado.usuario_activo())
  AND (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('aprobar_ordenes'))
  )
);

DROP POLICY IF EXISTS inspecciones_calidad_seleccionar ON public.inspecciones_calidad;
CREATE POLICY inspecciones_calidad_seleccionar ON public.inspecciones_calidad FOR SELECT TO authenticated
USING (
  (SELECT privado.usuario_activo())
  AND (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_produccion'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_inspeccionar'))
    OR (SELECT privado.usuario_tiene_permiso('calidad_liberar_primera_pieza'))
  )
);

REVOKE ALL ON TABLE public.corridas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.corrida_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalogo_motivos_pausa FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.autorizaciones_hora_extra FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inspecciones_calidad FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.corridas TO authenticated;
GRANT SELECT ON TABLE public.corrida_items TO authenticated;
GRANT SELECT ON TABLE public.catalogo_motivos_pausa TO authenticated;
GRANT SELECT ON TABLE public.autorizaciones_hora_extra TO authenticated;
GRANT SELECT ON TABLE public.inspecciones_calidad TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.corridas TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.corrida_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_motivos_pausa TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.autorizaciones_hora_extra TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.inspecciones_calidad TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Realtime: la cola de piso observa las corridas (sin payload de negocio).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'corridas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.corridas;
  END IF;
END;
$$;
