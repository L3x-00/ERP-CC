-- C10.1/F06/F07/F08 — Compras como fuente del costo:
-- rubro obligatorio con Orden, clasificación de históricas, datos de material,
-- firmas nuevas sin overload ambiguo y guardarraíl de no duplicar en gastos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(35);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-4000-8000-0000000f0601', 'f06-admin@prueba.local', '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000f0602', 'f06-vend@prueba.local', '{}'::jsonb);
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin F06'
WHERE id = '00000000-0000-4000-8000-0000000f0601';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor F06'
WHERE id = '00000000-0000-4000-8000-0000000f0602';

INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000f0611', 'Cliente F06', 'Cliente F06 SA', 'activo');

INSERT INTO public.ordenes_produccion
  (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000000f0610', 'OP-991201',
  '00000000-0000-4000-8000-0000000f0611', 'completada', now() + interval '10 days');

INSERT INTO public.proveedores (id, nombre_comercial, razon_social, contacto_nombre, correo, telefono)
VALUES ('00000000-0000-4000-8000-0000000f0612', 'Aceros F06', 'Aceros F06 SA de CV',
  'Contacto F06', 'proveedor-f06@prueba.local', '5555555555');

INSERT INTO public.catalogo_materiales (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000f0613', 'ACF06', 'Acero F06');

-- 1-7. Columnas e índice nuevos. ---------------------------------------------
SELECT has_column('public', 'compras', 'rubro_costo', 'compras.rubro_costo existe');
SELECT has_column('public', 'compras', 'concepto', 'compras.concepto existe');
SELECT has_column('public', 'compras', 'material_id', 'compras.material_id existe');
SELECT has_column('public', 'compras', 'cantidad', 'compras.cantidad existe');
SELECT has_column('public', 'compras', 'unidad', 'compras.unidad existe');
SELECT has_column('public', 'compras', 'costo_unitario', 'compras.costo_unitario existe');
SELECT has_index('public', 'compras', 'ix_compras_orden_estado', 'índice por orden y estado');

-- 8-12. CHECKs de dominio y tolerancia del subtotal. ------------------------
SELECT throws_ok($$INSERT INTO public.compras
  (folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por, rubro_costo)
  VALUES ('CG-9912_0601', '00000000-0000-4000-8000-0000000f0612',
    '00000000-0000-4000-8000-0000000f0610', 'BORRADOR', 10, 0, 10, 'MXN', 1, 10,
    '00000000-0000-4000-8000-0000000f0601', 'otro')$$,
  '23514', NULL, 'Un rubro fuera del catálogo no entra');

SELECT throws_ok($$INSERT INTO public.compras
  (folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por, cantidad)
  VALUES ('CG-9912_0602', '00000000-0000-4000-8000-0000000f0612',
    '00000000-0000-4000-8000-0000000f0610', 'BORRADOR', 10, 0, 10, 'MXN', 1, 10,
    '00000000-0000-4000-8000-0000000f0601', 0)$$,
  '23514', NULL, 'La cantidad debe ser mayor que cero');

SELECT throws_ok($$INSERT INTO public.compras
  (folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por, costo_unitario)
  VALUES ('CG-9912_0603', '00000000-0000-4000-8000-0000000f0612',
    '00000000-0000-4000-8000-0000000f0610', 'BORRADOR', 10, 0, 10, 'MXN', 1, 10,
    '00000000-0000-4000-8000-0000000f0601', -1)$$,
  '23514', NULL, 'El costo unitario no puede ser negativo');

SELECT lives_ok($$INSERT INTO public.compras
  (folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por, cantidad, costo_unitario)
  VALUES ('CG-9912_0604', '00000000-0000-4000-8000-0000000f0612',
    '00000000-0000-4000-8000-0000000f0610', 'BORRADOR', 200.01, 0, 200.01, 'MXN', 1, 200.01,
    '00000000-0000-4000-8000-0000000f0601', 2, 100)$$,
  'La tolerancia de 0.01 acepta un centavo de diferencia');

SELECT throws_ok($$INSERT INTO public.compras
  (folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por, cantidad, costo_unitario)
  VALUES ('CG-9912_0605', '00000000-0000-4000-8000-0000000f0612',
    '00000000-0000-4000-8000-0000000f0610', 'BORRADOR', 200.02, 0, 200.02, 'MXN', 1, 200.02,
    '00000000-0000-4000-8000-0000000f0601', 2, 100)$$,
  '23514', NULL, 'Dos centavos de diferencia rompen la coherencia');

-- 13. Con Orden y sin rubro, el alta falla con código propio. ---------------
SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0612', '00000000-0000-4000-8000-0000000f0610',
  100, 16, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'rubro_costo_requerido', 'Con Orden el rubro es obligatorio');

