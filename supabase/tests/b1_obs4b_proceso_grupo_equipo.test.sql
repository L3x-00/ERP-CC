-- Obs. cliente 2026-10-12 (4b): grupo de equipo por proceso.
-- Verifica la columna nueva, la FK contra grupos_equipo y que el grupo sea
-- opcional (los procesos existentes no cambian).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(4);

SELECT has_column('public', 'catalogo_procesos', 'grupo_equipo_id',
  'catalogo_procesos tiene grupo_equipo_id');

INSERT INTO public.grupos_equipo (codigo, nombre, tarifa_hora, tarifa_moneda)
VALUES ('E4BOBS', 'Equipo obs4b', 100, 'MXN');

CREATE TEMP TABLE e4b ON COMMIT DROP AS
SELECT id FROM public.grupos_equipo WHERE codigo = 'E4BOBS';

INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id)
SELECT 'POBOBS', 'Proceso obs4b', 'POBO', id FROM e4b;

SELECT is(
  (SELECT grupo_equipo_id FROM public.catalogo_procesos WHERE codigo = 'POBOBS'),
  (SELECT id FROM e4b),
  'el proceso conserva su grupo de equipo');

SELECT throws_ok(
  $sql$
    INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id)
    VALUES ('POBOBS2', 'Proceso obs4b 2', 'POBP', '00000000-0000-4000-8000-00000000dead')
  $sql$,
  '23503', NULL,
  'un grupo inexistente se rechaza (FK)');

SELECT lives_ok(
  $sql$
    INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida)
    VALUES ('POBOBS3', 'Proceso obs4b 3', 'POBQ')
  $sql$,
  'el grupo de equipo es opcional');

SELECT * FROM finish();
ROLLBACK;
