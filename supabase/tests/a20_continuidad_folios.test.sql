BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000a2041', 'a20-folios-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000a2042', 'a20-folios-gerente@prueba.local'),
  ('00000000-0000-4000-8000-0000000a2043', 'a20-folios-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2041';
UPDATE public.usuarios SET rol = 'gerente', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2042';
UPDATE public.usuarios SET rol = 'vendedor', activo = true
WHERE id = '00000000-0000-4000-8000-0000000a2043';

SELECT ok(NOT has_function_privilege('authenticated',
  'public.ajustar_continuidad_folio_cnc(text,integer,uuid)', 'EXECUTE'),
  'El cliente no puede ajustar el contador directamente');
SELECT ok(has_function_privilege('service_role',
  'public.ajustar_continuidad_folio_cnc(text,integer,uuid)', 'EXECUTE'),
  'El servidor puede ajustar el contador validando actor');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.consultar_continuidad_folio_cnc(text,uuid)', 'EXECUTE'),
  'La consulta también exige la acción de servidor');
SELECT lives_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 47,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, 'Administrador activo adelanta un mes histórico');
SELECT is((SELECT ultimo FROM public.contador_folios WHERE periodo = '1124'), 47,
  'El último folio se conserva por periodo');
SELECT is((SELECT siguiente FROM public.consultar_continuidad_folio_cnc('1124',
  '00000000-0000-4000-8000-0000000a2041'::uuid)), 48,
  'La consulta propone el siguiente consecutivo');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 46,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '23514', 'folio_no_puede_retroceder', 'Nunca retrocede una secuencia usada');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1324', 48,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '23514', 'continuidad_folio_invalida', 'Rechaza mes fuera de 01 a 12');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 10000,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '23514', 'continuidad_folio_invalida', 'Rechaza desbordamiento de cuatro dígitos');
INSERT INTO public.pipeline (id, folio_op, folio_cnc, nombre_contacto, empresa, vendedor_id)
VALUES ('00000000-0000-4000-8000-0000000a2044', 'OP-CFG04-TEST', 'CNC-1124-0050',
  'Contacto CFG04', 'Empresa CFG04', '00000000-0000-4000-8000-0000000a2041');
SELECT is((SELECT ultimo_emitido FROM public.consultar_continuidad_folio_cnc('1124',
  '00000000-0000-4000-8000-0000000a2041'::uuid)), 50,
  'Distingue el último emitido de la reserva del contador');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 49,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '23514', 'folio_no_puede_retroceder',
  'Un folio histórico importado impide dejar el contador por debajo del máximo real');
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 48,
    '00000000-0000-4000-8000-0000000a2043'::uuid)
$$, '42501', 'sin_permiso_configuracion', 'Vendedor no puede ajustar folios');
UPDATE public.usuarios SET activo = false
WHERE id = '00000000-0000-4000-8000-0000000a2041';
SELECT throws_ok($$
  SELECT public.ajustar_continuidad_folio_cnc('1124', 48,
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '42501', 'sin_permiso_configuracion', 'Desactivar admin revoca su autoridad');
SELECT throws_ok($$
  SELECT * FROM public.consultar_continuidad_folio_cnc('1124',
    '00000000-0000-4000-8000-0000000a2041'::uuid)
$$, '42501', 'sin_permiso_configuracion', 'También revoca la lectura del admin inactivo');
SELECT is(public.ajustar_continuidad_folio_cnc('1124', 50,
  '00000000-0000-4000-8000-0000000a2042'::uuid), 50,
  'Gerente con permiso Configuración puede ajustar');

SELECT lives_ok($$
  SELECT public.ajustar_continuidad_folio_cnc(to_char(now(), 'MMYY'), 9000,
    '00000000-0000-4000-8000-0000000a2042'::uuid)
$$, 'Ajuste del periodo vigente se serializa con generador');
SELECT is(public.generar_folio_cnc(),
  'CNC-' || to_char(now(), 'MMYY') || '-9001',
  'El siguiente generado conserva continuidad 9000 a 9001');
SELECT is(public.ajustar_continuidad_folio_cnc(to_char(now(), 'MMYY'), 9999,
  '00000000-0000-4000-8000-0000000a2042'::uuid), 9999,
  'El administrador puede marcar el último valor válido');
SELECT throws_ok($$SELECT public.generar_folio_cnc()$$,
  '23514', 'folio_cnc_periodo_agotado', 'No recorta ni duplica el folio 10000');
SELECT is((SELECT ultimo FROM public.contador_folios WHERE periodo = to_char(now(), 'MMYY')),
  9999, 'Un intento agotado no avanza el contador');

SELECT * FROM finish();
ROLLBACK;
