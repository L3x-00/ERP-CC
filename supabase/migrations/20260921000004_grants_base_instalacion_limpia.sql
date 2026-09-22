-- Grants base para instalaciones limpias (CI con `supabase start`/`db reset`).
--
-- Las tablas de las Fases 0–4 (usuarios, permisos, logs, clientes, pipeline,
-- cotización y folios) confiaban en los privilegios por defecto de la imagen de
-- Supabase; en arranques limpios esos privilegios no siempre alcanzan a los
-- roles de PostgREST y las Server Actions con cliente admin fallan con
-- `permission denied`. Se declaran explícitamente siguiendo el patrón de las
-- fases posteriores (RLS sigue gobernando las filas; no se agregan políticas).
--
-- Aditiva: en producción los privilegios ya existen y esto es un no-op.

GRANT SELECT, UPDATE ON TABLE public.usuarios TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.usuarios TO service_role;

GRANT SELECT ON TABLE public.permisos_rol TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.permisos_rol TO service_role;

GRANT SELECT ON TABLE public.logs TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.logs TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.intentos_login TO service_role;

GRANT SELECT ON TABLE public.clientes TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.clientes TO service_role;

GRANT SELECT ON TABLE public.pipeline TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.pipeline TO service_role;

GRANT SELECT ON TABLE public.cotizacion_lineas TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.cotizacion_lineas TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.contador_folios TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.seq_folio_op TO service_role;
