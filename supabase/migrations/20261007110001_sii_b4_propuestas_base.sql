-- =============================================================================
-- SII-B4.1 — Modelo de propuestas y revisiones (ADR-SII-01/06/07/09)
-- Plan: docs/plan-erp-sii/04-propuestas.md §4.1 (modelo), §4.3 (revisiones),
--       §4.4 (congelamiento), §4.7 (versionado de PDF), §4.9 (requiere revisión)
-- Documento del cliente: §10 (estados, revisiones, ítems/ruteo/costeo, PDF),
--       §6.1 (folio CNC-MMYY_XX-A), §7
--
-- Entrega:
--   * tablas `propuestas`, `propuesta_revisiones`, `propuesta_items`,
--     `propuesta_item_operaciones`, `propuesta_item_ruteo`,
--     `propuesta_revision_costos`, `propuesta_revision_acciones`,
--     `propuesta_revision_eventos` y `propuesta_pdfs`
--   * folio nuevo `CNC-MMYY_XX` (generar_folio_periodico) asignado por RPC;
--     el formato histórico de 4 dígitos no se toca
--   * congelamiento SENT: triggers de inmutabilidad en revisión e hijos
--   * versionado de PDF con único parcial `vigente` y encadenado `reemplaza_a`
--   * RLS de lectura: `propuesta_vista` Y (dueño del RFQ O `ver_pipeline_equipo`)
--   * backfill idempotente de RFQs históricos con `folio_cnc`
--
-- Idempotente y aditiva. Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guarda de dependencias (A 0610* → B3 0710* → B4 0711*)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.rfq_items') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100002_sii_b3_rfq_base antes';
  END IF;
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
  IF to_regclass('public.catalogo_procesos') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261006100001_sii_b1_catalogos_base antes';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Propuestas (cabecera; folio CNC-MMYY_XX asignado por RPC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.propuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.pipeline (id),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id),
  folio_cnc text NOT NULL,
  estado text NOT NULL DEFAULT 'DRAFT',
  revision_vigente_id uuid,
  accepted_revision_id uuid,
  responsable_id uuid NOT NULL REFERENCES public.usuarios (id),
  creado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuestas IS
  'SII-B4.1: propuesta comercial (RFQ 1:N); su estado es espejo de la revisión vigente y solo cambia por RPC.';
COMMENT ON COLUMN public.propuestas.folio_cnc IS
  'SII-B4.1/ADR-SII-02: folio nuevo CNC-MMYY_XX del documento; el histórico CNC-MMYY-XXXX del RFQ queda intacto.';
COMMENT ON COLUMN public.propuestas.accepted_revision_id IS
  'SII-B4.10: revisión exacta aceptada por el cliente; puede ser anterior a la última.';

CREATE INDEX IF NOT EXISTS ix_propuestas_rfq ON public.propuestas (rfq_id, estado);
CREATE INDEX IF NOT EXISTS ix_propuestas_cliente ON public.propuestas (cliente_id, estado);

-- -----------------------------------------------------------------------------
-- 2. Revisiones A..Z (inmutables al enviarse)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.propuesta_revisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id uuid NOT NULL REFERENCES public.propuestas (id) ON DELETE CASCADE,
  letra text NOT NULL,
  folio_revision text NOT NULL,
  estado text NOT NULL DEFAULT 'DRAFT',
  motivo_creacion text,
  snapshot_cabecera jsonb NOT NULL DEFAULT '{}'::jsonb,
  requiere_revision_ruteo boolean NOT NULL DEFAULT false,
  requiere_revision_costeo boolean NOT NULL DEFAULT false,
  canal_envio text,
  destino_envio text,
  enviado_en timestamptz,
  enviado_por uuid REFERENCES public.usuarios (id),
  validada_en timestamptz,
  validada_por uuid REFERENCES public.usuarios (id),
  creado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuesta_revisiones IS
  'SII-B4.2/4.3: revisiones A..Z de una propuesta; el estado solo cambia por RPC y el contenido se congela al enviar.';
COMMENT ON COLUMN public.propuesta_revisiones.snapshot_cabecera IS
  'SII-B4.1: copia inmutable de cliente/contacto/moneda/condiciones/IVA al crear la revisión.';

-- -----------------------------------------------------------------------------
-- 3. Hijas de la revisión
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.propuesta_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  rfq_item_id uuid REFERENCES public.rfq_items (id),
  codigo text NOT NULL,
  descripcion text NOT NULL,
  cantidad numeric(12,2) NOT NULL,
  material_id uuid REFERENCES public.catalogo_materiales (id),
  espesor_id uuid REFERENCES public.catalogo_espesores (id),
  acabado text,
  notas text,
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  es_descuento boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuesta_items IS
  'SII-B4.5: ítems de la revisión con ITxx estable heredado del RFQ; cancelar = activo=false (nunca se borra el código).';

