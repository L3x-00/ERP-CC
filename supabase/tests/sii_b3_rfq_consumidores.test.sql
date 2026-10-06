-- SII-B3 ola 2 — Consumidores SQL migrados a estado_rfq y puente retirado.
-- Verifica: claves JSON idénticas, buckets por estado_rfq/orden, sin seguimiento,
-- que el trigger/función del puente ya no existen y que escribir estado_rfq no
-- mueve la columna histórica `etapa`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(17);

-- -----------------------------------------------------------------------------
-- Fixtures: vendedor, cliente, RFQs por estado y una orden vinculada.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-00000000b351', 'sii-b3-consumos-vend@prueba.local');
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor Consumos B3'
WHERE id = '00000000-0000-4000-8000-00000000b351';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado) VALUES
  ('00000000-0000-4000-8000-00000000b352', 'Cliente Consumos B3 SA de CV', 'Consumos B3', 'activo');

INSERT INTO public.pipeline (
  id, folio_op, estado_rfq, etapa, nombre_contacto, empresa, vendedor_id,
  fecha_envio_cotizacion, fecha_ultimo_contacto
) VALUES
  ('00000000-0000-4000-8000-00000000b361', 'OP-B3CON-01', 'NEW', 'prospecto',
   'Contacto', 'Consumos 1', '00000000-0000-4000-8000-00000000b351', NULL, NULL),
  ('00000000-0000-4000-8000-00000000b362', 'OP-B3CON-02', 'INCOMPLETE', 'contactado',
   'Contacto', 'Consumos 2', '00000000-0000-4000-8000-00000000b351', NULL, NULL),
  ('00000000-0000-4000-8000-00000000b363', 'OP-B3CON-03', 'READY_FOR_PROPOSAL', 'prospecto',
   'Contacto', 'Consumos 3', '00000000-0000-4000-8000-00000000b351',
   now() - interval '10 days', NULL),
  ('00000000-0000-4000-8000-00000000b364', 'OP-B3CON-04', 'CONVERTED', 'prospecto',
   'Contacto', 'Consumos 4', '00000000-0000-4000-8000-00000000b351', NULL, NULL),
  ('00000000-0000-4000-8000-00000000b365', 'OP-B3CON-05', 'CLOSED', 'perdida',
   'Contacto', 'Consumos 5', '00000000-0000-4000-8000-00000000b351', NULL, NULL),
  ('00000000-0000-4000-8000-00000000b366', 'OP-B3CON-06', 'CONVERTED', 'prospecto',
   'Contacto', 'Consumos 6', '00000000-0000-4000-8000-00000000b351', NULL, NULL);

INSERT INTO public.ordenes_produccion (id, folio, cliente_id, cotizacion_id, estado, fecha_compromiso) VALUES
  ('00000000-0000-4000-8000-00000000b367', 'OP-990010',
   '00000000-0000-4000-8000-00000000b352', '00000000-0000-4000-8000-00000000b366',
   'borrador', now() + interval '30 days');

-- -----------------------------------------------------------------------------
-- 1-4. Puente retirado y helper de mapeo presente
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_pipeline_sincronizar_etapa_rfq'),
  'El trigger del puente ya no existe');
SELECT ok(
  to_regprocedure('privado.sincronizar_etapa_rfq()') IS NULL,
  'La función del puente ya no existe');
SELECT ok(
  to_regprocedure('privado.etapa_legacy_de_rfq(text)') IS NOT NULL,
  'Existe el helper de mapeo estado_rfq → bucket legado');
SELECT is(
  privado.etapa_legacy_de_rfq('READY_FOR_PROPOSAL'), 'cotizado',
  'READY_FOR_PROPOSAL cae al bucket Cotizado');

-- -----------------------------------------------------------------------------
-- 5-6. Escritura de estado_rfq ya no mueve `etapa` (puente retirado)
-- -----------------------------------------------------------------------------
UPDATE public.pipeline SET estado_rfq = 'INCOMPLETE'
WHERE id = '00000000-0000-4000-8000-00000000b361';
SELECT is(
  (SELECT etapa FROM public.pipeline WHERE id = '00000000-0000-4000-8000-00000000b361'),
  'prospecto', 'La columna histórica etapa no cambia al mover estado_rfq');
