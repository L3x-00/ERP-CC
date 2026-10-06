-- SII-B3.5 (cierre) — Continuidad administrativa de folios periódicos
-- Verifica: existencia/privilegios, permisos, tipo/periodo, tope 99, no
-- retroceso contra folio RFQ real y contador vigente, y upsert idempotente.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(29);

-- Fixture: actor administrador y actor sin permiso de configuración.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b3f01', 'sii-b3f-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b3f02', 'sii-b3f-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B3.5 folios'
WHERE id = '00000000-0000-4000-8000-0000000b3f01';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B3.5 folios'
WHERE id = '00000000-0000-4000-8000-0000000b3f02';

-- 1-2. Funciones publicadas.
SELECT has_function('public', 'consultar_continuidad_folio_periodico', ARRAY['text', 'uuid'],
  'Existe consultar_continuidad_folio_periodico');
SELECT has_function('public', 'ajustar_continuidad_folio_periodico', ARRAY['text', 'text', 'integer', 'uuid'],
  'Existe ajustar_continuidad_folio_periodico');

-- 3-6. Solo service_role puede ejecutar.
SELECT ok(NOT has_function_privilege('authenticated',
  'public.consultar_continuidad_folio_periodico(text,uuid)', 'EXECUTE'),
  'authenticated no consulta la continuidad periódica');
SELECT ok(has_function_privilege('service_role',
  'public.consultar_continuidad_folio_periodico(text,uuid)', 'EXECUTE'),
  'service_role consulta la continuidad periódica');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.ajustar_continuidad_folio_periodico(text,text,integer,uuid)', 'EXECUTE'),
  'authenticated no ajusta la continuidad periódica');
SELECT ok(has_function_privilege('service_role',
  'public.ajustar_continuidad_folio_periodico(text,text,integer,uuid)', 'EXECUTE'),
  'service_role ajusta la continuidad periódica');

-- Fixture determinista dentro de la transacción: el periodo vigente parte sin
-- contador RFQ y sin emisiones RFQ (todo se revierte con el ROLLBACK final).
DELETE FROM public.contadores_folio_periodico
WHERE tipo = 'RFQ' AND periodo = to_char(now(), 'MMYY');
UPDATE public.pipeline SET folio_rfq = NULL
WHERE folio_rfq ~ ('^RFQ-' || to_char(now(), 'MMYY') || '_[0-9]{2,3}$');
INSERT INTO public.pipeline (folio_op, nombre_contacto, empresa, vendedor_id, folio_rfq)
VALUES (
  'OP-B35-0001', 'Contacto B3.5', 'Empresa B3.5',
  '00000000-0000-4000-8000-0000000b3f01',
  'RFQ-' || to_char(now(), 'MMYY') || '_05'
);

-- 7-8. Validaciones de la consulta.
SELECT throws_ok($$
  SELECT public.consultar_continuidad_folio_periodico('CNC',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '22023', 'tipo_folio_invalido', 'CNC queda fuera del catálogo periódico');
SELECT throws_ok($$
  SELECT public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f02'::uuid)
$$, '42501', 'sin_permiso_configuracion', 'Un vendedor no consulta la continuidad');

-- 9-13. Diagnóstico del periodo vigente.
SELECT is(
  (SELECT periodo FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  to_char(now(), 'MMYY'),
  'La consulta devuelve el periodo vigente MMYY'
);
SELECT is(
  (SELECT ultimo_emitido FROM public.consultar_continuidad_folio_periodico('O',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  0,
  'O usa el folio_sii emitido (0 si aún no hay órdenes)'
);
SELECT is(
  (SELECT ultimo_contador FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  NULL,
  'Sin contador previo, último reservado es NULL'
);
SELECT is(
  (SELECT ultimo_emitido FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  5,
  'RFQ detecta el folio realmente emitido del periodo'
);
SELECT is(
  (SELECT siguiente FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  6,
  'El siguiente es el máximo real + 1'
);

-- 14-19. Ajuste sin retroceso y upsert idempotente.
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 4,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '23514', 'folio_no_puede_retroceder', 'No baja por debajo del folio emitido real');
SELECT is(
  (SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 5,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  5,
  'Ajustar al valor emitido queda guardado'
);
SELECT is(
  (SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 7,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  7,
  'Ajustar hacia adelante queda guardado'
);
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 6,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '23514', 'folio_no_puede_retroceder', 'No baja por debajo del contador vigente');
SELECT is(
  (SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 7,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  7,
  'Repetir el mismo valor es idempotente'
);
SELECT is(
  (SELECT count(*)::integer FROM public.contadores_folio_periodico
   WHERE tipo = 'RFQ' AND periodo = to_char(now(), 'MMYY')),
  1,
  'El upsert no duplica la fila del contador'
);

-- 20-25. Validaciones del ajuste y rango 0..999.
SELECT is(
  (SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 100,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  100,
  'El rango crece a 3 dígitos: 100 es válido'
);
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('XX', to_char(now(), 'MMYY'), 7,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '22023', 'tipo_folio_invalido', 'El ajuste rechaza tipos fuera del catálogo');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', '1326', 7,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '22023', 'continuidad_folio_invalida', 'El periodo debe ser MMYY válido');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 1000,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '22023', 'continuidad_folio_invalida', 'El último no puede superar 999');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), -1,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)
$$, '22023', 'continuidad_folio_invalida', 'El último no puede ser negativo');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 7,
    '00000000-0000-4000-8000-0000000b3f02'::uuid)
$$, '42501', 'sin_permiso_configuracion', 'Un vendedor no ajusta la continuidad');

-- 26-29. Tope 999 y lectura final del periodo.
SELECT is(
  (SELECT public.ajustar_continuidad_folio_periodico('RFQ', to_char(now(), 'MMYY'), 999,
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  999,
  'El ajuste permite llegar al tope del periodo'
);
SELECT is(
  (SELECT siguiente FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  NULL,
  'En el tope, siguiente es NULL (periodo agotado)'
);
SELECT is(
  (SELECT ultimo_contador FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  999,
  'La consulta refleja el contador ajustado'
);
SELECT is(
  (SELECT ultimo_emitido FROM public.consultar_continuidad_folio_periodico('RFQ',
    '00000000-0000-4000-8000-0000000b3f01'::uuid)),
  5,
  'El último emitido real no cambia con el ajuste'
);

SELECT * FROM finish();
ROLLBACK;
