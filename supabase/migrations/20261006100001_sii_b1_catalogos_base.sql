-- =============================================================================
-- SII-B1.3–B1.7 — Catálogos base configurables (materiales, espesores, procesos,
-- grupos de equipo, grupos planeados y próximas acciones)
-- Plan: docs/plan-erp-sii/01-sistema-catalogos.md §1.3–§1.7
-- Documento del cliente: §15.1 (catálogos) y §5 (permisos)
--
-- Idempotente y aditiva:
--   * crea las 6 tablas de catálogo con activo/inactivo, orden y auditoría
--   * siembra los valores iniciales del documento sin pisar datos existentes
--   * enlaza `recursos_planeacion.grupo_equipo_id` (columna nueva)
--   * RLS de solo lectura con permiso `catalogo_ver`; escritura solo service_role
--     vía Server Actions (no hay políticas de escritura para `authenticated`)
-- Aplicación: SOLO la aplica el Product Owner. La terminal A no ejecuta migraciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Grupos de equipo y grupos planeados (se referencian antes de procesos).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupos_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupos_equipo_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT grupos_equipo_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT grupos_equipo_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.grupos_equipo IS
  'SII-B1.6: categorías de recursos (CNC Router, Láser Fibra, Press Brake…). Los grupos retirados se desactivan, nunca se borran.';

CREATE TABLE IF NOT EXISTS public.grupos_planeados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupos_planeados_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT grupos_planeados_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT grupos_planeados_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.grupos_planeados IS
  'SII-B1.6: etapas macro de planeación (Corte, Doblado, Soldadura, Maquinado, Acabado, Ensamble).';

-- -----------------------------------------------------------------------------
-- 2. Catálogo de materiales (ADR-SII-06, §15.1)
--    No se reutiliza `materiales` de inventario (stock/costos); el vínculo
--    futuro será por `codigo`.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_materiales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_materiales_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT catalogo_materiales_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT catalogo_materiales_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.catalogo_materiales IS
  'SII-B1.3: materiales configurables de RFQ/propuesta; desactivar (activo=false) en vez de borrar.';
COMMENT ON COLUMN public.catalogo_materiales.metadata IS
  'Reserva extensible para atributos por material (densidad, norma, etc.). No la consume la UI todavía.';

-- -----------------------------------------------------------------------------
-- 3. Espesores dependientes del material (§1.4)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_espesores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.catalogo_materiales (id),
  etiqueta text NOT NULL,
  espesor_mm numeric(8,3) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_espesores_etiqueta_no_vacia CHECK (char_length(btrim(etiqueta)) BETWEEN 1 AND 40),
  CONSTRAINT catalogo_espesores_mm_positivo CHECK (espesor_mm > 0),
  CONSTRAINT catalogo_espesores_orden_valido CHECK (orden >= 0),
  CONSTRAINT catalogo_espesores_material_etiqueta_unica UNIQUE (material_id, etiqueta)
);

COMMENT ON TABLE public.catalogo_espesores IS
  'SII-B1.4: mm normalizado + etiqueta por material; el selector de espesor depende del material elegido.';

-- -----------------------------------------------------------------------------
-- 4. Catálogo de procesos (§1.5)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_procesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  prefijo_corrida text NOT NULL,
  grupo_planeado_id uuid REFERENCES public.grupos_planeados (id),
  area_trabajo_codigo text REFERENCES public.areas_trabajo_config (codigo),
  requiere_archivo_tecnico boolean NOT NULL DEFAULT true,
  requiere_primera_pieza boolean NOT NULL DEFAULT false,
  intervalo_inspeccion_lote integer,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_procesos_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT catalogo_procesos_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT catalogo_procesos_prefijo_valido CHECK (prefijo_corrida ~ '^[A-Z]{2,4}$'),
  CONSTRAINT catalogo_procesos_lote_valido CHECK (
    intervalo_inspeccion_lote IS NULL OR intervalo_inspeccion_lote IN (10, 20)
  ),
  CONSTRAINT catalogo_procesos_orden_valido CHECK (orden >= 0)
);

COMMENT ON TABLE public.catalogo_procesos IS
  'SII-B1.5: fuente única de operación solicitada, ruteo y prefijo de corridas; se enlaza con areas_trabajo_config por código.';
COMMENT ON COLUMN public.catalogo_procesos.requiere_archivo_tecnico IS
  'LISTO de RFQ (decisión del cliente 2026-10-05): configurable por proceso.';