CREATE TABLE IF NOT EXISTS public.propuesta_item_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.propuesta_items (id) ON DELETE CASCADE,
  proceso_id uuid NOT NULL REFERENCES public.catalogo_procesos (id),
  orden integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.propuesta_item_operaciones IS
  'SII-B4.5: operaciones solicitadas copiadas del RFQ (referencia de captura; el ruteo estimado es editable).';

CREATE TABLE IF NOT EXISTS public.propuesta_item_ruteo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.propuesta_items (id) ON DELETE CASCADE,
  secuencia integer NOT NULL,
  proceso_id uuid NOT NULL REFERENCES public.catalogo_procesos (id),
  grupo_equipo_id uuid REFERENCES public.grupos_equipo (id),
  grupo_planeado_id uuid REFERENCES public.grupos_planeados (id),
  setup_horas numeric(8,2) NOT NULL DEFAULT 0,
  run_horas numeric(8,2) NOT NULL DEFAULT 0,
  total_horas numeric(8,2) GENERATED ALWAYS AS (setup_horas + run_horas) STORED,
  requiere_revision boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.propuesta_item_ruteo IS
  'SII-B4.5/4.9: ruteo estimado por ítem; `total_horas` automático y `requiere_revision` visible tras cambios de alcance.';

CREATE TABLE IF NOT EXISTS public.propuesta_revision_costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  categoria text NOT NULL,
  monto numeric(14,4) NOT NULL,
  nota text
);

COMMENT ON TABLE public.propuesta_revision_costos IS
  'SII-B4.5: costeo interno manual por categoría (material, máquina, mano de obra, gastos directos, subcontratación).';

CREATE TABLE IF NOT EXISTS public.propuesta_revision_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  codigo text NOT NULL REFERENCES public.catalogo_proximas_acciones (codigo),
  texto_otro text,
  fecha date,
  responsable_id uuid REFERENCES public.usuarios (id),
  canal text,
  nota text,
  creado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuesta_revision_acciones IS
  'SII-B4.6: próxima acción por revisión (catálogo B1.7 + texto Otro); el histórico nunca se sobrescribe.';

CREATE TABLE IF NOT EXISTS public.propuesta_revision_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  estado_anterior text,
  estado_nuevo text,
  accion text NOT NULL,
  motivo text,
  canal text,
  destino text,
  actor_id uuid REFERENCES public.usuarios (id),
  correlation_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuesta_revision_eventos IS
  'SII-B4.2: bitácora de transiciones de la revisión (acción, motivo, actor y correlationId), anexa al `logs` de la app.';

