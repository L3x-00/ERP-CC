-- Obs. 2026-10-12: el folio de propuesta y de revisión aceptan el desborde de
-- 99 por periodo (generar_folio_periodico crece a 3 dígitos; B5/B7/B8 ya lo
-- hacían). Verifica que `CNC-MMYY_100` y su revisión A pasan y que 4 dígitos
-- (fuera del tope 999 + formato establecido) se rechazan.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b4f01', 'b4f-admin@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B4F'
WHERE id = '00000000-0000-4000-8000-0000000b4f01';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000b4f20', 'B4F Cliente', 'B4F Cliente SA', 'activo');
INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000b4f30', 'OP-B4F-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto B4F', 'B4F Empresa', '00000000-0000-4000-8000-0000000b4f20',
  '00000000-0000-4000-8000-0000000b4f01', 'MXN'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.propuestas (rfq_id, cliente_id, folio_cnc, responsable_id, creado_por)
    VALUES (
      '00000000-0000-4000-8000-0000000b4f30', '00000000-0000-4000-8000-0000000b4f20',
      'CNC-1026_100', '00000000-0000-4000-8000-0000000b4f01', '00000000-0000-4000-8000-0000000b4f01'
    )
  $sql$,
  'la propuesta acepta el consecutivo de 3 dígitos (desborde de 99)');

SELECT lives_ok(
  $sql$
    INSERT INTO public.propuesta_revisiones (propuesta_id, letra, folio_revision, creado_por)
    SELECT id, 'A', folio_cnc || '-A', '00000000-0000-4000-8000-0000000b4f01'
    FROM public.propuestas WHERE folio_cnc = 'CNC-1026_100'
  $sql$,
  'la revisión A acepta el folio con 3 dígitos');

SELECT throws_ok(
  $sql$
    INSERT INTO public.propuestas (rfq_id, cliente_id, folio_cnc, responsable_id, creado_por)
    VALUES (
      '00000000-0000-4000-8000-0000000b4f30', '00000000-0000-4000-8000-0000000b4f20',
      'CNC-1026_1000', '00000000-0000-4000-8000-0000000b4f01', '00000000-0000-4000-8000-0000000b4f01'
    )
  $sql$,
  '23514', NULL,
  'un consecutivo fuera del tope del periodo se rechaza');

SELECT * FROM finish();
ROLLBACK;
