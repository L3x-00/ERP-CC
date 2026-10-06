/**
 * Traduce los errores tipados de las RPC de propuestas a mensajes legibles.
 *
 * Los códigos son estables (los emite `20261007110002_sii_b4_propuestas_acciones.sql`)
 * y las Server Actions nunca exponen el texto crudo de Postgres.
 */

/** Extrae la lista de faltantes del DETAIL JSON de `requiere_revision_pendiente`. */
function extraerFaltantes(detalle: string | undefined): string[] {
  if (!detalle) return [];
  try {
    const analizado: unknown = JSON.parse(detalle);
    if (analizado !== null && typeof analizado === 'object' && 'faltantes' in analizado) {
      const faltantes = (analizado as { faltantes: unknown }).faltantes;
      if (Array.isArray(faltantes)) {
        return faltantes.filter((valor): valor is string => typeof valor === 'string');
      }
    }
  } catch {
    // DETAIL no JSON: se ignora y se devuelve el mensaje genérico.
  }
  return [];
}

export function traducirErrorPropuesta(mensaje: string, detalle?: string): string {
  if (mensaje.includes('sin_permiso_propuesta')) {
    return 'Sin permiso para realizar esta acción sobre la propuesta';
  }
  if (mensaje.includes('rfq_no_apto_para_propuesta')) {
    return 'El RFQ debe estar LISTO para propuesta para crear la propuesta';
  }
  if (mensaje.includes('rfq_sin_cliente')) {
    return 'El RFQ no tiene un cliente válido ligado';
  }
  if (mensaje.includes('rfq_inexistente')) {
    return 'El RFQ ya no existe';
  }
  if (mensaje.includes('limite_revisiones_alcanzado')) {
    return 'Se alcanzó la letra Z: no se pueden crear más revisiones';
  }
  if (mensaje.includes('motivo_requerido')) {
    return 'El motivo es obligatorio (mínimo 3 caracteres)';
  }
  if (mensaje.includes('requiere_revision_pendiente')) {
    const faltantes = extraerFaltantes(detalle);
    return faltantes.length > 0
      ? `Antes de validar: ${faltantes.join(', ')}`
      : 'La revisión requiere confirmar ruteo/costeo antes de validar';
  }
  if (mensaje.includes('revision_congelada')) {
    return 'La revisión está congelada; crea una nueva revisión para cambiar el contenido';
  }
  if (mensaje.includes('revision_no_editable')) {
    return 'Solo se pueden editar revisiones en borrador';
  }
  if (mensaje.includes('revision_estado_invalido')) {
    return 'Ese cambio de estado no está permitido para la revisión';
  }
  if (mensaje.includes('revision_desactualizada')) {
    return 'La revisión cambió desde que la cargaste; actualízala e inténtalo de nuevo';
  }
  if (mensaje.includes('revision_no_aceptada')) {
    return 'La revisión indicada no es la aceptada de la propuesta';
  }
  if (mensaje.includes('revision_inexistente')) {
    return 'La revisión ya no existe';
  }
  if (mensaje.includes('item_desactualizado')) {
    return 'El ítem cambió desde que lo cargaste; actualízalo e inténtalo de nuevo';
  }
  if (mensaje.includes('item_inexistente')) {
    return 'El ítem ya no existe';
  }
  if (mensaje.includes('proceso_invalido') || mensaje.includes('ruteo_proceso_requerido')) {
    return 'El ruteo requiere un proceso válido y activo';
  }
  if (mensaje.includes('grupo_equipo_invalido') || mensaje.includes('grupo_planeado_invalido')) {
    return 'El grupo de equipo o planeado seleccionado no existe';
  }
  if (mensaje.includes('ruteo_horas_invalidas')) {
    return 'Las horas de setup/run no son válidas';
  }
  if (mensaje.includes('costo_categoria_invalida') || mensaje.includes('costo_monto_invalido')) {
    return 'El costo por categoría no es válido';
  }
  if (mensaje.includes('proxima_accion_invalida')) {
    return 'La próxima acción seleccionada no está vigente en el catálogo';
  }
  if (mensaje.includes('texto_otro_requerido')) {
    return 'La acción "Otro" requiere un detalle (3 a 300 caracteres)';
  }
  if (mensaje.includes('fecha_proxima_accion_requerida')) {
    return 'La próxima acción requiere fecha';
  }
  if (mensaje.includes('responsable_invalido')) {
    return 'El responsable de la próxima acción no es válido';
  }
  if (
    mensaje.includes('item_cantidad_invalida') ||
    mensaje.includes('item_precio_invalido') ||
    mensaje.includes('item_descripcion_invalida') ||
    mensaje.includes('material_invalido') ||
    mensaje.includes('espesor') ||
    mensaje.includes('propuesta_datos_invalidos')
  ) {
    return 'Los datos del ítem no son válidos';
  }
  if (mensaje.includes('actualizado_en_requerido')) {
    return 'Falta la versión del registro; vuelve a cargar la propuesta';
  }
  console.error('[PROPUESTAS] Error no traducido:', mensaje);
  return 'No se pudo completar la acción sobre la propuesta';
}
