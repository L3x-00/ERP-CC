-- Obs. cliente 2026-10-13 (8) — Grupos/subgrupos de materiales (padre_id).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

-- 1-2. Columna e índice parcial
SELECT has_column('public', 'catalogo_materiales', 'padre_id', 'Existe padre_id (grupo del material)');
SELECT has_index('public', 'catalogo_materiales', 'ix_catalogo_materiales_padre',
  'Existe el índice parcial por padre');

-- 3. Auto-padre rechazado
INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c0801', 'OBS8_A', 'Material raíz OBS8');
SELECT throws_ok($$
  UPDATE public.catalogo_materiales
  SET padre_id = '00000000-0000-4000-8000-0000000c0801'
  WHERE id = '00000000-0000-4000-8000-0000000c0801'
$$, '22023', NULL, 'Un material no puede ser su propio padre');

-- 4. Dos niveles: padre raíz + hijo válido
INSERT INTO public.catalogo_materiales (id, codigo, nombre, padre_id)
VALUES ('00000000-0000-4000-8000-0000000c0802', 'OBS8_B', 'Material hijo OBS8',
  '00000000-0000-4000-8000-0000000c0801');
SELECT is(
  (SELECT padre_id FROM public.catalogo_materiales WHERE id = '00000000-0000-4000-8000-0000000c0802'),
  '00000000-0000-4000-8000-0000000c0801'::uuid,
  'Un material puede colgar de una raíz');

-- 5. Nieto rechazado (máximo dos niveles)
INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c0803', 'OBS8_C', 'Material nieto OBS8');
SELECT throws_ok($$
  UPDATE public.catalogo_materiales
  SET padre_id = '00000000-0000-4000-8000-0000000c0802'
  WHERE id = '00000000-0000-4000-8000-0000000c0803'
$$, '22023', NULL, 'No se permite un tercer nivel de jerarquía');

-- 6. Un grupo con hijos no se convierte en subítem
SELECT throws_ok($$
  UPDATE public.catalogo_materiales
  SET padre_id = '00000000-0000-4000-8000-0000000c0803'
  WHERE id = '00000000-0000-4000-8000-0000000c0801'
$$, '22023', NULL, 'Un material con subítems no puede colgar de otro');

SELECT * FROM finish();
ROLLBACK;
