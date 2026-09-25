-- A01: el grant base 20260921000004 reabrió SELECT sobre el hash del PIN.
-- Lista explícita: columnas futuras tampoco se publican por accidente.
REVOKE SELECT ON TABLE public.usuarios FROM PUBLIC, anon, authenticated;
REVOKE SELECT (pin_operador) ON TABLE public.usuarios FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, email, nombre_completo, rol, activo,
  ultimo_login_at, creado_en, actualizado_en
) ON TABLE public.usuarios TO authenticated;

-- El PIN se verifica exclusivamente en servidor; no se cambian RLS ni UPDATE.
GRANT SELECT ON TABLE public.usuarios TO service_role;
