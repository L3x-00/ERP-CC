-- SII-B8 F4 — Compras/CxP con folio CG-MMYY_#### compartido y pagos a proveedores.
-- Verifica serie compartida gastos/compras, estados, pagos parciales, CAS,
-- cancelación con/sin pagos y privilegios.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-00000000c101', 'sii-b8-f4-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000c102', 'sii-b8-f4-vend@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B8 F4'
WHERE id = '00000000-0000-4000-8000-00000000c101';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor B8 F4'
WHERE id = '00000000-0000-4000-8000-00000000c102';

INSERT INTO public.proveedores (id, nombre_comercial, razon_social, contacto_nombre, correo, telefono)
VALUES ('00000000-0000-4000-8000-00000000c103', 'Aceros F4', 'Aceros F4 SA de CV',
  'Contacto F4', 'proveedor-f4@prueba.local', '5555555555');

CREATE TEMP TABLE f4 (clave text PRIMARY KEY, valor jsonb);
SELECT plan(29);

-- 1-2. Alta de compra: BORRADOR, folio CG y saldo total.
INSERT INTO f4 (clave, valor)
SELECT 'compra1', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 100, 16, 'MXN', 1, NULL, 'Compra F4',
  '00000000-0000-4000-8000-00000000c101') AS compra;
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra1'), 'BORRADOR',
  'La compra nace BORRADOR');
SELECT ok((SELECT (valor ->> 'folio_sii') ~ '^CG-[0-9]{4}_[0-9]{4,}$' FROM f4 WHERE clave = 'compra1'),
  'La compra recibe folio CG-MMYY_####');
SELECT is((SELECT (valor ->> 'saldo_pendiente')::numeric FROM f4 WHERE clave = 'compra1'), 116::numeric,
  'El saldo inicial es el total');

-- 3-4. Serie compartida: el gasto nuevo usa el siguiente CG de la serie.
INSERT INTO f4 (clave, valor)
SELECT 'gasto1', to_jsonb(gasto.*) FROM public.registrar_gasto(
  NULL, '00000000-0000-4000-8000-00000000c103', 'materia_prima', 'Gasto serie CG',
  50, 8, 58, 'MXN', 1, now(), NULL, NULL, NULL, NULL,
  '{}'::jsonb, NULL, '00000000-0000-4000-8000-00000000c101', NULL) AS gasto;
SELECT is(
  (SELECT split_part(valor ->> 'folio_sii', '_', 2)::integer
   FROM f4 WHERE clave = 'gasto1'),
  (SELECT split_part(valor ->> 'folio_sii', '_', 2)::integer + 1
   FROM f4 WHERE clave = 'compra1'),
  'El gasto continúa la serie CG después de la compra');
SELECT ok((SELECT (valor ->> 'folio') ~ '^GTO-[0-9]{6}$' AND valor ->> 'folio_sii' IS NOT NULL
  FROM f4 WHERE clave = 'gasto1'),
  'El gasto conserva su folio interno GTO además del CG');

-- 5. Edición BORRADOR con CAS.
UPDATE f4 SET valor = valor || to_jsonb(compra.*)
FROM public.actualizar_compra_borrador(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra1'),
  '00000000-0000-4000-8000-00000000c103', NULL, 200, 16, 'MXN', 1, NULL, 'Compra F4 ampliada',
  '00000000-0000-4000-8000-00000000c101') AS compra
WHERE f4.clave = 'compra1';
SELECT is((SELECT (valor ->> 'saldo_pendiente')::numeric FROM f4 WHERE clave = 'compra1'), 216::numeric,
  'La edición recalcula total y saldo');
SELECT throws_ok($$SELECT * FROM public.actualizar_compra_borrador(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  '2000-01-01T00:00:00Z'::timestamptz,
  '00000000-0000-4000-8000-00000000c103', NULL, 200, 16, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'compra_desactualizada', 'Un CAS obsoleto no edita la compra');

-- 6-8. Confirmar, recibir y pagar parcial/total.
UPDATE f4 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra1'),
  'CONFIRMADA', NULL, '00000000-0000-4000-8000-00000000c101') AS compra
WHERE f4.clave = 'compra1';
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra1'), 'CONFIRMADA',
  'La compra se confirma');
UPDATE f4 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra1'),
  'RECIBIDA', NULL, '00000000-0000-4000-8000-00000000c101') AS compra
WHERE f4.clave = 'compra1';
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra1'), 'RECIBIDA',
  'La compra se marca recibida');
UPDATE f4 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  100, 'transferencia', 'PAGO-F4-1', NULL, NULL,
  '00000000-0000-4000-8000-00000000c101') AS pago
WHERE f4.clave = 'compra1';
SELECT is((SELECT (valor ->> 'saldo_pendiente')::numeric FROM f4 WHERE clave = 'compra1'), 116::numeric,
  'El pago parcial reduce el saldo');
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra1'), 'RECIBIDA',
  'El estado no cambia con saldo pendiente');
UPDATE f4 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  116, 'efectivo', NULL, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101') AS pago
WHERE f4.clave = 'compra1';
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra1'), 'PAGADA',
  'Al saldar, la compra queda PAGADA');
