-- =============================================================================
-- B8 — El CHECK de vencimiento de compras usa el "hoy" del negocio
--
-- `compras_vencimiento_coherente` comparaba `fecha_vencimiento` con
-- `fecha_compra::date`, que usa el huso de la sesión (UTC en Supabase). Una
-- compra creada por la tarde en Tijuana con vencimiento "hoy" violaba el CHECK
-- aunque la captura fuera válida (mismo defecto AUD-12 de C2.2 y de
-- `crear_compra`).
--
-- Se recrea el CHECK contra `(fecha_compra AT TIME ZONE 'America/Tijuana')::date`.
-- Es más laxo que el anterior (el hoy del negocio nunca es posterior al de UTC),
-- así que las filas históricas lo siguen cumpliendo. NOT VALID + VALIDATE evita
-- un lock largo de escritura durante la validación.
-- Aditiva: solo el CHECK. Aplicar solo en local.
-- =============================================================================

ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_vencimiento_coherente;

ALTER TABLE public.compras
  ADD CONSTRAINT compras_vencimiento_coherente
  CHECK (
    fecha_vencimiento IS NULL
    OR fecha_vencimiento >= (fecha_compra AT TIME ZONE 'America/Tijuana')::date
  ) NOT VALID;

ALTER TABLE public.compras
  VALIDATE CONSTRAINT compras_vencimiento_coherente;
