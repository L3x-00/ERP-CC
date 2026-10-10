-- =============================================================================
-- C6.3 — RBAC del inventario legado en solo lectura (DC-12)
--
-- Retirada la operación diaria, las existencias y reservas históricas quedan
-- visibles solo para `gestionar_inventario` (o admin). Se reemplazan las
-- políticas `USING (true)` originales de `materiales` y `reservas_material`,
-- que exponían también costos a cualquier usuario autenticado. Sin borrar ni
-- transformar datos. Aditiva e idempotente.
-- =============================================================================

DROP POLICY IF EXISTS materiales_seleccionar ON public.materiales;
CREATE POLICY materiales_seleccionar
  ON public.materiales FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
  );

DROP POLICY IF EXISTS reservas_material_seleccionar ON public.reservas_material;
CREATE POLICY reservas_material_seleccionar
  ON public.reservas_material FOR SELECT TO authenticated
  USING (
    (SELECT privado.es_admin())
    OR (SELECT privado.usuario_tiene_permiso('gestionar_inventario'))
  );
