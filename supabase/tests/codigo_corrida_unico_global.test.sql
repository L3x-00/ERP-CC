-- Código de corrida único global: backfill de duplicados y consecutivo por prefijo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-00000000c100', 'global@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin Global'
WHERE id = '00000000-0000-4000-8000-00000000c100';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-00000000c000', 'Cliente global SA de CV', 'GLOBAL', 'activo');

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES
  ('00000000-0000-4000-8000-00000000c001', 'OP-991401',
   '00000000-0000-4000-8000-00000000c000', 'programada', now() + interval '1 day'),
  ('00000000-0000-4000-8000-00000000c002', 'OP-991402',
   '00000000-0000-4000-8000-00000000c000', 'programada', now() + interval '1 day');

-- Simular el estado anterior a la migración: sin UNIQUE global y con dos
-- códigos repetidos del mismo prefijo en órdenes distintas (escenario que
-- hacía colisionar una renumeración por código). Todo en la transacción del test.
ALTER TABLE public.corridas DROP CONSTRAINT corridas_codigo_unico;

INSERT INTO public.corridas (id, orden_id, codigo, proceso_id, cantidad_planificada, creado_por, creado_en)
VALUES
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'LAS01',
   (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'), 1,
   '00000000-0000-4000-8000-00000000c100', now() - interval '3 days'),
  ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c002', 'LAS01',
   (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'), 1,
   '00000000-0000-4000-8000-00000000c100', now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c001', 'LAS02',
   (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'), 1,
   '00000000-0000-4000-8000-00000000c100', now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c002', 'LAS02',
   (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'), 1,
   '00000000-0000-4000-8000-00000000c100', now());

-- Misma sentencia de backfill que la migración 20261127130000.
WITH parsed AS (
  SELECT
    corrida.id,
    corrida.codigo,
    corrida.creado_en,
    (regexp_match(corrida.codigo, '^([A-Z]{2,6})([0-9]+)$'))[1] AS prefijo,
    (regexp_match(corrida.codigo, '^([A-Z]{2,6})([0-9]+)$'))[2]::integer AS numero
  FROM public.corridas AS corrida
  WHERE corrida.codigo ~ '^[A-Z]{2,6}[0-9]{2,}$'
), sobrantes AS (
  SELECT rankeados.id, rankeados.codigo, rankeados.prefijo, rankeados.creado_en
  FROM (
    SELECT
      parsed.*,
      row_number() OVER (
        PARTITION BY parsed.codigo ORDER BY parsed.creado_en, parsed.id
      ) AS orden_en_codigo
    FROM parsed
  ) AS rankeados
  WHERE rankeados.orden_en_codigo > 1
), excedentes AS (
  SELECT
    sobrantes.id,
    sobrantes.codigo,
    sobrantes.prefijo,
    row_number() OVER (
      PARTITION BY sobrantes.prefijo ORDER BY sobrantes.codigo, sobrantes.creado_en, sobrantes.id
    ) AS excedente
  FROM sobrantes
), maximos AS (
  SELECT parsed.prefijo, max(parsed.numero) AS max_numero
  FROM parsed
  GROUP BY parsed.prefijo
), renumerados AS (
  UPDATE public.corridas AS corrida
  SET codigo = excedentes.prefijo || lpad((maximos.max_numero + excedentes.excedente)::text, 2, '0')
  FROM excedentes
  JOIN maximos ON maximos.prefijo = excedentes.prefijo
  WHERE corrida.id = excedentes.id
  RETURNING corrida.id, excedentes.codigo AS codigo_anterior, corrida.codigo AS codigo_nuevo
)
INSERT INTO public.logs (
  usuario_id, nombre_usuario, rol, accion, modulo, recurso_id, detalles, correlation_id
)
SELECT
  NULL, 'sistema', 'admin', 'renumerar_codigo_corrida', 'produccion', 'corridas',
  jsonb_build_object(
    'motivo', 'Codigo de corrida unico global: se renumeraron codigos duplicados entre ordenes',
    'cambios', jsonb_agg(
      jsonb_build_object('id', id, 'anterior', codigo_anterior, 'nuevo', codigo_nuevo)
      ORDER BY id, codigo_anterior, codigo_nuevo
    )
  ),
  '00000000-0000-4000-8000-000000001327'::uuid
FROM renumerados
HAVING count(*) > 0;

ALTER TABLE public.corridas ADD CONSTRAINT corridas_codigo_unico UNIQUE (codigo);

SELECT is((SELECT codigo FROM public.corridas WHERE id = '00000000-0000-4000-8000-00000000d002'), 'LAS03',
  'El excedente de LAS01 toma el siguiente consecutivo global del prefijo');
SELECT is((SELECT codigo FROM public.corridas WHERE id = '00000000-0000-4000-8000-00000000d004'), 'LAS04',
  'El excedente de LAS02 recibe un consecutivo distinto, sin colisión');
SELECT ok((SELECT count(*) = count(DISTINCT codigo) FROM public.corridas),
  'No queda ningún código repetido después del backfill');
SELECT ok((SELECT count(*) >= 1 FROM public.logs
  WHERE correlation_id = '00000000-0000-4000-8000-000000001327'::uuid),
  'La renumeración queda registrada en logs');
SELECT throws_ok($$
  INSERT INTO public.corridas (orden_id, codigo, proceso_id, cantidad_planificada, creado_por)
  VALUES (
    '00000000-0000-4000-8000-00000000c002', 'LAS01',
    (SELECT id FROM public.catalogo_procesos WHERE codigo = 'LASER_FIBRA'), 1,
    '00000000-0000-4000-8000-00000000c100')
$$, '23505', null, 'El código ya no se puede repetir entre órdenes');

SELECT * FROM finish();
ROLLBACK;
