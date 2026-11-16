/** Etiquetas legibles de los estados que se muestran en las fichas de producción. */

const ESTADOS_ORDEN: Record<string, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

/** Traduce el enum de la orden (`en_proceso`) a texto para la UI. */
export function etiquetaEstadoOrden(estado: string): string {
  return ESTADOS_ORDEN[estado] ?? estado;
}

const ESTADOS_PLANEACION: Record<string, string> = {
  programada: 'Programada',
  en_preparacion: 'En preparación',
  en_proceso: 'En proceso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

/** Traduce el enum de planeación (`en_preparacion`) a texto para la UI. */
export function etiquetaEstadoPlaneacion(estado: string): string {
  return ESTADOS_PLANEACION[estado] ?? estado;
}
