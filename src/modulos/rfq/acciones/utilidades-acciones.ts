import { normalizarValidacionRfq, resumirFaltantes } from '../utilidades/estados';

/**
 * Traduce el código de error estable de las RPC de RFQ a un mensaje público.
 * Para `rfq_no_listo` extrae el detalle JSON con los faltantes por sección.
 */
export function mensajeErrorRfq(codigo: string, detalles?: string | null): string {
  if (codigo.includes('sin_permiso_rfq')) return 'No tienes permiso para esta acción';
  if (codigo.includes('rfq_desactualizado')) return 'El RFQ cambió; recarga antes de reintentar';
  if (codigo.includes('item_desactualizado')) return 'El ítem cambió; recarga antes de reintentar';
  if (codigo.includes('rfq_transicion_invalida')) return 'La acción no es válida para el estado actual';
  if (codigo.includes('motivo_requerido')) return 'El motivo es obligatorio (mínimo 3 caracteres)';
  if (codigo.includes('proxima_accion_requerida')) return 'Indica la próxima acción para este cambio de estado';
  if (codigo.includes('proxima_accion_invalida')) return 'La próxima acción elegida no está vigente';
  if (codigo.includes('proxima_accion_detalle_requerido')) return 'Describe la próxima acción "Otro"';
  if (codigo.includes('proxima_accion_fecha_invalida')) return 'La fecha de la próxima acción no puede estar en el pasado';
  if (codigo.includes('proxima_accion_responsable_invalido')) return 'Elige un responsable activo para la próxima acción';
  if (codigo.includes('rfq_no_listo')) return resumenNoListo(detalles);
  if (codigo.includes('item_con_documentos')) {
    return 'El ítem tiene documentos vinculados; no se puede cancelar';
  }
  if (codigo.includes('espesor_requerido')) return 'El material elegido exige un espesor';
  if (codigo.includes('espesor_invalido')) return 'El espesor no pertenece al material elegido';
  if (codigo.includes('espesor_sin_material')) return 'Selecciona un material antes del espesor';
  if (codigo.includes('material_inactivo')) return 'El material está inactivo';
  if (codigo.includes('material_invalido')) return 'El material no existe en el catálogo';
  if (codigo.includes('proceso_invalido')) return 'Hay un proceso inactivo o inexistente en la selección';
  if (codigo.includes('items_agotados')) return 'El RFQ alcanzó el máximo de 99 ítems';
  if (codigo.includes('item_cancelado')) return 'El ítem está cancelado';
  if (codigo.includes('rfq_congelado')) {
    return 'El RFQ quedó congelado al crear la Propuesta Rev A; los cambios van en una nueva revisión';
  }
  if (codigo.includes('rfq_no_editable')) return 'El RFQ ya no admite cambios en su estado actual';
  if (codigo.includes('canal_otro_requiere_detalle')) return 'Escribe el detalle del canal Otro';
  if (codigo.includes('canal_rfq_inactivo')) return 'El canal seleccionado ya no está activo';
  if (codigo.includes('canal_rfq_no_catalogado')) return 'Selecciona un canal vigente del catálogo';
  if (codigo.includes('actualizado_en_requerido')) return 'Falta el token de actualización; recarga la pantalla';
  if (codigo.includes('item_inexistente')) return 'El ítem no existe';
  if (codigo.includes('rfq_inexistente')) return 'El RFQ no existe';
  return 'No se pudo completar la operación';
}

function resumenNoListo(detalles?: string | null): string {
  const base = 'Faltan requisitos para marcar el RFQ como listo';
  if (!detalles) return base;
  try {
    const validacion = normalizarValidacionRfq(JSON.parse(detalles));
    const faltantes = resumirFaltantes(validacion);
    return faltantes.length > 0 ? `${base}: ${faltantes.join(' · ')}` : base;
  } catch {
    return base;
  }
}
