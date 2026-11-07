-- B1 - Reconciliacion del esquema remoto (AUD-20).
-- Verifica que la migracion 20261106120000 restaura exactamente los objetos que
-- faltaban en Supabase remoto, con permisos endurecidos y sin regresar C11-C13.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(33);

-- 1-3. Funciones restauradas.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'privado' AND p.proname = 'recurso_compatible_con_partida'
            AND pg_get_function_identity_arguments(p.oid) = 'p_partida_id uuid, p_recurso_id uuid'),
  'Existe privado.recurso_compatible_con_partida(uuid, uuid)');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'privado' AND p.proname = 'emitir_evento_cambio_estado_orden'
            AND pg_get_function_identity_arguments(p.oid) = ''),
  'Existe privado.emitir_evento_cambio_estado_orden()');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'privado' AND p.proname = 'emitir_evento_nota_entrega'
            AND pg_get_function_identity_arguments(p.oid) = ''),
  'Existe privado.emitir_evento_nota_entrega()');

-- 4-5. Propiedades de seguridad de las funciones restauradas.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'privado' AND p.proname = 'recurso_compatible_con_partida'
            AND p.prosecdef AND p.provolatile = 's'),
  'recurso_compatible_con_partida es SECURITY DEFINER y STABLE');

SELECT ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'privado' AND p.proname IN ('emitir_evento_cambio_estado_orden', 'emitir_evento_nota_entrega')
     AND p.prosecdef AND p.prorettype = 'trigger'::regtype) = 2,
  'Ambas funciones de evento son SECURITY DEFINER y RETURNS trigger');

-- 6-8. Triggers restaurados y apuntando a la funcion correcta.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = r.relnamespace
          WHERE n.nspname = 'public' AND r.relname = 'ordenes_produccion'
            AND t.tgname = 'trigger_orden_evento_cambio_estado' AND NOT t.tgisinternal),
  'Existe trigger_orden_evento_cambio_estado en ordenes_produccion');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = r.relnamespace
          WHERE n.nspname = 'public' AND r.relname = 'notas_entrega'
            AND t.tgname = 'trigger_nota_entrega_evento' AND NOT t.tgisinternal),
  'Existe trigger_nota_entrega_evento en notas_entrega');

SELECT ok(
  pg_get_triggerdef((SELECT t.oid FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
                     WHERE r.relname = 'ordenes_produccion'
                       AND t.tgname = 'trigger_orden_evento_cambio_estado'))
    ILIKE '%AFTER UPDATE OF estado_sii%emitir_evento_cambio_estado_orden%'
  AND pg_get_triggerdef((SELECT t.oid FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
                         WHERE r.relname = 'notas_entrega'
                           AND t.tgname = 'trigger_nota_entrega_evento'))
    ILIKE '%AFTER INSERT%emitir_evento_nota_entrega%',
  'Los triggers tienen el evento y la funcion esperados');

-- 9-24. Las 16 restricciones ausentes.
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'cuentas_por_cobrar' AND c.conname = 'cuentas_por_cobrar_mxn_tc_uno'), 'Existe cuentas_por_cobrar_mxn_tc_uno');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'pagos_ar' AND c.conname = 'pagos_ar_mxn_tc_uno'), 'Existe pagos_ar_mxn_tc_uno');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_categoria_check'), 'Existe materiales_categoria_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_unidad_compra_check'), 'Existe materiales_unidad_compra_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_unidad_control_check'), 'Existe materiales_unidad_control_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_factor_conversion_check'), 'Existe materiales_factor_conversion_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_costo_unitario_compra_check'), 'Existe materiales_costo_unitario_compra_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_costo_unitario_control_check'), 'Existe materiales_costo_unitario_control_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_stock_reservado_control_check'), 'Existe materiales_stock_reservado_control_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_stock_minimo_control_check'), 'Existe materiales_stock_minimo_control_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'materiales' AND c.conname = 'materiales_factor_merma_porcentaje_check'), 'Existe materiales_factor_merma_porcentaje_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'movimientos_inventario' AND c.conname = 'movimientos_inventario_tipo_movimiento_check'), 'Existe movimientos_inventario_tipo_movimiento_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'movimientos_inventario' AND c.conname = 'movimientos_inventario_costo_unitario_momento_check'), 'Existe movimientos_inventario_costo_unitario_momento_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'movimientos_inventario' AND c.conname = 'movimientos_inventario_operador_id_fkey'), 'Existe movimientos_inventario_operador_id_fkey');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'reservas_material' AND c.conname = 'reservas_material_cantidad_reservada_check'), 'Existe reservas_material_cantidad_reservada_check');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'reservas_material' AND c.conname = 'reservas_material_estado_check'), 'Existe reservas_material_estado_check');

-- 25. Las dos restricciones financieras conservan el grandfathering (NOT VALID).
SELECT ok(
  (SELECT count(*) FROM pg_constraint
   WHERE conname IN ('cuentas_por_cobrar_mxn_tc_uno', 'pagos_ar_mxn_tc_uno') AND NOT convalidated) = 2,
  'Las restricciones MXN/TC se agregan NOT VALID, como en el repositorio');

-- 26. La FK de inventario queda validada.
SELECT ok(
  (SELECT convalidated FROM pg_constraint
   WHERE conrelid = 'public.movimientos_inventario'::regclass
     AND conname = 'movimientos_inventario_operador_id_fkey'),
  'movimientos_inventario_operador_id_fkey queda validada');

-- 27-30. Permisos endurecidos.
SELECT ok(NOT has_function_privilege('authenticated',
  'privado.recurso_compatible_con_partida(uuid, uuid)', 'EXECUTE'),
  'authenticated no puede ejecutar el helper de compatibilidad');
SELECT ok(NOT has_function_privilege('anon',
  'privado.recurso_compatible_con_partida(uuid, uuid)', 'EXECUTE'),
  'anon no puede ejecutar el helper de compatibilidad');
SELECT ok(has_function_privilege('service_role',
  'public.cerrar_sesion_con_consumo_operador(uuid, uuid, numeric, uuid, numeric, numeric, text, uuid, text)', 'EXECUTE'),
  'service_role puede ejecutar el cierre con consumo');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.cerrar_sesion_con_consumo_operador(uuid, uuid, numeric, uuid, numeric, numeric, text, uuid, text)', 'EXECUTE'),
  'authenticated no puede ejecutar el cierre con consumo');

-- 31. C10 usa el codigo de error que espera el servicio TypeScript.
SELECT throws_ok(
  $$SELECT * FROM public.cerrar_sesion_con_consumo_operador(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)$$,
  '23514', 'cierre_sesion_invalido',
  'El cierre con consumo devuelve cierre_sesion_invalido');

-- 32. C11 puede resolver la dependencia cuando no hay meta de proceso.
SELECT lives_ok(
  $$SELECT privado.recurso_compatible_con_operacion(
      '00000000-0000-4000-8000-000000000000'::uuid, NULL,
      '00000000-0000-4000-8000-000000000001'::uuid)$$,
  'recurso_compatible_con_operacion con meta NULL no falla por funcion inexistente');

-- 33. Las versiones C11-C13 siguen vigentes (no se reaplico C9.2 completo).
SELECT ok(
  pg_get_functiondef('public.programar_partida_recurso(uuid, uuid, uuid, smallint, date, text, numeric, integer, uuid)'::regprocedure)
    ILIKE '%meta_proceso_id%',
  'programar_partida_recurso conserva la firma y logica de C11');

SELECT * FROM finish();
ROLLBACK;
