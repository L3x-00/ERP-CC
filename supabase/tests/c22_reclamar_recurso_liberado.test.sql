-- C22 - Reclamar una máquina liberada sin cerrar producción a la fuerza.
--
-- Regresión: la primera versión de C22 finalizaba la pausa al reclamar. Eso
-- dispara `privado.validar_consumo_cierre_b2`, que exige consumo de material
-- propio, y en el piso real devolvía `consumo_material_requerido`. Reclamar
-- libera la máquina, no cierra la operación: la pausa queda como historial con
-- `recurso_liberado` y la programación vuelve a `programada`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(7);

-- -----------------------------------------------------------------------------
-- Fixtures: pieza con material propio (exige consumo), recurso y pausa vigente
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c2291', 'c22-claim-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000000c2292', 'c22-claim-operador@prueba.local');
UPDATE public.usuarios SET rol = 'gerente', activo = true, nombre_completo = 'Gerente C22'
WHERE id = '00000000-0000-4000-8000-0000000c2291';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador C22'
WHERE id = '00000000-0000-4000-8000-0000000c2292';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000000c2293', 'Cliente C22 claim SA de CV', 'C22 claim', 'activo');

INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c2294', 'C22ACERO', 'Acero C22 claim');

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000000c2295', 'C22-LASER-91', 'Láser C22 claim', 'taller', true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000000c2295', 'matutino', 8);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2296', 'OP-993191',
  '00000000-0000-4000-8000-0000000c2293', 'pausada', current_date + 10);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  procesos, catalogo_material_id
) VALUES (
  '00000000-0000-4000-8000-0000000c2297', '00000000-0000-4000-8000-0000000c2296',
  'C22-C1', 'Pieza con material propio', 5, 'pieza', ARRAY['LASER_FIBRA'],
  '00000000-0000-4000-8000-0000000c2294');

INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas
) VALUES (
  '00000000-0000-4000-8000-0000000c2298', '00000000-0000-4000-8000-0000000c2296',
  '00000000-0000-4000-8000-0000000c2297', '00000000-0000-4000-8000-0000000c2295',
  1, 'bloqueada', current_date, 'matutino', 4);

INSERT INTO public.sesiones_trabajo (
  id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio, fecha_fin,
  estado_sesion, motivo_pausa, motivo_pausa_codigo, piezas_producidas, horas_netas
) VALUES (
  '00000000-0000-4000-8000-0000000c2299', '00000000-0000-4000-8000-0000000c2296',
  '00000000-0000-4000-8000-0000000c2297', '00000000-0000-4000-8000-0000000c2298',
  '00000000-0000-4000-8000-0000000c2292',
  now() - interval '2 hours', now() - interval '61 minutes',
  'pausada', 'material_pendiente', 'MATERIAL', 1, 0.98);

-- 1. La pieza exige consumo: cerrarla a la fuerza fallaría (motivo original del bug).
SELECT is(privado.partida_requiere_consumo_material('00000000-0000-4000-8000-0000000c2297'),
  true, 'La pieza exige consumo de material antes de cerrarse');

-- 2. Reclamar funciona aunque el consumo siga pendiente.
SELECT lives_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000000c2295', '00000000-0000-4000-8000-0000000c2291',
  NULL::uuid, '00000000-0000-4000-8000-0000000c2299')$$,
  'Reclamar libera la máquina sin exigir consumo');

-- 3-4. La pausa se conserva como historial y queda marcada como liberada.
SELECT is((SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c2299'), 'pausada',
  'La pausa no se finaliza: queda como historial del operador');
SELECT is((SELECT recurso_liberado FROM public.sesiones_trabajo
  WHERE id = '00000000-0000-4000-8000-0000000c2299'), true,
  'La sesión queda marcada con recurso_liberado');

-- 5. La operación vuelve al pool para que el operador la vea de nuevo.
SELECT is((SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c2298'), 'programada',
  'Reclamar devuelve la programación a programada');

-- 6. Reclamar dos veces la misma pausa no vuelve a liberar nada.
SELECT throws_ok($$SELECT public.reclamar_recurso_liberado(
  '00000000-0000-4000-8000-0000000c2295', '00000000-0000-4000-8000-0000000c2291',
  NULL::uuid, '00000000-0000-4000-8000-0000000c2299')$$,
  '23514', 'recurso_ya_reclamado', 'La misma pausa no se reclama dos veces');

-- 7. No se inventó consumo: la exigencia sigue viva para el cierre normal.
SELECT is(privado.partida_requiere_consumo_material('00000000-0000-4000-8000-0000000c2297'),
  true, 'El cierre normal sigue exigiendo consumo de material');

SELECT * FROM finish();
ROLLBACK;