COMMENT ON COLUMN public.catalogo_procesos.requiere_primera_pieza IS
  'B6: si el proceso exige liberar primera pieza.';
COMMENT ON COLUMN public.catalogo_procesos.intervalo_inspeccion_lote IS
  'B6: inspección cada 10 o 20 piezas en lotes grandes; NULL = no configurado.';

-- -----------------------------------------------------------------------------
-- 5. Próximas acciones comerciales (§1.7)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalogo_proximas_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  es_otro boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_proximas_acciones_codigo_valido CHECK (
    codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,48}$'
  ),
  CONSTRAINT catalogo_proximas_acciones_nombre_no_vacio CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 120),
  CONSTRAINT catalogo_proximas_acciones_orden_valido CHECK (orden >= 0)
);

-- Solo una acción puede ser "Otro" (el texto libre lo habilita la capa de negocio).
CREATE UNIQUE INDEX IF NOT EXISTS ux_proxima_accion_otro
  ON public.catalogo_proximas_acciones (es_otro) WHERE es_otro;

COMMENT ON TABLE public.catalogo_proximas_acciones IS
  'SII-B1.7: catálogo comercial controlado; donde se use se guarda código + texto_otro + fecha + responsable, y el histórico conserva códigos desactivados.';

-- -----------------------------------------------------------------------------
-- 6. Vínculo de recursos de planeación con grupos de equipo (B1.6)
--    Solo catálogo: no se inventan recursos ni se reasignan los existentes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.recursos_planeacion
  ADD COLUMN IF NOT EXISTS grupo_equipo_id uuid REFERENCES public.grupos_equipo (id);

CREATE INDEX IF NOT EXISTS idx_recursos_planeacion_grupo_equipo
  ON public.recursos_planeacion (grupo_equipo_id);

COMMENT ON COLUMN public.recursos_planeacion.grupo_equipo_id IS
  'SII-B1.6: grupo de equipo del recurso; NULL hasta que se clasifique en Configuración → Catálogos base.';

-- -----------------------------------------------------------------------------
-- 7. Seeds idempotentes (§15.1). Nunca pisan estado existente.
-- -----------------------------------------------------------------------------
INSERT INTO public.catalogo_materiales (codigo, nombre, orden) VALUES
  ('ACERO_CARBON',  'Acero al carbón',           10),
  ('GALVANIZADO',   'Galvanizado',               20),
  ('INOXIDABLE',    'Inoxidable',                30),
  ('ALUMINIO',      'Aluminio',                  40),
  ('BIRCH',         'Birch',                     50),
  ('MDF',           'MDF',                       60),
  ('ACRILICO',      'Acrílico',                  70),
  ('PLASTICO_ING',  'Plástico de ingeniería',    80)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.grupos_planeados (codigo, nombre, orden) VALUES
  ('CORTE',      'Corte',      10),
  ('DOBLADO',    'Doblado',    20),
  ('SOLDADURA',  'Soldadura',  30),
  ('MAQUINADO',  'Maquinado',  40),
  ('ACABADO',    'Acabado',    50),
  ('ENSAMBLE',   'Ensamble',   60)
ON CONFLICT (codigo) DO NOTHING;

-- Mínimos del documento; el administrador puede clasificar los recursos reales
-- después. No se derivan recursos existentes ni se inventan equipos.
INSERT INTO public.grupos_equipo (codigo, nombre, orden) VALUES
  ('CNC_ROUTER',  'CNC Router',   10),
  ('LASER_FIBRA', 'Láser Fibra',  20),
  ('PRESS_BRAKE', 'Press Brake',  30),
  ('SOLDADURA',   'Soldadura',    40),
  ('MAQUINADO',   'Maquinado',    50)
ON CONFLICT (codigo) DO NOTHING;

-- Procesos del documento. `area_trabajo_codigo` se enlaza solo si el código
-- existe (LEFT JOIN): en instalaciones limpias queda NULL y se completa en UI.
INSERT INTO public.catalogo_procesos (
  codigo, nombre, prefijo_corrida, grupo_planeado_id, area_trabajo_codigo,
  requiere_archivo_tecnico, requiere_primera_pieza, intervalo_inspeccion_lote,
  activo, orden
)
SELECT
  v.codigo, v.nombre, v.prefijo, gp.id, a.codigo,
  true, v.primera_pieza, 10, true, v.orden
