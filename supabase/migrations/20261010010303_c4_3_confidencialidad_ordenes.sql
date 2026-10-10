-- C4.3: los roles operativos consumen proyecciones positivas. Las columnas
-- financieras de la Orden y los costos/tarifas de recursos quedan disponibles
-- exclusivamente para service_role, después de autorización en Server Actions.

REVOKE SELECT ON TABLE public.ordenes_produccion FROM authenticated;
GRANT SELECT (
  id, folio, cliente_id, cotizacion_id, estado, prioridad,
  fecha_compromiso, fecha_inicio, fecha_fin, creado_en, actualizado_en,
  motivo_cancelacion, es_interna, archivada_en, id_historico,
  referencia_externa, notas, fecha_trabajo, horas_estimadas, orden_origen_id,
  propuesta_id, propuesta_revision_id, rfq_id, folio_sii, estado_sii,
  cerrada_admin_en, cerrada_admin_por, fecha_compromiso_comercial,
  fecha_operativa
) ON TABLE public.ordenes_produccion TO authenticated;

REVOKE SELECT ON TABLE public.recursos_planeacion FROM authenticated;
GRANT SELECT (
  id, codigo, area, nombre, activo, creado_en, actualizado_en,
  cantidad_equipos, capacidad_jornada_override_horas, grupo_equipo_id
) ON TABLE public.recursos_planeacion TO authenticated;

REVOKE SELECT ON TABLE public.sesiones_trabajo FROM authenticated;
GRANT SELECT (
  id, orden_id, partida_id, programacion_id, operador_id, corrida_id,
  fecha_inicio, fecha_fin, horas_brutas, horas_netas, piezas_producidas,
  motivo_pausa, motivo_pausa_codigo, motivo_pausa_nota, recurso_liberado,
  verificacion_inicio, notas, estado_sesion, creado_en, actualizado_en
) ON TABLE public.sesiones_trabajo TO authenticated;

COMMENT ON TABLE public.ordenes_produccion IS
  'Órdenes de producción. C4.3: authenticated solo recibe columnas operativas; finanzas y snapshot se leen con service_role tras autorización.';
COMMENT ON COLUMN public.recursos_planeacion.costo_hora_interno IS
  'Costo interno confidencial; C4.3 lo reserva a service_role y servicios financieros autorizados.';
COMMENT ON COLUMN public.sesiones_trabajo.costo_hora_interno IS
  'Snapshot histórico de costo confidencial; C4.3 lo reserva a service_role y servicios financieros autorizados.';
