-- C25 — Disponibilidad y ocupación de equipos con causa explícita.
--
-- Regla del PO (2026-11-19): la ocupación de un equipo es física e independiente
-- de la fecha (índice parcial `idx_programacion_areas_candado_recurso_activo`);
-- la fecha solo reparte la capacidad diaria. Ningún arranque cancela ni mueve el
-- proceso de otro operador: el error debe decir QUÉ equipo, QUÉ orden y QUIÉN lo
-- tiene. El mensaje distingue día cerrado, grupo sin equipos, sin capacidad,
-- equipo ocupado y capacidad diaria excedida.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

-- -----------------------------------------------------------------------------
-- Fixtures. Se usa el lunes de la semana actual para no depender del día en que
-- corre el CI y para poder construir el domingo con +6.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE c25 (clave text PRIMARY KEY, valor text);
INSERT INTO c25 (clave, valor)
SELECT 'lunes', (date_trunc('week', current_date)::date)::text;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c2501', 'c25-operador-1@prueba.local'),
  ('00000000-0000-4000-8000-0000000c2502', 'c25-operador-2@prueba.local');
UPDATE public.usuarios
SET rol = 'operador', activo = true, nombre_completo = 'Operador C25 uno'
WHERE id = '00000000-0000-4000-8000-0000000c2501';
UPDATE public.usuarios
SET rol = 'operador', activo = true, nombre_completo = 'Operador C25 dos'
WHERE id = '00000000-0000-4000-8000-0000000c2502';

INSERT INTO public.clientes (id, nombre_comercial, razon_social)
VALUES ('00000000-0000-4000-8000-0000000c2503', 'Cliente C25', 'Cliente C25 SA de CV');

-- Grupos y equipos. Cada escenario tiene su propio grupo para aislar el
-- resultado de otros datos de la base local.
INSERT INTO public.grupos_equipo (id, codigo, nombre) VALUES
  ('00000000-0000-4000-8000-0000000c2511', 'C25G-OCUP', 'Grupo C25 ocupado'),
  ('00000000-0000-4000-8000-0000000c2512', 'C25G-CAP', 'Grupo C25 capacidad'),
  ('00000000-0000-4000-8000-0000000c2513', 'C25G-VACIO', 'Grupo C25 vacio'),
  ('00000000-0000-4000-8000-0000000c2514', 'C25G-LIBRE', 'Grupo C25 libre');

INSERT INTO public.recursos_planeacion (
  id, codigo, nombre, area, activo, cantidad_equipos, grupo_equipo_id
) VALUES
  ('00000000-0000-4000-8000-0000000c2521', 'C25R-OCUP', 'Equipo C25 ocupado', 'taller',
   true, 1, '00000000-0000-4000-8000-0000000c2511'),
  ('00000000-0000-4000-8000-0000000c2522', 'C25R-CAP', 'Equipo C25 capacidad', 'taller',
   true, 1, '00000000-0000-4000-8000-0000000c2512'),
  ('00000000-0000-4000-8000-0000000c2523', 'C25R-VACIO', 'Equipo C25 inactivo', 'taller',
   false, 1, '00000000-0000-4000-8000-0000000c2513'),
  ('00000000-0000-4000-8000-0000000c2524', 'C25R-LIBRE', 'Equipo C25 libre', 'taller',
   true, 1, '00000000-0000-4000-8000-0000000c2514');

-- Procesos del catálogo con grupo: así la operación exige exactamente un grupo y
-- no cae a cualquier máquina de la planta.
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, grupo_equipo_id) VALUES
  ('C25CORTE-OCUP', 'Corte C25 ocupado', 'ZCYA', '00000000-0000-4000-8000-0000000c2511'),
  ('C25CORTE-CAP', 'Corte C25 capacidad', 'ZCYB', '00000000-0000-4000-8000-0000000c2512'),
  ('C25CORTE-VACIO', 'Corte C25 vacio', 'ZCYC', '00000000-0000-4000-8000-0000000c2513'),
  ('C25CORTE-LIBRE', 'Corte C25 libre', 'ZCYD', '00000000-0000-4000-8000-0000000c2514');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000c2530', 'OP-992501',
  '00000000-0000-4000-8000-0000000c2503', 'programada', current_date + 30);

