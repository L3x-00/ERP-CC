-- =============================================================================
-- SII-B1 / H-B1-40 -- auditoria append-only con defensa en profundidad
-- Documento: seccion 6 (auditoria append-only) y seccion 15.3.
--
-- `service_role` conserva solo SELECT + INSERT. Los triggers impiden que una
-- concesion accidental futura habilite UPDATE, DELETE o TRUNCATE. El owner de
-- la base conserva capacidad administrativa sobre el esquema, pero tampoco
-- puede mutar filas mientras los triggers permanezcan habilitados.
-- Aplicar SOLO local hasta autorizacion del PO.
-- =============================================================================

CREATE OR REPLACE FUNCTION privado.impedir_mutacion_logs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'logs_append_only' USING ERRCODE = '55000';
END;
$$;

COMMENT ON FUNCTION privado.impedir_mutacion_logs() IS
  'Rechaza UPDATE, DELETE y TRUNCATE sobre public.logs; la auditoria solo admite INSERT.';

REVOKE ALL ON FUNCTION privado.impedir_mutacion_logs()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trigger_logs_solo_agregar_filas ON public.logs;
CREATE TRIGGER trigger_logs_solo_agregar_filas
  BEFORE UPDATE OR DELETE ON public.logs
  FOR EACH ROW
  EXECUTE FUNCTION privado.impedir_mutacion_logs();

DROP TRIGGER IF EXISTS trigger_logs_solo_agregar_truncate ON public.logs;
CREATE TRIGGER trigger_logs_solo_agregar_truncate
  BEFORE TRUNCATE ON public.logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION privado.impedir_mutacion_logs();

REVOKE ALL PRIVILEGES ON TABLE public.logs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.logs TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.logs
  FROM PUBLIC, anon, authenticated;
