-- PLAN-3: la pausa administrativa existe en el catálogo y su aprobación es una
-- función privilegiada. La regla de reanudación se comprueba en la migración.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);

SELECT is(
  (SELECT nombre FROM public.catalogo_motivos_pausa WHERE codigo = 'PAUSA_ADMIN'),
  'Pausa administrativa',
  'El catálogo incluye la pausa administrativa'
);
SELECT is(
  (SELECT requiere_nota FROM public.catalogo_motivos_pausa WHERE codigo = 'PAUSA_ADMIN'),
  true,
  'La pausa administrativa exige motivo escrito'
);
SELECT is(
  (SELECT libera_maquina FROM public.catalogo_motivos_pausa WHERE codigo = 'PAUSA_ADMIN'),
  false,
  'La pausa administrativa no libera la máquina para otro operador'
);

SELECT * FROM finish();
ROLLBACK;
