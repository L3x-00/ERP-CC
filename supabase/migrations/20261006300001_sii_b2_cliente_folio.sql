-- =============================================================================
-- SII-B2.1 — Folio global CLI-#### atómico y no reutilizable
-- Plan: docs/plan-erp-sii/02-clientes.md §2.1
-- Documento del cliente: §8 (módulo Clientes), §6.1 (nomenclatura)
--
-- Entrega:
--   * secuencia global `secuencia_folio_cliente` + `generar_folio_cliente()`
--   * columna `clientes.folio` con índice único e inmutabilidad por trigger
--   * backfill idempotente en orden `creado_en` para filas sin folio
--   * trigger BEFORE INSERT: el folio lo asigna la base, jamás el cliente
-- REGLAS: global, secuencial, atómico y nunca se reutiliza (aunque el cliente
-- se inactive). Aditiva e idempotente; la aplica el PO.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Secuencia y generador
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.secuencia_folio_cliente START 1;

COMMENT ON SEQUENCE public.secuencia_folio_cliente IS
  'Secuencia global del folio de cliente CLI-####. No se reinicia ni reutiliza.';

CREATE OR REPLACE FUNCTION public.generar_folio_cliente()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_consecutivo integer;
BEGIN
  v_consecutivo := nextval('public.secuencia_folio_cliente');
  RETURN 'CLI-' || lpad(v_consecutivo::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.generar_folio_cliente() IS
  'Genera el siguiente folio CLI-#### de forma atómica (secuencia global, nunca reutilizable).';

REVOKE ALL ON FUNCTION public.generar_folio_cliente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_folio_cliente() TO service_role;

REVOKE ALL ON SEQUENCE public.secuencia_folio_cliente FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Columna, formato e índice único
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS folio text;

COMMENT ON COLUMN public.clientes.folio IS
  'Folio humano global CLI-#### asignado por trigger; inmutable y nunca reutilizado.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_folio ON public.clientes (folio);

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_folio_formato;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_folio_formato
  CHECK (folio IS NULL OR folio ~ '^CLI-[0-9]{4,}$');

-- -----------------------------------------------------------------------------
-- 3. Backfill idempotente (solo filas sin folio, en orden de creación)
--    Función interna para poder re-ejecutarla en pruebas sin duplicar folios.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.asignar_folios_cliente_pendientes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fila record;
  v_asignados integer := 0;
BEGIN
  FOR v_fila IN
    SELECT id FROM public.clientes WHERE folio IS NULL ORDER BY creado_en, id
  LOOP
    UPDATE public.clientes
    SET folio = public.generar_folio_cliente()
    WHERE id = v_fila.id;
    v_asignados := v_asignados + 1;
  END LOOP;
  RETURN v_asignados;
END;
$$;

COMMENT ON FUNCTION privado.asignar_folios_cliente_pendientes() IS
  'Backfill idempotente del folio CLI-#### para clientes sin folio, en orden de creación.';

REVOKE ALL ON FUNCTION privado.asignar_folios_cliente_pendientes() FROM PUBLIC, anon, authenticated;

SELECT privado.asignar_folios_cliente_pendientes();

-- -----------------------------------------------------------------------------
-- 4. Triggers: asignación al insertar e inmutabilidad del folio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.asignar_folio_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.folio IS NULL THEN
    new.folio := public.generar_folio_cliente();
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION privado.asignar_folio_cliente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_clientes_folio ON public.clientes;
CREATE TRIGGER trigger_clientes_folio
  BEFORE INSERT ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION privado.asignar_folio_cliente();

CREATE OR REPLACE FUNCTION privado.proteger_folio_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Permite el backfill de filas aún sin folio; una vez asignado, no cambia.
  IF old.folio IS NOT NULL AND new.folio IS DISTINCT FROM old.folio THEN
    RAISE EXCEPTION 'folio_inmutable' USING ERRCODE = '22023';
  END IF;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION privado.proteger_folio_cliente() IS
  'Impide modificar el folio CLI-#### una vez asignado (identidad estable).';

REVOKE ALL ON FUNCTION privado.proteger_folio_cliente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_clientes_folio_inmutable ON public.clientes;
CREATE TRIGGER trigger_clientes_folio_inmutable
  BEFORE UPDATE OF folio ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION privado.proteger_folio_cliente();
