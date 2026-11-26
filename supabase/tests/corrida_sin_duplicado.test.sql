-- Una pieza no puede pertenecer a dos lotes en curso del mismo proceso.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000d901', 'dup-admin@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin DUP'
WHERE id = '00000000-0000-4000-8000-00000000d901';

INSERT INTO public.catalogo_procesos (
  id, codigo, nombre, prefijo_corrida, activo, requiere_primera_pieza
) VALUES
  ('00000000-0000-4000-8000-00000000d902', 'CORTEDUP', 'Corte DUP', 'CDU', true, false),
  ('00000000-0000-4000-8000-00000000d903', 'DOBLDUP', 'Doblado DUP', 'DDU', true, false);

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000d904', 'Cliente DUP SA', 'Cliente DUP', 'activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000d905', 'OP-997601',
   '00000000-0000-4000-8000-00000000d904', 'programada', current_date + 7);
INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, codigo_item, cantidad_solicitada, unidad_medida
) VALUES
  ('00000000-0000-4000-8000-00000000d906', '00000000-0000-4000-8000-00000000d905',
   'IT01', 'IT01', 10, 'pieza');

INSERT INTO public.corridas (id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por) VALUES
  ('00000000-0000-4000-8000-00000000d907', '00000000-0000-4000-8000-00000000d905',
   'CDU01', '00000000-0000-4000-8000-00000000d902', 'PLANIFICADA', 10,
   '00000000-0000-4000-8000-00000000d901'),
  ('00000000-0000-4000-8000-00000000d908', '00000000-0000-4000-8000-00000000d905',
   'CDU02', '00000000-0000-4000-8000-00000000d902', 'PLANIFICADA', 10,
   '00000000-0000-4000-8000-00000000d901'),
  ('00000000-0000-4000-8000-00000000d909', '00000000-0000-4000-8000-00000000d905',
   'DDU01', '00000000-0000-4000-8000-00000000d903', 'PLANIFICADA', 10,
   '00000000-0000-4000-8000-00000000d901');

INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
  ('00000000-0000-4000-8000-00000000d907', '00000000-0000-4000-8000-00000000d906', 'IT01', 10);

SELECT throws_ok($$
  INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
    ('00000000-0000-4000-8000-00000000d908', '00000000-0000-4000-8000-00000000d906', 'IT01', 10)
$$, '23514',
  'corrida_partida_ya_en_lote: La pieza IT01 ya está en el lote CDU01. Espera a que termine o cancela ese lote antes de crear otro.',
  'La misma pieza no se puede agregar a otro lote del mismo proceso');

SELECT lives_ok($$
  INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
    ('00000000-0000-4000-8000-00000000d909', '00000000-0000-4000-8000-00000000d906', 'IT01', 10)
$$, 'Otro proceso sí puede agrupar la misma pieza');

SELECT is(
  (SELECT count(*) FROM public.corrida_items
   WHERE corrida_id = '00000000-0000-4000-8000-00000000d908'),
  0::bigint, 'El lote duplicado quedó sin ítems');

UPDATE public.corridas SET estado = 'COMPLETADA'
WHERE id = '00000000-0000-4000-8000-00000000d907';

SELECT lives_ok($$
  INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad) VALUES
    ('00000000-0000-4000-8000-00000000d908', '00000000-0000-4000-8000-00000000d906', 'IT01', 10)
$$, 'Un lote terminado ya no bloquea la pieza');

SELECT is(
  (SELECT count(*) FROM public.corrida_items
   WHERE corrida_id = '00000000-0000-4000-8000-00000000d908'),
  1::bigint, 'La pieza se pudo reagrupar después de terminar el lote anterior');

SELECT * FROM finish();
ROLLBACK;
