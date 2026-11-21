-- CRIT-2: dos operadores pueden trabajar operaciones distintas de una misma
-- partida. El responsable de la partida no impide reclamar/iniciar/cerrar otra
-- operación, pero sí impide tomar la META que ya tiene reclamo activo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c2a01', 'crit2-a@prueba.local'),
  ('00000000-0000-4000-8000-0000000c2a02', 'crit2-b@prueba.local');
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador CRIT2 A'
WHERE id = '00000000-0000-4000-8000-0000000c2a01';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador CRIT2 B'
WHERE id = '00000000-0000-4000-8000-0000000c2a02';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000000c2a03', 'Cliente CRIT2 SA de CV', 'CRIT2', 'activo');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo) VALUES
  ('00000000-0000-4000-8000-0000000c2a04', 'C2-LASER', 'Laser CRIT2', 'taller', true),
  ('00000000-0000-4000-8000-0000000c2a05', 'C2-DOBLADO', 'Doblado CRIT2', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad) VALUES
  ('00000000-0000-4000-8000-0000000c2a04', 'matutino', 8),
  ('00000000-0000-4000-8000-0000000c2a05', 'matutino', 8);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, prioridad, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2a06', 'OP-992100',
  '00000000-0000-4000-8000-0000000c2a03', 'programada', 'normal',
  date_trunc('week', current_date)::date + 30);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, tiempo_estimado_minutos
) VALUES (
  '00000000-0000-4000-8000-0000000c2a07', '00000000-0000-4000-8000-0000000c2a06',
  'C2-IT01', 'Pieza CRIT2', 10, 'pza', ARRAY['Corte laser', 'DOBLADO_CNC'], 15
);

CREATE TEMP TABLE c2 (clave text PRIMARY KEY, valor text);
INSERT INTO c2 (clave, valor)
SELECT 'meta_' || secuencia, id::text FROM public.metas_proceso_partida
WHERE partida_id = '00000000-0000-4000-8000-0000000c2a07';

INSERT INTO c2 (clave, valor)
SELECT 'reclamo_a', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2a06',
  '00000000-0000-4000-8000-0000000c2a07',
  (SELECT valor::uuid FROM c2 WHERE clave = 'meta_1'),
  '00000000-0000-4000-8000-0000000c2a01',
  date_trunc('week', current_date)::date + 1, 'matutino');

SELECT is(
  (SELECT operador_asignado_id FROM public.partidas_orden_produccion
    WHERE id = '00000000-0000-4000-8000-0000000c2a07'),
  '00000000-0000-4000-8000-0000000c2a01'::uuid,
  'A queda como responsable de la partida al reclamar Corte'
);

INSERT INTO c2 (clave, valor)
SELECT 'reclamo_b', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2a06',
  '00000000-0000-4000-8000-0000000c2a07',
  (SELECT valor::uuid FROM c2 WHERE clave = 'meta_2'),
  '00000000-0000-4000-8000-0000000c2a02',
  date_trunc('week', current_date)::date + 2, 'matutino');

SELECT is(
  (SELECT count(*)::integer FROM public.reclamos_proceso_operador
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2a07'
      AND operador_id = '00000000-0000-4000-8000-0000000c2a02'
      AND estado = 'activo'),
  1,
  'B puede reclamar Doblado aunque la partida esté asignada a A'
);

SELECT throws_ok(
  $$ SELECT public.reclamar_proceso_operador(
       '00000000-0000-4000-8000-0000000c2a06',
       '00000000-0000-4000-8000-0000000c2a07',
       (SELECT valor::uuid FROM c2 WHERE clave = 'meta_1'),
       '00000000-0000-4000-8000-0000000c2a02',
       date_trunc('week', current_date)::date + 3, 'matutino') $$,
  '23514', 'partida_asignada_otro_operador',
  'B sigue sin poder tomar la misma operación que A'
);

-- Doblado necesita piezas del previo: se simula lo ya producido por Corte.
INSERT INTO public.registros_avance_partida (partida_id, operador_id, cantidad_producida, meta_proceso_id)
VALUES ('00000000-0000-4000-8000-0000000c2a07',
  '00000000-0000-4000-8000-0000000c2a01', 5,
  (SELECT valor::uuid FROM c2 WHERE clave = 'meta_1'));
UPDATE public.partidas_orden_produccion
SET cantidad_producida = 5 WHERE id = '00000000-0000-4000-8000-0000000c2a07';

INSERT INTO c2 (clave, valor)
SELECT 'programacion_b', public.preparar_reclamo_operador(
  (SELECT valor::uuid FROM c2 WHERE clave = 'reclamo_b'),
  '00000000-0000-4000-8000-0000000c2a02')::text;

INSERT INTO c2 (clave, valor)
SELECT 'sesion_b', id::text
FROM public.iniciar_sesion_trabajo_operador(
  '00000000-0000-4000-8000-0000000c2a06',
  '00000000-0000-4000-8000-0000000c2a07',
  (SELECT valor::uuid FROM c2 WHERE clave = 'programacion_b'),
  '00000000-0000-4000-8000-0000000c2a02',
  '{"material":true,"espesor":true,"cantidad":true,"archivo":true,"proceso_equipo":true,"observaciones":"Prueba CRIT-2"}'::jsonb);

SELECT is(
  (SELECT operador_id FROM public.sesiones_trabajo
    WHERE id = (SELECT valor::uuid FROM c2 WHERE clave = 'sesion_b')),
  '00000000-0000-4000-8000-0000000c2a02'::uuid,
  'B inicia su operación aunque A sea el responsable de la partida'
);

SELECT is(
  (SELECT estado_sesion FROM public.cerrar_sesion_trabajo_operador(
    (SELECT valor::uuid FROM c2 WHERE clave = 'sesion_b'),
    '00000000-0000-4000-8000-0000000c2a02',
    0, 'pausada', 'OTRA', 'Pausa de prueba CRIT-2',
    (SELECT valor::uuid FROM c2 WHERE clave = 'meta_2'))),
  'pausada',
  'B cierra su sesión sin ser el responsable de la partida'
);

SELECT * FROM finish();
ROLLBACK;