UPDATE public.pipeline SET estado_rfq = 'NEW'
WHERE id = '00000000-0000-4000-8000-00000000b361';

-- -----------------------------------------------------------------------------
-- 7-13. Métricas del vendedor: mismas claves y buckets por estado_rfq/orden
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE vend AS
SELECT public.obtener_metricas_vendedor(
  '00000000-0000-4000-8000-00000000b351',
  now() - interval '1 day',
  now() + interval '1 day'
) AS metrica;

SELECT ok((SELECT metrica->'actual'->'pipelinePorEtapa' ? 'prospecto' FROM vend),
  'Se conserva la clave prospecto');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'prospecto')::integer FROM vend), 1,
  'prospecto cuenta solo NEW');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'contactado')::integer FROM vend), 1,
  'contactado agrupa INCOMPLETE/WAITING_*');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'cotizado')::integer FROM vend), 1,
  'cotizado cuenta READY_FOR_PROPOSAL');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'negociacion')::integer FROM vend), 1,
  'negociacion cuenta CONVERTED sin orden');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'ganada')::integer FROM vend), 1,
  'ganada cuenta RFQ con orden vinculada');
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'perdida')::integer FROM vend), 1,
  'perdida cuenta CLOSED/CANCELLED');

-- -----------------------------------------------------------------------------
-- 14-15. Sin seguimiento y ejecutivo conservan claves
-- -----------------------------------------------------------------------------
SELECT is((SELECT (metrica->'actual'->>'cotizacionesSinSeguimiento')::integer FROM vend), 1,
  'cotizacionesSinSeguimiento usa READY/CONVERTED sin orden');
SELECT ok((SELECT metrica->'actual' ? 'metaMensual' AND metrica->'actual' ? 'comisionAcumuladaMxn' FROM vend),
  'Se conservan metaMensual y comisionAcumuladaMxn');

-- Aísla el fixture en una ventana futura antes del corte de equipo: la base
-- local puede acumular RFQ/órdenes de otras corridas que contaminarían ganadas.
UPDATE public.pipeline SET creado_en = '2099-05-01T12:00:00Z'
WHERE id IN (
  '00000000-0000-4000-8000-00000000b361', '00000000-0000-4000-8000-00000000b362',
  '00000000-0000-4000-8000-00000000b363', '00000000-0000-4000-8000-00000000b364',
  '00000000-0000-4000-8000-00000000b365', '00000000-0000-4000-8000-00000000b366'
);
UPDATE public.ordenes_produccion SET creado_en = '2099-05-01T12:00:00Z'
WHERE id = '00000000-0000-4000-8000-00000000b367';

CREATE TEMP TABLE equipo AS
SELECT public.obtener_metricas_pipeline_equipo(
  '2099-01-01T00:00:00Z'::timestamptz, '2099-12-31T23:59:59Z'::timestamptz
) AS metrica;
SELECT is((SELECT (metrica->'actual'->'pipelinePorEtapa'->>'ganada')::integer FROM equipo), 1,
  'Equipo también cuenta ganadas por orden');

-- -----------------------------------------------------------------------------
-- 16-17. Ejecutivo: claves presentes y conversión por órdenes
-- (el fixture ya quedó aislado en la ventana futura de arriba)
-- -----------------------------------------------------------------------------

CREATE TEMP TABLE ejec AS
SELECT public.obtener_metricas_dashboard_ejecutivo(
  '2099-01-01T00:00:00Z'::timestamptz, '2099-12-31T23:59:59Z'::timestamptz
) AS metrica;
SELECT ok(
  (SELECT metrica->'actual'->'ventas' ? 'porcentajeConversion'
     AND metrica->'actual'->'ventas' ? 'totalCotizado'
     AND metrica->'actual' ? 'ordenes' AND metrica->'actual' ? 'finanzas' FROM ejec),
  'El ejecutivo conserva sus claves de ventas/ordenes/finanzas');
SELECT is(
  (SELECT (metrica->'actual'->'ventas'->>'porcentajeConversion')::numeric FROM ejec), 16.6667::numeric,
  'porcentajeConversion cuenta ganadas por orden (1 de 6 RFQ del rango)');

SELECT * FROM finish();
ROLLBACK;
