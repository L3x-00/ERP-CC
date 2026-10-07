-- =============================================================================
-- B7 (corrección de auditoría) — Lectura de evidencia/firma de entrega
-- Plan: docs/plan-erp-sii/07-entregas.md §7.2 regla 6.
--
-- Defecto: `privado.puede_ver_archivo('entrega', …)` no incluía
-- `entrega_evidencia`, el permiso con el que la app abre y firma la evidencia
-- (gerente/contador). Un usuario de logística con solo ese permiso no podía
-- leer las URLs firmadas, mientras que `ver_finanzas` sí, contra la regla del
-- plan (`ENTREGA_EVIDENCIA`/`ORDEN_VISTA`).
-- Se agrega el permiso sin quitar los existentes (no se debilita el control).
-- Aplicar SOLO local; el remoto lo aplica el PO.
-- =============================================================================

CREATE OR REPLACE FUNCTION privado.puede_ver_archivo(p_entidad text, p_entidad_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT privado.usuario_activo() THEN false
    WHEN privado.es_admin() THEN true
    WHEN p_entidad = 'cliente'
      THEN public.usuario_tiene_permiso('ver_clientes') OR public.usuario_tiene_permiso('cliente_vista')
    WHEN p_entidad IN ('rfq', 'rfq_item')
      THEN public.usuario_tiene_permiso('ver_pipeline_equipo')
        OR (p_entidad = 'rfq' AND EXISTS (
          SELECT 1 FROM public.pipeline p
          WHERE p.id = p_entidad_id AND p.vendedor_id = auth.uid()
        ))
        OR (p_entidad = 'rfq_item' AND public.usuario_tiene_permiso('rfq_vista'))
    WHEN p_entidad IN ('propuesta', 'propuesta_revision', 'propuesta_item')
      THEN public.usuario_tiene_permiso('propuesta_vista')
    WHEN p_entidad = 'orden'
      THEN public.usuario_tiene_permiso('orden_vista')
        OR public.usuario_tiene_permiso('gestionar_produccion')
        OR public.usuario_tiene_permiso('ver_planeacion')
    WHEN p_entidad = 'sesion_produccion'
      THEN public.usuario_tiene_permiso('gestionar_produccion') OR public.usuario_tiene_permiso('produccion_operar')
    WHEN p_entidad = 'entrega'
      THEN public.usuario_tiene_permiso('entrega_generar')
        OR public.usuario_tiene_permiso('entrega_evidencia')
        OR public.usuario_tiene_permiso('orden_vista')
        OR public.usuario_tiene_permiso('ver_finanzas')
    WHEN p_entidad = 'gasto'
      THEN public.usuario_tiene_permiso('ver_finanzas') OR public.usuario_tiene_permiso('registrar_gastos')
    WHEN p_entidad = 'inspeccion_calidad'
      THEN public.usuario_tiene_permiso('calidad_inspeccionar') OR public.usuario_tiene_permiso('gestionar_produccion')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION privado.puede_ver_archivo(text, uuid) IS
  'Permiso de lectura de un archivo según su entidad e id (RLS de `archivos`); entrega incluye ENTREGA_EVIDENCIA (B7).';