-- 14-15. Alta completa con rubro y datos de material. ----------------------
CREATE TEMP TABLE f06 (clave text PRIMARY KEY, valor jsonb);
INSERT INTO f06 (clave, valor)
SELECT 'compra1', to_jsonb(compra.*) FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0612', '00000000-0000-4000-8000-0000000f0610',
  200, 32, 'MXN', 1, NULL, 'Compra con material',
  '00000000-0000-4000-8000-0000000f0601', NULL,
  'material', 'Placa de acero', '00000000-0000-4000-8000-0000000f0613', 2, 'KG', 100) AS compra;
SELECT is((SELECT valor ->> 'estado' FROM f06 WHERE clave = 'compra1'), 'BORRADOR',
  'La compra con rubro nace BORRADOR');

SELECT ok((SELECT (valor ->> 'monto_total')::numeric = 232
  FROM f06 WHERE clave = 'compra1')
  AND (SELECT rubro_costo = 'material' AND concepto = 'Placa de acero'
    AND material_id = '00000000-0000-4000-8000-0000000f0613'
    AND cantidad = 2 AND unidad = 'KG' AND costo_unitario = 100
  FROM public.compras WHERE id = (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1')),
  'El alta guarda rubro, concepto, material, cantidad, unidad y costo');

-- 16-18. Validaciones del alta. ---------------------------------------------
SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0612', NULL,
  100, 16, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0601', NULL,
  'otro')$$,
  '23514', 'rubro_costo_invalido', 'Sin Orden un rubro inválido tampoco entra');

SELECT throws_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0612', NULL,
  200, 32, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0601', NULL,
  NULL, 'Placa', '00000000-0000-4000-8000-0000000f0613', 2, 'KG', 50)$$,
  '23514', 'subtotal_material_incoherente', 'Cantidad por costo debe cuadrar con el subtotal');

SELECT lives_ok($$SELECT * FROM public.crear_compra(
  '00000000-0000-4000-8000-0000000f0612', NULL, 10, 0, 'MXN', 1, NULL, NULL,
  '00000000-0000-4000-8000-0000000f0601')$$,
  'La llamada posicional de 9 args sigue vigente');