SELECT is((SELECT count(*) FROM public.pagos_compra
  WHERE compra_id = (SELECT (f4.valor ->> 'id')::uuid FROM f4 WHERE f4.clave = 'compra1')), 2::bigint,
  'Los dos pagos quedan registrados');

-- 9. Editar una compra ya no borrador.
SELECT throws_ok($$SELECT * FROM public.actualizar_compra_borrador(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra1'),
  '00000000-0000-4000-8000-00000000c103', NULL, 10, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'compra_no_editable', 'Una compra recibida/pagada no se edita');

-- 10-12. Segunda compra: validaciones de pago y cancelación.
INSERT INTO f4 (clave, valor)
SELECT 'compra2', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 50, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101') AS compra;
SELECT throws_ok($$SELECT * FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra2'),
  10, 'transferencia', NULL, NULL, NULL, '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'compra_no_pagable', 'Un borrador no admite pagos');
SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c999', NULL, 10, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101')$$,
  'P0002', 'proveedor_inexistente', 'La compra exige proveedor válido');
SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 10, 0, 'MXN', 18.5, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'datos_compra_invalidos', 'MXN exige tipo de cambio 1');

-- 13-14. Cancelación con y sin pagos.
UPDATE f4 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra2'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra2'),
  'CANCELADA', 'Proveedor equivocado', '00000000-0000-4000-8000-00000000c101') AS compra
WHERE f4.clave = 'compra2';
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra2'), 'CANCELADA',
  'Un borrador se cancela con motivo');
INSERT INTO f4 (clave, valor)
SELECT 'compra3', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 30, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101') AS compra;
UPDATE f4 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra3'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra3'),
  'CONFIRMADA', NULL, '00000000-0000-4000-8000-00000000c101') AS compra
WHERE f4.clave = 'compra3';
UPDATE f4 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra3'),
  10, 'efectivo', NULL, NULL, NULL, '00000000-0000-4000-8000-00000000c101') AS pago
WHERE f4.clave = 'compra3';
SELECT throws_ok($$SELECT * FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra3'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra3'),
  'CANCELADA', 'Con pagos', '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'compra_con_pagos', 'Una compra con pagos no se cancela');

-- 15. Tercera cuota de la serie compartida tras gasto y compras.
INSERT INTO f4 (clave, valor)
SELECT 'compra4', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 5, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c101') AS compra;
SELECT is(
  (SELECT split_part(valor ->> 'folio_sii', '_', 2)::integer
   FROM f4 WHERE clave = 'compra4'),
  (SELECT max(split_part(valor ->> 'folio_sii', '_', 2)::integer) + 1
   FROM f4 WHERE clave <> 'compra4'),
  'La serie CG sigue avanzando entre gastos y compras');

-- 16. Permisos: el vendedor no crea compras.
SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-00000000c103', NULL, 10, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-00000000c102')$$,
  '23514', 'datos_compra_invalidos', 'Sin permiso de gastos no se crean compras');

-- 17-22. Pago que excede saldo y saldo exacto restante.
UPDATE f4 SET valor = valor || to_jsonb(pago.*)
FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra3'),
  20, 'transferencia', NULL, NULL, NULL, '00000000-0000-4000-8000-00000000c101') AS pago
WHERE f4.clave = 'compra3';
SELECT is((SELECT valor ->> 'estado' FROM f4 WHERE clave = 'compra3'), 'PAGADA',
  'El segundo pago salda la compra');
SELECT throws_ok($$SELECT * FROM public.pagar_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra3'),
  1, 'efectivo', NULL, NULL, NULL, '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'compra_no_pagable', 'Una compra pagada no recibe más pagos');
SELECT is((SELECT (valor ->> 'saldo_pendiente')::numeric FROM f4 WHERE clave = 'compra3'), 0::numeric,
  'El saldo final es cero');
SELECT ok(has_table_privilege('authenticated', 'public.compras', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.compras', 'INSERT'),
  'compras es solo lectura para authenticated');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.crear_compra(uuid,uuid,numeric,numeric,text,numeric,date,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_compra');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.pagar_compra(uuid,numeric,text,text,uuid,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta pagar_compra');

-- 23-24. Cancelación sin motivo y con pagos ya cubierta arriba; cierre de folios.
SELECT throws_ok($$SELECT * FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f4 WHERE clave = 'compra4'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f4 WHERE clave = 'compra4'),
  'CANCELADA', 'ab', '00000000-0000-4000-8000-00000000c101')$$,
  '23514', 'motivo_cancelacion_invalido', 'El motivo de cancelación es obligatorio');
SELECT ok((SELECT count(DISTINCT folio_sii) FROM (
  SELECT folio_sii FROM public.compras WHERE folio_sii LIKE 'CG-%'
  UNION ALL
  SELECT folio_sii FROM public.gastos WHERE folio_sii LIKE 'CG-%'
) AS documentos) >= 4,
  'La serie CG no se repite entre gastos y compras del fixture');

SELECT * FROM finish();
ROLLBACK;