CREATE INDEX IF NOT EXISTS ix_propuesta_items_revision ON public.propuesta_items (revision_id);
CREATE INDEX IF NOT EXISTS ix_propuesta_items_rfq_item ON public.propuesta_items (rfq_item_id);
CREATE INDEX IF NOT EXISTS ix_propuesta_item_operaciones_item ON public.propuesta_item_operaciones (item_id);
CREATE INDEX IF NOT EXISTS ix_propuesta_item_ruteo_item ON public.propuesta_item_ruteo (item_id);
CREATE INDEX IF NOT EXISTS ix_propuesta_revision_costos_revision ON public.propuesta_revision_costos (revision_id);
CREATE INDEX IF NOT EXISTS ix_propuesta_revision_acciones_revision
  ON public.propuesta_revision_acciones (revision_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_propuesta_revision_eventos_revision
  ON public.propuesta_revision_eventos (revision_id, creado_en DESC);

-- -----------------------------------------------------------------------------
-- 4. PDFs por revisión (un solo vigente; reemplazo encadenado)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.propuesta_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.propuesta_revisiones (id) ON DELETE CASCADE,
  archivo_id uuid NOT NULL REFERENCES public.archivos (id),
  contenido_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  reemplaza_a uuid REFERENCES public.propuesta_pdfs (id),
  vigente boolean NOT NULL DEFAULT true,
  generado_por uuid NOT NULL REFERENCES public.usuarios (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.propuesta_pdfs IS
  'SII-B4.7: PDF ligado a la revisión exacta; reemplazar desmarca el anterior y encadena `reemplaza_a` (sin borrado).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_pdf_vigente_revision
  ON public.propuesta_pdfs (revision_id) WHERE vigente;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pdf_revision_hash
  ON public.propuesta_pdfs (revision_id, contenido_hash);

-- -----------------------------------------------------------------------------
-- 5. Checks de integridad (idempotentes: drop + add)
-- -----------------------------------------------------------------------------
ALTER TABLE public.propuestas DROP CONSTRAINT IF EXISTS propuestas_estado_valido;
ALTER TABLE public.propuestas
  ADD CONSTRAINT propuestas_estado_valido CHECK (estado IN (
    'DRAFT','PENDING_APPROVAL','READY_TO_SEND','SENT','FOLLOW_UP',
    'ACCEPTED','PENDING_FINANCIAL','SALE_CONFIRMED','REJECTED','CLOSED'));

ALTER TABLE public.propuestas DROP CONSTRAINT IF EXISTS propuestas_folio_formato;
ALTER TABLE public.propuestas
  ADD CONSTRAINT propuestas_folio_formato CHECK (folio_cnc ~ '^CNC-[0-9]{4}_[0-9]{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS ux_propuestas_folio_cnc ON public.propuestas (folio_cnc);

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_letra_valida;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_letra_valida CHECK (letra ~ '^[A-Z]$');

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_estado_valido;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_estado_valido CHECK (estado IN (
    'DRAFT','PENDING_APPROVAL','READY_TO_SEND','SENT','FOLLOW_UP',
    'ACCEPTED','PENDING_FINANCIAL','SALE_CONFIRMED','REJECTED','CLOSED'));

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_folio_formato;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_folio_formato
  CHECK (folio_revision ~ '^CNC-[0-9]{4}_[0-9]{2}-[A-Z]$');

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_motivo_valido;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_motivo_valido CHECK (
    (motivo_creacion IS NULL OR char_length(btrim(motivo_creacion)) <= 300)
    AND (letra = 'A' OR char_length(btrim(COALESCE(motivo_creacion, ''))) BETWEEN 3 AND 300)
  );

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_snapshot_valido;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_snapshot_valido CHECK (
    jsonb_typeof(snapshot_cabecera) = 'object'
    AND octet_length(snapshot_cabecera::text) <= 32768
  );

ALTER TABLE public.propuesta_revisiones DROP CONSTRAINT IF EXISTS propuesta_revisiones_unica;
ALTER TABLE public.propuesta_revisiones
  ADD CONSTRAINT propuesta_revisiones_unica UNIQUE (propuesta_id, letra);

CREATE UNIQUE INDEX IF NOT EXISTS ux_propuesta_revisiones_folio
  ON public.propuesta_revisiones (folio_revision);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_codigo_valido;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_codigo_valido CHECK (codigo ~ '^IT[0-9]{2,}$');

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_descripcion_valida;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_descripcion_valida
  CHECK (char_length(btrim(descripcion)) BETWEEN 1 AND 300);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_cantidad_positiva;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_cantidad_positiva CHECK (cantidad > 0);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_precio_no_negativo;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_precio_no_negativo CHECK (precio_unitario >= 0);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_acabado_valido;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_acabado_valido
  CHECK (acabado IS NULL OR char_length(btrim(acabado)) <= 120);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_notas_validas;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_notas_validas
  CHECK (notas IS NULL OR char_length(btrim(notas)) <= 2000);

ALTER TABLE public.propuesta_items DROP CONSTRAINT IF EXISTS propuesta_items_revision_codigo_unico;
ALTER TABLE public.propuesta_items
  ADD CONSTRAINT propuesta_items_revision_codigo_unico UNIQUE (revision_id, codigo);

ALTER TABLE public.propuesta_item_operaciones DROP CONSTRAINT IF EXISTS propuesta_item_operaciones_item_proceso_unico;
ALTER TABLE public.propuesta_item_operaciones
  ADD CONSTRAINT propuesta_item_operaciones_item_proceso_unico UNIQUE (item_id, proceso_id);

ALTER TABLE public.propuesta_item_operaciones DROP CONSTRAINT IF EXISTS propuesta_item_operaciones_orden_valido;
ALTER TABLE public.propuesta_item_operaciones
  ADD CONSTRAINT propuesta_item_operaciones_orden_valido CHECK (orden >= 0);

ALTER TABLE public.propuesta_item_ruteo DROP CONSTRAINT IF EXISTS propuesta_item_ruteo_item_secuencia_unica;
ALTER TABLE public.propuesta_item_ruteo
  ADD CONSTRAINT propuesta_item_ruteo_item_secuencia_unica UNIQUE (item_id, secuencia);

ALTER TABLE public.propuesta_item_ruteo DROP CONSTRAINT IF EXISTS propuesta_item_ruteo_secuencia_valida;
ALTER TABLE public.propuesta_item_ruteo
  ADD CONSTRAINT propuesta_item_ruteo_secuencia_valida CHECK (secuencia >= 1);

ALTER TABLE public.propuesta_item_ruteo DROP CONSTRAINT IF EXISTS propuesta_item_ruteo_horas_no_negativas;
ALTER TABLE public.propuesta_item_ruteo
  ADD CONSTRAINT propuesta_item_ruteo_horas_no_negativas
  CHECK (setup_horas >= 0 AND run_horas >= 0);

ALTER TABLE public.propuesta_revision_costos DROP CONSTRAINT IF EXISTS propuesta_revision_costos_categoria_valida;
ALTER TABLE public.propuesta_revision_costos
  ADD CONSTRAINT propuesta_revision_costos_categoria_valida CHECK (categoria IN
    ('material','maquina','mano_obra','gastos_directos','subcontratacion'));

ALTER TABLE public.propuesta_revision_costos DROP CONSTRAINT IF EXISTS propuesta_revision_costos_monto_no_negativo;
ALTER TABLE public.propuesta_revision_costos
  ADD CONSTRAINT propuesta_revision_costos_monto_no_negativo CHECK (monto >= 0);

ALTER TABLE public.propuesta_revision_costos DROP CONSTRAINT IF EXISTS propuesta_revision_costos_revision_categoria_unica;
ALTER TABLE public.propuesta_revision_costos
  ADD CONSTRAINT propuesta_revision_costos_revision_categoria_unica UNIQUE (revision_id, categoria);

ALTER TABLE public.propuesta_revision_acciones DROP CONSTRAINT IF EXISTS propuesta_revision_acciones_otro_texto;
ALTER TABLE public.propuesta_revision_acciones
  ADD CONSTRAINT propuesta_revision_acciones_otro_texto CHECK (
    codigo <> 'OTHER'
    OR char_length(btrim(COALESCE(texto_otro, ''))) BETWEEN 3 AND 300
  );

ALTER TABLE public.propuesta_revision_acciones DROP CONSTRAINT IF EXISTS propuesta_revision_acciones_canal_valido;
ALTER TABLE public.propuesta_revision_acciones
  ADD CONSTRAINT propuesta_revision_acciones_canal_valido
  CHECK (canal IS NULL OR char_length(btrim(canal)) <= 60);

ALTER TABLE public.propuesta_revision_eventos DROP CONSTRAINT IF EXISTS propuesta_revision_eventos_estado_anterior;
ALTER TABLE public.propuesta_revision_eventos
  ADD CONSTRAINT propuesta_revision_eventos_estado_anterior CHECK (
    estado_anterior IS NULL OR estado_anterior IN (
      'DRAFT','PENDING_APPROVAL','READY_TO_SEND','SENT','FOLLOW_UP',
      'ACCEPTED','PENDING_FINANCIAL','SALE_CONFIRMED','REJECTED','CLOSED'));

ALTER TABLE public.propuesta_revision_eventos DROP CONSTRAINT IF EXISTS propuesta_revision_eventos_estado_nuevo;
ALTER TABLE public.propuesta_revision_eventos
  ADD CONSTRAINT propuesta_revision_eventos_estado_nuevo CHECK (
    estado_nuevo IS NULL OR estado_nuevo IN (
      'DRAFT','PENDING_APPROVAL','READY_TO_SEND','SENT','FOLLOW_UP',
      'ACCEPTED','PENDING_FINANCIAL','SALE_CONFIRMED','REJECTED','CLOSED'));

-- -----------------------------------------------------------------------------
-- 6. FKs de la cabecera a su revisión vigente/aceptada (después de crearla)
-- -----------------------------------------------------------------------------
ALTER TABLE public.propuestas DROP CONSTRAINT IF EXISTS propuestas_revision_vigente_fk;
ALTER TABLE public.propuestas
  ADD CONSTRAINT propuestas_revision_vigente_fk
  FOREIGN KEY (revision_vigente_id) REFERENCES public.propuesta_revisiones (id);

ALTER TABLE public.propuestas DROP CONSTRAINT IF EXISTS propuestas_accepted_revision_fk;
ALTER TABLE public.propuestas
  ADD CONSTRAINT propuestas_accepted_revision_fk
  FOREIGN KEY (accepted_revision_id) REFERENCES public.propuesta_revisiones (id);

-- -----------------------------------------------------------------------------
-- 7. Timestamps
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_propuestas_actualizado_en ON public.propuestas;
CREATE TRIGGER trigger_propuestas_actualizado_en
  BEFORE UPDATE ON public.propuestas
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_propuesta_revisiones_actualizado_en ON public.propuesta_revisiones;
CREATE TRIGGER trigger_propuesta_revisiones_actualizado_en
  BEFORE UPDATE ON public.propuesta_revisiones
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

DROP TRIGGER IF EXISTS trigger_propuesta_items_actualizado_en ON public.propuesta_items;
CREATE TRIGGER trigger_propuesta_items_actualizado_en
  BEFORE UPDATE ON public.propuesta_items
  FOR EACH ROW EXECUTE FUNCTION public.actualizar_timestamp();

-- -----------------------------------------------------------------------------
-- 8. Congelamiento SENT (ADR-SII-07 / plan §4.4)
--    Las RPC autorizadas marcan la transacción con el GUC local `sii.b4_rpc`;
--    cualquier escritura directa sobre la revisión o sus hijos queda bloqueada
--    cuando la revisión no está DRAFT.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.b4_rpc_autorizada()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT current_setting('sii.b4_rpc', true) = 'on';
$$;

COMMENT ON FUNCTION privado.b4_rpc_autorizada() IS
  'SII-B4.4: true cuando la escritura proviene de una RPC autorizada de propuestas (GUC local).';

REVOKE ALL ON FUNCTION privado.b4_rpc_autorizada() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION privado.proteger_revision_propuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF privado.b4_rpc_autorizada() THEN
    RETURN new;
  END IF;

  IF OLD.estado IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'revision_congelada' USING ERRCODE = '23514', DETAIL = OLD.estado;
  END IF;

  -- En DRAFT todo cambio de contenido/estado pasa por RPC (excepto timestamps).
  IF (to_jsonb(new) - 'actualizado_en') IS DISTINCT FROM (to_jsonb(old) - 'actualizado_en') THEN
    RAISE EXCEPTION 'revision_congelada' USING ERRCODE = '23514',
      DETAIL = 'edita la revisión por acción de negocio';
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION privado.proteger_revision_propuesta() IS
  'SII-B4.4: bloquea cambios directos en `propuesta_revisiones` fuera de las RPC autorizadas.';

REVOKE ALL ON FUNCTION privado.proteger_revision_propuesta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_propuesta_revision_congelada ON public.propuesta_revisiones;
CREATE TRIGGER trigger_propuesta_revision_congelada
  BEFORE UPDATE ON public.propuesta_revisiones
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_revision_propuesta();

CREATE OR REPLACE FUNCTION privado.proteger_hijo_revision_propuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision_id uuid;
  v_item_id uuid;
  v_estado text;
BEGIN
  IF privado.b4_rpc_autorizada() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
  END IF;

  IF TG_TABLE_NAME = 'propuesta_items' THEN
    v_revision_id := CASE WHEN TG_OP = 'DELETE' THEN old.revision_id ELSE new.revision_id END;
  ELSE
    v_item_id := CASE WHEN TG_OP = 'DELETE' THEN old.item_id ELSE new.item_id END;
    SELECT i.revision_id INTO v_revision_id
    FROM public.propuesta_items AS i WHERE i.id = v_item_id;
  END IF;

  IF v_revision_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
  END IF;

  SELECT r.estado INTO v_estado
  FROM public.propuesta_revisiones AS r WHERE r.id = v_revision_id;

  IF v_estado IS NOT NULL AND v_estado <> 'DRAFT' THEN
    RAISE EXCEPTION 'revision_congelada' USING ERRCODE = '23514', DETAIL = v_estado;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
END;
$$;

COMMENT ON FUNCTION privado.proteger_hijo_revision_propuesta() IS
  'SII-B4.4: bloquea INSERT/UPDATE/DELETE de ítems, operaciones, ruteo y costos cuando la revisión padre no está DRAFT.';

REVOKE ALL ON FUNCTION privado.proteger_hijo_revision_propuesta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_propuesta_items_congelada ON public.propuesta_items;
CREATE TRIGGER trigger_propuesta_items_congelada
  BEFORE INSERT OR UPDATE OR DELETE ON public.propuesta_items
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_hijo_revision_propuesta();

DROP TRIGGER IF EXISTS trigger_propuesta_item_operaciones_congelada ON public.propuesta_item_operaciones;
CREATE TRIGGER trigger_propuesta_item_operaciones_congelada
  BEFORE INSERT OR UPDATE OR DELETE ON public.propuesta_item_operaciones
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_hijo_revision_propuesta();

DROP TRIGGER IF EXISTS trigger_propuesta_item_ruteo_congelada ON public.propuesta_item_ruteo;
CREATE TRIGGER trigger_propuesta_item_ruteo_congelada
  BEFORE INSERT OR UPDATE OR DELETE ON public.propuesta_item_ruteo
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_hijo_revision_propuesta();

DROP TRIGGER IF EXISTS trigger_propuesta_revision_costos_congelada ON public.propuesta_revision_costos;
CREATE TRIGGER trigger_propuesta_revision_costos_congelada
  BEFORE INSERT OR UPDATE OR DELETE ON public.propuesta_revision_costos
  FOR EACH ROW EXECUTE FUNCTION privado.proteger_hijo_revision_propuesta();

-- -----------------------------------------------------------------------------
-- 9. Versionado de PDF: reemplazar desmarca el anterior y encadena
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.versionar_pdf_propuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previo public.propuesta_pdfs%ROWTYPE;
BEGIN
  IF new.vigente IS TRUE THEN
    SELECT * INTO v_previo
    FROM public.propuesta_pdfs
    WHERE revision_id = new.revision_id AND vigente
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.propuesta_pdfs SET vigente = false WHERE id = v_previo.id;
      new.version := v_previo.version + 1;
      new.reemplaza_a := v_previo.id;
    END IF;
  END IF;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION privado.versionar_pdf_propuesta() IS
  'SII-B4.7: un solo PDF vigente por revisión; el reemplazo encadena `reemplaza_a` y conserva versiones.';

REVOKE ALL ON FUNCTION privado.versionar_pdf_propuesta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_propuesta_pdfs_versionar ON public.propuesta_pdfs;
CREATE TRIGGER trigger_propuesta_pdfs_versionar
  BEFORE INSERT ON public.propuesta_pdfs
  FOR EACH ROW EXECUTE FUNCTION privado.versionar_pdf_propuesta();

-- -----------------------------------------------------------------------------
-- 10. RLS de lectura: propuesta_vista Y (dueño del RFQ O ver_pipeline_equipo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.puede_ver_propuesta(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT privado.usuario_activo() THEN false
    WHEN privado.es_admin() THEN true
    WHEN NOT privado.usuario_tiene_permiso('propuesta_vista') THEN false
    WHEN privado.usuario_tiene_permiso('ver_pipeline_equipo') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.pipeline AS p
      WHERE p.id = p_rfq_id AND p.vendedor_id = (SELECT auth.uid())
    )
  END;
$$;

COMMENT ON FUNCTION privado.puede_ver_propuesta(uuid) IS
  'SII-B4.1: lectura de propuestas = propuesta_vista Y (dueño del RFQ O ver_pipeline_equipo); admin siempre.';

REVOKE ALL ON FUNCTION privado.puede_ver_propuesta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION privado.puede_ver_propuesta(uuid) TO authenticated;

ALTER TABLE public.propuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_revisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_item_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_item_ruteo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_revision_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_revision_acciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_revision_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS propuestas_seleccionar ON public.propuestas;
CREATE POLICY propuestas_seleccionar
  ON public.propuestas FOR SELECT TO authenticated
  USING ((SELECT privado.puede_ver_propuesta(rfq_id)));

DROP POLICY IF EXISTS propuesta_revisiones_seleccionar ON public.propuesta_revisiones;
CREATE POLICY propuesta_revisiones_seleccionar
  ON public.propuesta_revisiones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.propuestas AS p
    WHERE p.id = propuesta_revisiones.propuesta_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_items_seleccionar ON public.propuesta_items;
CREATE POLICY propuesta_items_seleccionar
  ON public.propuesta_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_revisiones AS r
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE r.id = propuesta_items.revision_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_item_operaciones_seleccionar ON public.propuesta_item_operaciones;
CREATE POLICY propuesta_item_operaciones_seleccionar
  ON public.propuesta_item_operaciones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_items AS i
    JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE i.id = propuesta_item_operaciones.item_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_item_ruteo_seleccionar ON public.propuesta_item_ruteo;
CREATE POLICY propuesta_item_ruteo_seleccionar
  ON public.propuesta_item_ruteo FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_items AS i
    JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE i.id = propuesta_item_ruteo.item_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_revision_costos_seleccionar ON public.propuesta_revision_costos;
CREATE POLICY propuesta_revision_costos_seleccionar
  ON public.propuesta_revision_costos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_revisiones AS r
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE r.id = propuesta_revision_costos.revision_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_revision_acciones_seleccionar ON public.propuesta_revision_acciones;
CREATE POLICY propuesta_revision_acciones_seleccionar
  ON public.propuesta_revision_acciones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_revisiones AS r
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE r.id = propuesta_revision_acciones.revision_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_revision_eventos_seleccionar ON public.propuesta_revision_eventos;
CREATE POLICY propuesta_revision_eventos_seleccionar
  ON public.propuesta_revision_eventos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_revisiones AS r
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE r.id = propuesta_revision_eventos.revision_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

DROP POLICY IF EXISTS propuesta_pdfs_seleccionar ON public.propuesta_pdfs;
CREATE POLICY propuesta_pdfs_seleccionar
  ON public.propuesta_pdfs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.propuesta_revisiones AS r
    JOIN public.propuestas AS p ON p.id = r.propuesta_id
    WHERE r.id = propuesta_pdfs.revision_id
      AND (SELECT privado.puede_ver_propuesta(p.rfq_id))
  ));

REVOKE ALL ON TABLE public.propuestas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_revisiones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_item_operaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_item_ruteo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_revision_costos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_revision_acciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_revision_eventos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.propuesta_pdfs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.propuestas TO authenticated;
GRANT SELECT ON TABLE public.propuesta_revisiones TO authenticated;
GRANT SELECT ON TABLE public.propuesta_items TO authenticated;
GRANT SELECT ON TABLE public.propuesta_item_operaciones TO authenticated;
GRANT SELECT ON TABLE public.propuesta_item_ruteo TO authenticated;
GRANT SELECT ON TABLE public.propuesta_revision_costos TO authenticated;
GRANT SELECT ON TABLE public.propuesta_revision_acciones TO authenticated;
GRANT SELECT ON TABLE public.propuesta_revision_eventos TO authenticated;
GRANT SELECT ON TABLE public.propuesta_pdfs TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.propuestas TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_revisiones TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_items TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_item_operaciones TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_item_ruteo TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_revision_costos TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_revision_acciones TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_revision_eventos TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.propuesta_pdfs TO service_role;

-- -----------------------------------------------------------------------------
-- 11. Realtime (señal de refetch; sin payload de negocio)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'propuestas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.propuestas;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'propuesta_revisiones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.propuesta_revisiones;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 12. Backfill idempotente de RFQs históricos con folio_cnc (ADR-SII-09)
--     Crea propuesta + revisión A copiando ítems del RFQ (ITxx intacto),
--     operaciones y ruteo estimado desde `calculo_tecnico`. El folio legacy se
--     conserva en `snapshot_cabecera.folio_legacy`; el folio nuevo sale del
--     contador CNC de 2 dígitos. RFQs sin cliente se omiten (no se inventa).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_propuestas_legacy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rfq record;
  v_linea record;
  v_item_rfq public.rfq_items%ROWTYPE;
  v_item_id uuid;
  v_estado text;
  v_folio text;
  v_folio_revision text;
  v_propuesta_id uuid;
  v_revision_id uuid;
  v_responsable uuid;
  v_contacto jsonb;
  v_snapshot jsonb;
  v_items_usados uuid[] := '{}';
  v_max_numero integer;
  v_numero integer;
  v_minutos numeric;
  v_proceso_id uuid;
  v_cliente public.clientes%ROWTYPE;
  v_con_orden boolean;
  v_propuestas integer := 0;
  v_revisiones integer := 0;
  v_items integer := 0;
  v_ruteo integer := 0;
  v_omitidas integer := 0;
BEGIN
  -- El backfill es una acción autorizada: habilita la escritura de hijos sobre
  -- revisiones no DRAFT (el GUC es local a la transacción de la migración).
  PERFORM set_config('sii.b4_rpc', 'on', true);

  FOR v_rfq IN
    SELECT p.*
    FROM public.pipeline AS p
    WHERE p.folio_cnc IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.propuestas AS pr WHERE pr.rfq_id = p.id)
    ORDER BY p.creado_en, p.id
  LOOP
    IF v_rfq.cliente_id IS NULL THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_cliente FROM public.clientes AS c WHERE c.id = v_rfq.cliente_id;
    IF NOT FOUND THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    v_con_orden := EXISTS (
      SELECT 1 FROM public.ordenes_produccion AS o WHERE o.cotizacion_id = v_rfq.id
    );

    v_estado := CASE
      WHEN v_con_orden THEN 'SALE_CONFIRMED'
      WHEN v_rfq.etapa = 'ganada' THEN 'ACCEPTED'
      WHEN v_rfq.etapa = 'negociacion' THEN 'FOLLOW_UP'
      WHEN v_rfq.etapa = 'cotizado' THEN 'SENT'
      WHEN v_rfq.etapa = 'perdida' THEN 'CLOSED'
      ELSE 'DRAFT'
    END;

    v_responsable := COALESCE(v_rfq.responsable_id, v_rfq.vendedor_id);
    v_folio := public.generar_folio_periodico('CNC');
    v_folio_revision := v_folio || '-A';

    IF v_rfq.contacto_id IS NOT NULL THEN
      SELECT to_jsonb(ct) INTO v_contacto
      FROM (
        SELECT ct.nombre, ct.puesto, ct.correo, ct.telefono
        FROM public.contactos_cliente AS ct WHERE ct.id = v_rfq.contacto_id
      ) AS ct;
    END IF;

    v_snapshot := jsonb_build_object(
      'version', 1,
      'cliente_id', v_cliente.id,
      'cliente', jsonb_build_object(
        'razon_social', v_cliente.razon_social,
        'nombre_comercial', v_cliente.nombre_comercial,
        'rfc', v_cliente.rfc,
        'correo', v_cliente.correo,
        'telefono', v_cliente.telefono
      ),
      'contacto_id', v_rfq.contacto_id,
      'contacto', COALESCE(v_contacto, 'null'::jsonb),
      'empresa', v_rfq.empresa,
      'moneda', v_rfq.moneda,
      'condiciones_pago', v_rfq.condiciones_pago,
      'iva_porcentaje', v_rfq.iva_porcentaje,
      'folio_legacy', v_rfq.folio_cnc,
      'folio_rfq', v_rfq.folio_rfq
    );

    INSERT INTO public.propuestas (
      rfq_id, cliente_id, folio_cnc, estado, responsable_id, creado_por
    ) VALUES (
      v_rfq.id, v_cliente.id, v_folio, v_estado, v_responsable, v_responsable
    )
    RETURNING id INTO v_propuesta_id;

    INSERT INTO public.propuesta_revisiones (
      propuesta_id, letra, folio_revision, estado, snapshot_cabecera, creado_por
    ) VALUES (
      v_propuesta_id, 'A', v_folio_revision, v_estado, v_snapshot, v_responsable
    )
    RETURNING id INTO v_revision_id;

    UPDATE public.propuestas
    SET revision_vigente_id = v_revision_id,
        accepted_revision_id = CASE
          WHEN v_estado IN ('ACCEPTED', 'SALE_CONFIRMED') THEN v_revision_id
          ELSE NULL
        END
    WHERE id = v_propuesta_id;

    INSERT INTO public.propuesta_revision_eventos (
      revision_id, estado_anterior, estado_nuevo, accion, motivo, actor_id
    ) VALUES (
      v_revision_id, NULL, v_estado, 'backfill_legacy',
      'Propuesta histórica creada desde RFQ con folio_cnc', v_responsable
    );
    v_propuestas := v_propuestas + 1;
    v_revisiones := v_revisiones + 1;

    -- Ítems: mapear cada línea con su rfq_item equivalente (ITxx intacto).
    v_items_usados := '{}';
    SELECT COALESCE(max(i.numero), 0) INTO v_max_numero
    FROM public.rfq_items AS i WHERE i.rfq_id = v_rfq.id;

    FOR v_linea IN
      SELECT l.*
      FROM public.cotizacion_lineas AS l
      WHERE l.pipeline_id = v_rfq.id
      ORDER BY l.orden, l.creado_en, l.id
    LOOP
      v_item_rfq := NULL;
      SELECT i.* INTO v_item_rfq
      FROM public.rfq_items AS i
      WHERE i.rfq_id = v_rfq.id
        AND NOT (i.id = ANY (v_items_usados))
        AND (i.numero = v_linea.orden OR i.descripcion = v_linea.descripcion)
      ORDER BY (i.numero = v_linea.orden) DESC, i.numero
      LIMIT 1;

      IF FOUND THEN
        v_items_usados := array_append(v_items_usados, v_item_rfq.id);
        v_numero := v_item_rfq.numero;
      ELSE
        v_max_numero := v_max_numero + 1;
        v_numero := v_max_numero;
      END IF;

      INSERT INTO public.propuesta_items (
        revision_id, rfq_item_id, codigo, descripcion, cantidad,
        material_id, espesor_id, acabado, notas, precio_unitario, es_descuento, activo
      ) VALUES (
        v_revision_id,
        CASE WHEN v_item_rfq.id IS NULL THEN NULL ELSE v_item_rfq.id END,
        'IT' || lpad(v_numero::text, 2, '0'),
        v_linea.descripcion,
        v_linea.cantidad,
        v_item_rfq.material_id,
        v_item_rfq.espesor_id,
        v_item_rfq.acabado,
        v_item_rfq.notas,
        v_linea.precio_unitario,
        v_linea.es_descuento,
        true
      )
      RETURNING id INTO v_item_id;
      v_items := v_items + 1;

      IF v_item_rfq.id IS NOT NULL THEN
        INSERT INTO public.propuesta_item_operaciones (item_id, proceso_id, orden)
        SELECT v_item_id, o.proceso_id, o.orden
        FROM public.rfq_item_operaciones AS o
        WHERE o.rfq_item_id = v_item_rfq.id
        ON CONFLICT (item_id, proceso_id) DO NOTHING;

        -- Ruteo estimado: una fila con el primer proceso y las horas del cálculo técnico.
        v_minutos := NULL;
        IF jsonb_typeof(v_linea.calculo_tecnico -> 'tiempoEstimadoMinutos') = 'number' THEN
          v_minutos := (v_linea.calculo_tecnico ->> 'tiempoEstimadoMinutos')::numeric;
        END IF;

        SELECT o.proceso_id INTO v_proceso_id
        FROM public.rfq_item_operaciones AS o
        WHERE o.rfq_item_id = v_item_rfq.id
        ORDER BY o.orden, o.id
        LIMIT 1;

        IF v_proceso_id IS NOT NULL AND v_minutos IS NOT NULL AND v_minutos > 0 THEN
          INSERT INTO public.propuesta_item_ruteo (
            item_id, secuencia, proceso_id, setup_horas, run_horas, requiere_revision
          ) VALUES (
            v_item_id, 1, v_proceso_id, 0, round(v_minutos / 60, 2), false
          );
          v_ruteo := v_ruteo + 1;
        END IF;
      END IF;
    END LOOP;

    -- Próxima acción heredada del RFQ (histórico por revisión).
    IF v_rfq.proxima_accion_codigo IS NOT NULL THEN
      INSERT INTO public.propuesta_revision_acciones (
        revision_id, codigo, texto_otro, fecha, responsable_id, creado_por
      ) VALUES (
        v_revision_id,
        v_rfq.proxima_accion_codigo,
        v_rfq.proxima_accion_texto,
        v_rfq.fecha_proxima_accion,
        v_rfq.responsable_proxima_accion_id,
        v_responsable
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'propuestas', v_propuestas,
    'revisiones', v_revisiones,
    'items', v_items,
    'ruteo', v_ruteo,
    'omitidas_sin_cliente', v_omitidas
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_propuestas_legacy() IS
  'SII-B4.1: backfill idempotente RFQ(folio_cnc)→propuesta/revisión A conservando ITxx y folio legacy en snapshot. Solo service_role.';

REVOKE ALL ON FUNCTION public.backfill_propuestas_legacy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_propuestas_legacy() TO service_role;

SELECT public.backfill_propuestas_legacy();