-- 19-20. Edición BORRADOR: exige rubro con Orden y guarda el detalle. -------
SELECT throws_ok($$SELECT * FROM public.actualizar_compra_borrador(
  (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f06 WHERE clave = 'compra1'),
  '00000000-0000-4000-8000-0000000f0612', '00000000-0000-4000-8000-0000000f0610',
  200, 32, 'MXN', 1, NULL, NULL, '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'rubro_costo_requerido', 'La edición con Orden tampoco admite rubro nulo');

UPDATE f06 SET valor = valor || to_jsonb(compra.*)
FROM public.actualizar_compra_borrador(
  (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f06 WHERE clave = 'compra1'),
  '00000000-0000-4000-8000-0000000f0612', '00000000-0000-4000-8000-0000000f0610',
  200, 32, 'MXN', 1, NULL, 'Compra editada', '00000000-0000-4000-8000-0000000f0601',
  'subcontratacion', 'Rectificado externo', NULL, NULL, NULL, NULL) AS compra
WHERE f06.clave = 'compra1';
SELECT is((SELECT rubro_costo FROM public.compras
  WHERE id = (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1')),
  'subcontratacion', 'La edición actualiza el rubro');

-- 21-24. Una sola firma por RPC y la vieja ya no existe. --------------------
SELECT ok(to_regprocedure(
  'public.crear_compra(uuid,uuid,numeric,numeric,text,numeric,date,text,uuid,uuid)') IS NULL,
  'La firma vieja de crear_compra no existe');
SELECT ok(to_regprocedure(
  'public.actualizar_compra_borrador(uuid,timestamptz,uuid,uuid,numeric,numeric,text,numeric,date,text,uuid)') IS NULL,
  'La firma vieja de actualizar_compra_borrador no existe');
SELECT is((SELECT count(*)::integer FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'crear_compra'), 1,
  'crear_compra tiene un solo overload');
SELECT is((SELECT count(*)::integer FROM pg_proc AS p
  INNER JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'actualizar_compra_borrador'), 1,
  'actualizar_compra_borrador tiene un solo overload');

-- 25-29. Clasificación de históricas. ---------------------------------------
INSERT INTO public.compras
  (id, folio_sii, proveedor_id, orden_id, estado, monto_subtotal, monto_iva, monto_total,
   moneda, tipo_cambio, saldo_pendiente, creado_por)
VALUES
  ('00000000-0000-4000-8000-0000000f0620', 'CG-9912_0610',
   '00000000-0000-4000-8000-0000000f0612', '00000000-0000-4000-8000-0000000f0610',
   'CONFIRMADA', 500, 80, 580, 'MXN', 1, 580, '00000000-0000-4000-8000-0000000f0601'),
  ('00000000-0000-4000-8000-0000000f0621', 'CG-9912_0611',
   '00000000-0000-4000-8000-0000000f0612', NULL,
   'CONFIRMADA', 100, 16, 116, 'MXN', 1, 116, '00000000-0000-4000-8000-0000000f0601');

SELECT lives_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0620', 'material',
  '00000000-0000-4000-8000-0000000f0601')$$,
  'Una compra histórica con Orden se clasifica a mano');

SELECT is((SELECT rubro_costo FROM public.compras
  WHERE id = '00000000-0000-4000-8000-0000000f0620'), 'material',
  'El rubro asignado queda persistido');

SELECT throws_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0620', 'material',
  '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'rubro_ya_asignado', 'No se sobrescribe un rubro ya asignado');

SELECT throws_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0621', 'material',
  '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'compra_sin_orden', 'Una compra sin Orden no recibe rubro');

UPDATE public.compras SET estado = 'CANCELADA', cancelada_en = now(),
  motivo_cancelacion = 'Prueba de clasificación'
WHERE id = '00000000-0000-4000-8000-0000000f0620';
SELECT throws_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0620', 'material',
  '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'compra_cancelada', 'Una compra cancelada no se clasifica');

-- 30-31. Un actor sin permiso no clasifica; el rubro inválido no llega. -----
SELECT throws_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0620', 'material',
  '00000000-0000-4000-8000-0000000f0602')$$,
  '23514', 'datos_compra_invalidos', 'Sin permiso de gastos no se clasifica');

SELECT throws_ok($$SELECT * FROM public.asignar_rubro_costo_compra(
  '00000000-0000-4000-8000-0000000f0620', 'otro',
  '00000000-0000-4000-8000-0000000f0601')$$,
  '23514', 'datos_compra_invalidos', 'El rubro inválido se rechaza antes de escribir');

-- 32. Crear, confirmar y recibir una compra no inserta gastos. --------------
CREATE TEMP TABLE gastos_antes AS SELECT count(*)::integer AS total FROM public.gastos;
UPDATE f06 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f06 WHERE clave = 'compra1'),
  'CONFIRMADA', NULL, '00000000-0000-4000-8000-0000000f0601') AS compra
WHERE f06.clave = 'compra1';
UPDATE f06 SET valor = valor || to_jsonb(compra.*)
FROM public.cambiar_estado_compra(
  (SELECT (valor ->> 'id')::uuid FROM f06 WHERE clave = 'compra1'),
  (SELECT (valor ->> 'actualizado_en')::timestamptz FROM f06 WHERE clave = 'compra1'),
  'RECIBIDA', NULL, '00000000-0000-4000-8000-0000000f0601') AS compra
WHERE f06.clave = 'compra1';
SELECT is((SELECT count(*)::integer FROM public.gastos), (SELECT total FROM gastos_antes),
  'El ciclo de la compra no duplica el costo como gasto');

-- 33. El COMMENT de la tabla ya no niega la rentabilidad. -------------------
SELECT ok(obj_description('public.compras'::regclass, 'pg_class')
  NOT LIKE '%no entra a rentabilidad%',
  'El COMMENT de compras ya no dice que no entra a la rentabilidad');

-- 34-35. Privilegios de la RPC nueva. ---------------------------------------
SELECT ok(NOT has_function_privilege('authenticated',
  'public.asignar_rubro_costo_compra(uuid,text,uuid,uuid)', 'EXECUTE'),
  'authenticated no clasifica compras');
SELECT ok(has_function_privilege('service_role',
  'public.asignar_rubro_costo_compra(uuid,text,uuid,uuid)', 'EXECUTE'),
  'service_role sí clasifica compras');

SELECT * FROM finish();
ROLLBACK;