INSERT INTO public.partidas_orden_produccion (
  id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos,
  tiempo_estimado_minutos
) VALUES
  -- Ocupada por el operador dos (programación en proceso).
  ('00000000-0000-4000-8000-0000000c2540', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-OCUP1', 10, 'pza', ARRAY['C25CORTE-OCUP'], 300),
  -- El operador uno intenta arrancar y encuentra el equipo ocupado.
  ('00000000-0000-4000-8000-0000000c2541', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-OCUP2', 10, 'pza', ARRAY['C25CORTE-OCUP'], 300),
  -- El operador dos intenta arrancar sobre su propio trabajo en curso.
  ('00000000-0000-4000-8000-0000000c2542', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-OCUP3', 10, 'pza', ARRAY['C25CORTE-OCUP'], 300),
  -- Capacidad diaria excedida por otra programación del mismo día.
  ('00000000-0000-4000-8000-0000000c2543', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-CAP1', 10, 'pza', ARRAY['C25CORTE-CAP'], 300),
  ('00000000-0000-4000-8000-0000000c2544', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-CAP2', 10, 'pza', ARRAY['C25CORTE-CAP'], 300),
  ('00000000-0000-4000-8000-0000000c2545', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-CAP-FILL', 10, 'pza', ARRAY['C25CORTE-CAP'], 300),
  -- Grupo sin equipos activos.
  ('00000000-0000-4000-8000-0000000c2546', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-VACIO', 10, 'pza', ARRAY['C25CORTE-VACIO'], 300),
  -- Día cerrado y camino feliz.
  ('00000000-0000-4000-8000-0000000c2547', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-DOMINGO', 10, 'pza', ARRAY['C25CORTE-LIBRE'], 300),
  ('00000000-0000-4000-8000-0000000c2548', '00000000-0000-4000-8000-0000000c2530',
   'C25-P-LIBRE', 10, 'pza', ARRAY['C25CORTE-LIBRE'], 300);

-- -----------------------------------------------------------------------------
-- Escenario A: el equipo está trabajando otra orden de otro operador.
-- -----------------------------------------------------------------------------
INSERT INTO public.programacion_areas (
  id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c2560',
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2540',
  '00000000-0000-4000-8000-0000000c2521', 1, 'en_proceso',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes'), 'matutino', 5,
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2540')
);

INSERT INTO public.sesiones_trabajo (
  orden_id, partida_id, programacion_id, operador_id, estado_sesion
) VALUES (
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2540',
  '00000000-0000-4000-8000-0000000c2560',
  '00000000-0000-4000-8000-0000000c2502', 'activa'
);

INSERT INTO c25 (clave, valor)
SELECT 'reclamo_ocup2', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2541',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2541'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes'), 'matutino');

-- El detalle que verá el operador nombra equipo, orden y operador.
SELECT ok(
  privado.detalle_ocupacion_recurso(
    '00000000-0000-4000-8000-0000000c2521',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'),
    '00000000-0000-4000-8000-0000000c2501',
    NULL
  ) LIKE '%C25R-OCUP%',
  'El detalle de ocupación nombra el equipo'
);
SELECT ok(
  privado.detalle_ocupacion_recurso(
    '00000000-0000-4000-8000-0000000c2521',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'),
    '00000000-0000-4000-8000-0000000c2501',
    NULL
  ) LIKE '%OP-992501%',
  'El detalle de ocupación nombra la orden que lo ocupa'
);
SELECT ok(
  privado.detalle_ocupacion_recurso(
    '00000000-0000-4000-8000-0000000c2521',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'),
    '00000000-0000-4000-8000-0000000c2501',
    NULL
  ) LIKE '%Operador C25 dos%',
  'El detalle de ocupación nombra al operador que lo tiene'
);

SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c2501')
$$, (SELECT valor FROM c25 WHERE clave = 'reclamo_ocup2')),
  'recurso_ocupado: %C25R-OCUP%No puedes cancelar el trabajo en curso de otro operador%',
  'El arranque avisa que el equipo está ocupado y que no puede cancelar al otro operador');

-- El aviso previo al checklist devuelve el mismo detalle, sin escribir datos.
SELECT ok(
  public.validar_ocupacion_inicio_reclamo(
    (SELECT valor::uuid FROM c25 WHERE clave = 'reclamo_ocup2'),
    '00000000-0000-4000-8000-0000000c2501'
  ) LIKE '%C25R-OCUP%No puedes cancelar el trabajo en curso de otro operador%',
  'La RPC de solo lectura adelanta el aviso de equipo ocupado');

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = '00000000-0000-4000-8000-0000000c2560'
), 'en_proceso', 'El intento fallido no cancela ni mueve el trabajo del otro operador');

-- -----------------------------------------------------------------------------
-- Escenario B: el equipo lo tiene el MISMO operador que intenta arrancar.
-- -----------------------------------------------------------------------------
INSERT INTO c25 (clave, valor)
SELECT 'reclamo_ocup3', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2542',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2542'),
  '00000000-0000-4000-8000-0000000c2502',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes'), 'matutino');

SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c2502')
$$, (SELECT valor FROM c25 WHERE clave = 'reclamo_ocup3')),
  'recurso_ocupado: %',
  'El mismo operador tampoco puede duplicar su propio trabajo en curso');

SELECT ok(
  privado.detalle_ocupacion_recurso(
    '00000000-0000-4000-8000-0000000c2521',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'),
    '00000000-0000-4000-8000-0000000c2502',
    NULL
  ) LIKE '%lo estás trabajando tú%',
  'El detalle reconoce que el equipo lo está trabajando el propio operador'
);

-- -----------------------------------------------------------------------------
-- Escenario C: el equipo está libre, pero no le queda capacidad ese día.
-- -----------------------------------------------------------------------------
INSERT INTO public.programacion_areas (
  orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id
) VALUES (
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2545',
  '00000000-0000-4000-8000-0000000c2522', 1, 'programada',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 1, 'matutino', 5,
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2545')
);

INSERT INTO c25 (clave, valor)
SELECT 'reclamo_cap1', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2543',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2543'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 1, 'matutino');

SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c2501')
$$, (SELECT valor FROM c25 WHERE clave = 'reclamo_cap1')),
  'recurso_capacidad_excedida: %C25R-CAP%',
  'Si el equipo está libre pero sin horas, el error habla de capacidad, no de ocupación');

-- -----------------------------------------------------------------------------
-- Escenario D: una excepción de capacidad deja el equipo en 0 h ese día.
-- -----------------------------------------------------------------------------
INSERT INTO public.excepciones_capacidad_recurso (
  recurso_id, fecha, turno, horas_capacidad, motivo
) VALUES (
  '00000000-0000-4000-8000-0000000c2522',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 2,
  'matutino', 0, 'Mantenimiento de prueba C25'
);

INSERT INTO c25 (clave, valor)
SELECT 'reclamo_cap2', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2544',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2544'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 2, 'matutino');

SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c2501')
$$, (SELECT valor FROM c25 WHERE clave = 'reclamo_cap2')),
  'recurso_sin_capacidad: %no hay disponibilidad%',
  'Un equipo con 0 h se reporta como falta de disponibilidad, no como ocupado'
);

-- -----------------------------------------------------------------------------
-- Escenario E: el grupo que pide la operación no tiene equipos activos.
-- -----------------------------------------------------------------------------
INSERT INTO c25 (clave, valor)
SELECT 'reclamo_vacio', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2546',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2546'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 3, 'matutino');

SELECT throws_like(format($$
  SELECT public.preparar_reclamo_operador(%L::uuid, '00000000-0000-4000-8000-0000000c2501')
$$, (SELECT valor FROM c25 WHERE clave = 'reclamo_vacio')),
  'recurso_sin_equipos: %Grupo C25 vacio%',
  'Si el grupo no tiene equipos activos, el error lo dice y nombra el grupo'
);

