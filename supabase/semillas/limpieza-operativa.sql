-- =============================================================================
-- Limpieza operativa — conserva el maestro (clientes, materiales, precios,
-- dimensiones, catálogos, proveedores, usuarios, máquinas, tarifas y tesorería
-- base) y vacía todo lo transaccional: RFQ, propuestas, órdenes, planeación,
-- producción, inventario en movimiento, compras, gastos, facturación, cobranza,
-- entregas, notificaciones y comentarios operativos.
--
-- Uso (remoto, autorizado por el PO):
--   supabase db query --linked --file supabase/semillas/limpieza-operativa.sql
--
-- Todo vive en un único bloque DO: se ejecuta de forma atómica y verifica al
-- final que el maestro quedó intacto. Antes se toma un respaldo con
-- `supabase db dump --linked`.
-- =============================================================================

DO $limpieza$
DECLARE
  v_antes jsonb;
  v_despues jsonb;
  v_tabla text;
  v_n int;

  -- Orden hijo → padre. El borrado de cabeceras arrastra sus hijos por CASCADE.
  orden_borrado text[] := ARRAY[
    'partidas_nota_entrega',
    'notas_entrega',
    'registros_avance_partida',
    'registros_consumo_material',
    'registros_tiempo_operador',
    'archivos_sesion_produccion',
    'autorizaciones_hora_extra',
    'reclamos_proceso_operador',
    'inspecciones_calidad',
    'sesiones_trabajo',
    'corrida_items',
    'corridas',
    'metas_proceso_partida',
    'programacion_areas',
    'excepciones_capacidad_recurso',
    'movimientos_saldo_favor',
    'aplicaciones_pago',
    'reversos_pago_ar',
    'pagos_ar',
    'promesas_pago',
    'facturas',
    'cuentas_por_cobrar',
    'comprobantes_gasto_historial',
    'pagos_compra',
    'compras',
    'gastos',
    'conciliaciones_tesoreria',
    'movimientos_tesoreria',
    'movimientos_inventario',
    'reservas_material',
    'movimientos_saldo_material',
    'saldos_material',
    'solicitudes_orden',
    'partidas_orden_produccion',
    'orden_eventos_cambio',
    'archivos_orden',
    'ordenes_produccion',
    'notificaciones_usuario',
    'metas_vendedor',
    'propuestas_costo_material',
    'propuesta_revision_eventos',
    'propuesta_revision_costos',
    'propuesta_revision_acciones',
    'propuesta_item_operaciones',
    'propuesta_item_ruteo',
    'propuesta_items',
    'propuesta_pdfs',
    'propuesta_revisiones',
    'propuestas',
    'rfq_eventos',
    'rfq_versiones',
    'rfq_item_operaciones',
    'rfq_items',
    'cotizacion_lineas',
    'pipeline'
  ];

  maestro text[] := ARRAY[
    'usuarios', 'permisos', 'permisos_rol', 'configuracion_sistema',
    'clientes', 'contactos_cliente', 'documentos_cliente', 'proveedores',
    'materiales', 'catalogo_materiales', 'catalogo_espesores', 'catalogo_procesos',
    'catalogo_canales', 'catalogo_motivos_pausa', 'catalogo_proximas_acciones',
    'versiones_catalogo', 'cuentas_bancarias', 'saldos_iniciales_tesoreria',
    'areas_trabajo_config', 'recursos_planeacion', 'capacidades_recurso_turno',
    'grupos_equipo', 'grupos_planeados', 'operadores_areas', 'contador_folios',
    'contadores_folio_periodico', 'logs'
  ];

  operativas text[] := ARRAY[
    'pipeline', 'rfq_items', 'rfq_item_operaciones', 'rfq_versiones', 'rfq_eventos',
    'propuestas', 'propuesta_revisiones', 'propuesta_items',
    'ordenes_produccion', 'partidas_orden_produccion', 'orden_eventos_cambio',
    'programacion_areas', 'sesiones_trabajo', 'registros_tiempo_operador',
    'registros_avance_partida', 'registros_consumo_material',
    'movimientos_inventario', 'notas_entrega', 'partidas_nota_entrega',
    'cuentas_por_cobrar', 'pagos_ar', 'facturas', 'compras', 'gastos',
    'movimientos_tesoreria', 'notificaciones_usuario', 'metas_vendedor'
  ];

  -- Tablas que no son maestro pero se conservan tal cual.
  permitidas text[] := ARRAY[
    'intentos_login', 'historial_costos_material', 'archivos', 'comentarios_registro'
  ];
