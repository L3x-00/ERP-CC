-- C20: C4.3 otorgó a `authenticated` un GRANT SELECT por columnas sobre
-- sesiones_trabajo. Las columnas nuevas de C20 deben entrar en esa lista o
-- PostgREST responde "permission denied for table sesiones_trabajo".
GRANT SELECT (fecha_fin_declarada, pendiente_actualizacion_avance)
  ON TABLE public.sesiones_trabajo TO authenticated;