-- -----------------------------------------------------------------------------
-- Escenario F: domingo cerrado. El reclamo se inserta directo porque la RPC de
-- reclamo ya rechaza la jornada 0; lo que se prueba aquí es el diagnóstico del
-- arranque.
-- -----------------------------------------------------------------------------
INSERT INTO public.reclamos_proceso_operador (
  orden_id, partida_id, meta_proceso_id, operador_id, fecha, turno,
  horas_estimadas, estado
) VALUES (
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2547',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2547'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 6, 'matutino', 5, 'activo'
);

SELECT throws_like($$
  SELECT public.preparar_reclamo_operador(
    (SELECT id FROM public.reclamos_proceso_operador
      WHERE partida_id = '00000000-0000-4000-8000-0000000c2547'),
    '00000000-0000-4000-8000-0000000c2501')
$$,
  'jornada_cerrada: %',
  'El domingo se explica como día sin jornada antes de hablar de equipos'
);

-- -----------------------------------------------------------------------------
-- Escenario G: camino feliz. El equipo del grupo está libre y con capacidad.
-- -----------------------------------------------------------------------------
INSERT INTO c25 (clave, valor)
SELECT 'reclamo_libre', id::text
FROM public.reclamar_proceso_operador(
  '00000000-0000-4000-8000-0000000c2530',
  '00000000-0000-4000-8000-0000000c2548',
  (SELECT id FROM public.metas_proceso_partida
    WHERE partida_id = '00000000-0000-4000-8000-0000000c2548'),
  '00000000-0000-4000-8000-0000000c2501',
  (SELECT valor::date FROM c25 WHERE clave = 'lunes') + 4, 'matutino');

INSERT INTO c25 (clave, valor)
SELECT 'programacion_libre', public.preparar_reclamo_operador(
  (SELECT valor::uuid FROM c25 WHERE clave = 'reclamo_libre'),
  '00000000-0000-4000-8000-0000000c2501'
)::text;

SELECT is((
  SELECT estado_planeacion FROM public.programacion_areas
  WHERE id = (SELECT valor::uuid FROM c25 WHERE clave = 'programacion_libre')
), 'en_preparacion', 'El camino feliz deja la programación en preparación');

SELECT is((
  SELECT recurso_id FROM public.programacion_areas
  WHERE id = (SELECT valor::uuid FROM c25 WHERE clave = 'programacion_libre')
), '00000000-0000-4000-8000-0000000c2524'::uuid,
  'El camino feliz toma el equipo libre del grupo requerido');

SELECT is((
  SELECT programacion_id FROM public.reclamos_proceso_operador
  WHERE id = (SELECT valor::uuid FROM c25 WHERE clave = 'reclamo_libre')
), (SELECT valor::uuid FROM c25 WHERE clave = 'programacion_libre'),
  'El reclamo queda enlazado a la programación preparada');

-- El aviso sin reclamo (inicio directo y lote) adelanta el mismo mensaje.
SELECT ok(
  public.validar_ocupacion_inicio_operacion(
    '00000000-0000-4000-8000-0000000c2530',
    '00000000-0000-4000-8000-0000000c2541',
    (SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c2541'),
    '00000000-0000-4000-8000-0000000c2501',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'), 'matutino'
  ) LIKE '%C25R-OCUP%No puedes cancelar el trabajo en curso de otro operador%',
  'La RPC sin reclamo avisa del equipo ocupado antes del checklist');

SELECT is(
  public.validar_ocupacion_inicio_operacion(
    '00000000-0000-4000-8000-0000000c2530',
    '00000000-0000-4000-8000-0000000c2548',
    (SELECT id FROM public.metas_proceso_partida
      WHERE partida_id = '00000000-0000-4000-8000-0000000c2548'),
    '00000000-0000-4000-8000-0000000c2501',
    (SELECT valor::date FROM c25 WHERE clave = 'lunes'), 'matutino'
  ), NULL,
  'La RPC sin reclamo no avisa cuando el equipo está libre');

SELECT * FROM finish();
ROLLBACK;
