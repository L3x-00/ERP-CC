-- =============================================================================
-- Migración: reconciliar convención de timestamps en tablas de inventario.
-- Sub-fase 4.1 (ORCA MFG ERP). Idempotente.
--
-- Las tablas de inventario se habían creado FUERA de migración con columnas
-- `creado_at` / `actualizado_at` (inglés), rompiendo la convención
-- `creado_en` / `actualizado_en` del resto del esquema. Además el trigger
-- `actualizar_timestamp()` asigna `NEW.actualizado_en`, por lo que contra una
-- columna `actualizado_at` fallaría en cada UPDATE.
--
-- Se renombran de forma idempotente: si la tabla ya usa el nombre correcto
-- (creación fresca desde la migración 000002 en una BD limpia), es no-op.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proveedores', 'materiales', 'movimientos_inventario', 'reservas_material']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'creado_at'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'creado_en'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN creado_at TO creado_en', t);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'actualizado_at'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'actualizado_en'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN actualizado_at TO actualizado_en', t);
    END IF;
  END LOOP;
END $$;