FROM (VALUES
  ('LASER_FIBRA', 'Láser fibra',           'LAS', 'CORTE',     'LASER',     true,  10),
  ('LASER_CO2',   'Láser CO₂',             'LCO', 'CORTE',     'LASER_CO2', true,  20),
  ('DOB',         'Doblado CNC',           'DOB', 'DOBLADO',   'DOB',       true,  30),
  ('SOLD',        'Soldadura',             'SOL', 'SOLDADURA', 'SOLD',      false, 40),
  ('ROUTER',      'CNC Router',            'ROU', 'CORTE',     'ROUTER',    true,  50),
  ('MARCADO',     'Marcado láser',         'MAR', NULL,        'GRABADO',   false, 60),
  ('MAQUINADO',   'Maquinado/Fabricación', 'MAQ', 'MAQUINADO', 'CNC',       true,  70),
  ('ACABADO',     'Acabado',               'ACA', 'ACABADO',   'ACABADO',   false, 80)
) AS v(codigo, nombre, prefijo, grupo_codigo, area_codigo, primera_pieza, orden)
LEFT JOIN public.grupos_planeados AS gp ON gp.codigo = v.grupo_codigo
LEFT JOIN public.areas_trabajo_config AS a ON a.codigo = v.area_codigo
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.catalogo_proximas_acciones (codigo, nombre, es_otro, orden) VALUES
  ('FOLLOW_UP',                  'Seguimiento',                        false, 10),
  ('CONFIRM_RECEIPT',            'Confirmar recepción',                false, 20),
  ('WAIT_CUSTOMER_RESPONSE',     'Esperar respuesta del cliente',      false, 30),
  ('REQUEST_APPROVAL_PO',        'Solicitar aprobación de OC',         false, 40),
  ('RESOLVE_CUSTOMER_QUESTIONS', 'Resolver dudas del cliente',         false, 50),
  ('PREPARE_NEW_REVISION',       'Preparar nueva revisión',            false, 60),
  ('OTHER',                      'Otro',                               true,  70)
ON CONFLICT (codigo) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Timestamps y privilegios mínimos.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_catalogo_materiales_actualizado_en
  ON public.catalogo_materiales;
CREATE TRIGGER trigger_catalogo_materiales_actualizado_en
  BEFORE UPDATE ON public.catalogo_materiales
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

ALTER TABLE public.grupos_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_planeados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_materiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_espesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_proximas_acciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.grupos_equipo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.grupos_planeados FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalogo_materiales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalogo_espesores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalogo_procesos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalogo_proximas_acciones FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.grupos_equipo TO authenticated;
GRANT SELECT ON TABLE public.grupos_planeados TO authenticated;
GRANT SELECT ON TABLE public.catalogo_materiales TO authenticated;
GRANT SELECT ON TABLE public.catalogo_espesores TO authenticated;
GRANT SELECT ON TABLE public.catalogo_procesos TO authenticated;
GRANT SELECT ON TABLE public.catalogo_proximas_acciones TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.grupos_equipo TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.grupos_planeados TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_materiales TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_espesores TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_procesos TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.catalogo_proximas_acciones TO service_role;

-- Solo lectura para usuarios con `catalogo_ver` (o admin). Sin políticas de
-- escritura: toda mutación pasa por Server Actions con service_role.
DROP POLICY IF EXISTS grupos_equipo_seleccionar ON public.grupos_equipo;
CREATE POLICY grupos_equipo_seleccionar
  ON public.grupos_equipo FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP POLICY IF EXISTS grupos_planeados_seleccionar ON public.grupos_planeados;
CREATE POLICY grupos_planeados_seleccionar
  ON public.grupos_planeados FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP POLICY IF EXISTS catalogo_materiales_seleccionar ON public.catalogo_materiales;
CREATE POLICY catalogo_materiales_seleccionar
  ON public.catalogo_materiales FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP POLICY IF EXISTS catalogo_espesores_seleccionar ON public.catalogo_espesores;
CREATE POLICY catalogo_espesores_seleccionar
  ON public.catalogo_espesores FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP POLICY IF EXISTS catalogo_procesos_seleccionar ON public.catalogo_procesos;
CREATE POLICY catalogo_procesos_seleccionar
  ON public.catalogo_procesos FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );

DROP POLICY IF EXISTS catalogo_proximas_acciones_seleccionar ON public.catalogo_proximas_acciones;
CREATE POLICY catalogo_proximas_acciones_seleccionar
  ON public.catalogo_proximas_acciones FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('catalogo_ver'))
  );