BEGIN
  -- Los triggers de congelamiento comercial/revisión impiden borrar partidas e
  -- hijos de propuestas ya enviadas. Se desactivan para esta transacción con
  -- session_replication_role (se restaura solo al terminar). Como también se
  -- desactivan las cascadas, el orden de borrado es explícito y al final se
  -- verifica que NINGUNA tabla operativa conserve filas.
  EXECUTE 'SET LOCAL session_replication_role = replica';

  -- Foto del maestro antes de borrar.
  SELECT jsonb_object_agg(m.tabla, m.filas) INTO v_antes
  FROM (
    SELECT 'usuarios' AS tabla, count(*)::int AS filas FROM public.usuarios
    UNION ALL SELECT 'permisos', count(*)::int FROM public.permisos
    UNION ALL SELECT 'permisos_rol', count(*)::int FROM public.permisos_rol
    UNION ALL SELECT 'configuracion_sistema', count(*)::int FROM public.configuracion_sistema
    UNION ALL SELECT 'clientes', count(*)::int FROM public.clientes
    UNION ALL SELECT 'contactos_cliente', count(*)::int FROM public.contactos_cliente
    UNION ALL SELECT 'documentos_cliente', count(*)::int FROM public.documentos_cliente
    UNION ALL SELECT 'proveedores', count(*)::int FROM public.proveedores
    UNION ALL SELECT 'materiales', count(*)::int FROM public.materiales
    UNION ALL SELECT 'catalogo_materiales', count(*)::int FROM public.catalogo_materiales
    UNION ALL SELECT 'catalogo_espesores', count(*)::int FROM public.catalogo_espesores
    UNION ALL SELECT 'catalogo_procesos', count(*)::int FROM public.catalogo_procesos
    UNION ALL SELECT 'catalogo_canales', count(*)::int FROM public.catalogo_canales
    UNION ALL SELECT 'catalogo_motivos_pausa', count(*)::int FROM public.catalogo_motivos_pausa
    UNION ALL SELECT 'catalogo_proximas_acciones', count(*)::int FROM public.catalogo_proximas_acciones
    UNION ALL SELECT 'versiones_catalogo', count(*)::int FROM public.versiones_catalogo
    UNION ALL SELECT 'cuentas_bancarias', count(*)::int FROM public.cuentas_bancarias
    UNION ALL SELECT 'saldos_iniciales_tesoreria', count(*)::int FROM public.saldos_iniciales_tesoreria
    UNION ALL SELECT 'areas_trabajo_config', count(*)::int FROM public.areas_trabajo_config
    UNION ALL SELECT 'recursos_planeacion', count(*)::int FROM public.recursos_planeacion
    UNION ALL SELECT 'capacidades_recurso_turno', count(*)::int FROM public.capacidades_recurso_turno
    UNION ALL SELECT 'grupos_equipo', count(*)::int FROM public.grupos_equipo
    UNION ALL SELECT 'grupos_planeados', count(*)::int FROM public.grupos_planeados
    UNION ALL SELECT 'operadores_areas', count(*)::int FROM public.operadores_areas
    UNION ALL SELECT 'contador_folios', count(*)::int FROM public.contador_folios
    UNION ALL SELECT 'contadores_folio_periodico', count(*)::int FROM public.contadores_folio_periodico
    UNION ALL SELECT 'logs', count(*)::int FROM public.logs
  ) AS m;

  -- Historial de costos propuesto desde propuestas (el historial de precios del
  -- material, que no cuelga de una propuesta, se conserva).
  DELETE FROM public.historial_costos_material WHERE propuesta_id IS NOT NULL;

  -- Rompe el ciclo facturas → entregas/CxC antes de borrar (facturas.entrega_id
  -- es NOT NULL y cuentas_por_cobrar.factura_id es NO ACTION).
  UPDATE public.cuentas_por_cobrar SET factura_id = NULL;
  DELETE FROM public.facturas;

  FOREACH v_tabla IN ARRAY orden_borrado LOOP
    EXECUTE format('DELETE FROM public.%I', v_tabla);
  END LOOP;

  DELETE FROM public.comentarios_registro
  WHERE entidad_tipo::text IN ('orden', 'cotizacion');

  -- Metadata de archivos operativos (RFQ, propuestas, órdenes, entregas, gastos,
  -- sesiones, inspecciones). Los archivos de cliente se conservan. Los objetos de
  -- Storage se pueden purgar después; aquí se limpia lo que la UI consulta.
  DELETE FROM public.archivos
  WHERE entidad::text <> 'cliente';

  -- Foto del maestro después y comparación.
  SELECT jsonb_object_agg(m.tabla, m.filas) INTO v_despues
  FROM (
    SELECT 'usuarios' AS tabla, count(*)::int AS filas FROM public.usuarios
    UNION ALL SELECT 'permisos', count(*)::int FROM public.permisos
    UNION ALL SELECT 'permisos_rol', count(*)::int FROM public.permisos_rol
    UNION ALL SELECT 'configuracion_sistema', count(*)::int FROM public.configuracion_sistema
    UNION ALL SELECT 'clientes', count(*)::int FROM public.clientes
    UNION ALL SELECT 'contactos_cliente', count(*)::int FROM public.contactos_cliente
    UNION ALL SELECT 'documentos_cliente', count(*)::int FROM public.documentos_cliente
    UNION ALL SELECT 'proveedores', count(*)::int FROM public.proveedores
    UNION ALL SELECT 'materiales', count(*)::int FROM public.materiales
    UNION ALL SELECT 'catalogo_materiales', count(*)::int FROM public.catalogo_materiales
    UNION ALL SELECT 'catalogo_espesores', count(*)::int FROM public.catalogo_espesores
    UNION ALL SELECT 'catalogo_procesos', count(*)::int FROM public.catalogo_procesos
    UNION ALL SELECT 'catalogo_canales', count(*)::int FROM public.catalogo_canales
    UNION ALL SELECT 'catalogo_motivos_pausa', count(*)::int FROM public.catalogo_motivos_pausa
    UNION ALL SELECT 'catalogo_proximas_acciones', count(*)::int FROM public.catalogo_proximas_acciones
    UNION ALL SELECT 'versiones_catalogo', count(*)::int FROM public.versiones_catalogo
    UNION ALL SELECT 'cuentas_bancarias', count(*)::int FROM public.cuentas_bancarias
    UNION ALL SELECT 'saldos_iniciales_tesoreria', count(*)::int FROM public.saldos_iniciales_tesoreria
    UNION ALL SELECT 'areas_trabajo_config', count(*)::int FROM public.areas_trabajo_config
    UNION ALL SELECT 'recursos_planeacion', count(*)::int FROM public.recursos_planeacion
    UNION ALL SELECT 'capacidades_recurso_turno', count(*)::int FROM public.capacidades_recurso_turno
    UNION ALL SELECT 'grupos_equipo', count(*)::int FROM public.grupos_equipo
    UNION ALL SELECT 'grupos_planeados', count(*)::int FROM public.grupos_planeados
    UNION ALL SELECT 'operadores_areas', count(*)::int FROM public.operadores_areas
    UNION ALL SELECT 'contador_folios', count(*)::int FROM public.contador_folios
    UNION ALL SELECT 'contadores_folio_periodico', count(*)::int FROM public.contadores_folio_periodico
    UNION ALL SELECT 'logs', count(*)::int FROM public.logs
  ) AS m;

  FOREACH v_tabla IN ARRAY maestro LOOP
    IF v_despues ->> v_tabla IS DISTINCT FROM v_antes ->> v_tabla THEN
      RAISE EXCEPTION 'maestro_alterado: % tenía % y quedó %',
        v_tabla, v_antes ->> v_tabla, v_despues ->> v_tabla;
    END IF;
  END LOOP;

  FOREACH v_tabla IN ARRAY operativas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_tabla) INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'limpieza_incompleta: % conserva % filas', v_tabla, v_n;
    END IF;
  END LOOP;

  -- Barrido total: ninguna tabla pública fuera del maestro/permitidas conserva
  -- filas (atrapa hijos que las cascadas desactivadas no habrían limpiado).
  FOR v_tabla IN
    SELECT c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname <> ALL (maestro)
      AND c.relname <> ALL (permitidas)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_tabla) INTO v_n;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'limpieza_incompleta: % conserva % filas', v_tabla, v_n;
    END IF;
  END LOOP;

  RAISE NOTICE 'Limpieza operativa correcta: maestro intacto y operación en cero.';
END
$limpieza$;
