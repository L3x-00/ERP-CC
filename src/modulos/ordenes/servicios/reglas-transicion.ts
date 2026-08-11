import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';

/** Reglas puras de transición de estado para Órdenes de Producción — Sub-fase 5.2. */

/**
 * Destinos permitidos por estado de origen. `completada` y `cancelada` son terminales:
 * quedan con lista vacía en vez de omitirse para que el Record cubra todo `EstadoOrden`
 * y un estado nuevo rompa la compilación en vez de caer en un lookup indefinido.
 */
export const TRANSICIONES_ORDEN_VALIDAS: Readonly<
  Record<EstadoOrden, readonly EstadoOrden[]>
> = {
  borrador: ['programada', 'cancelada'],
  programada: ['en_proceso', 'cancelada'],
  en_proceso: ['pausada', 'completada', 'cancelada'],
  pausada: ['en_proceso', 'cancelada'],
  completada: [],
  cancelada: [],
} as const;

export function esTransicionOrdenValida(desde: EstadoOrden, hacia: EstadoOrden): boolean {
  if (desde === hacia) {
    return false;
  }

  return TRANSICIONES_ORDEN_VALIDAS[desde].includes(hacia);
}

/**
 * Depende solo del destino: el motivo se exige por el hecho de cancelar, sin importar
 * desde qué estado se pide. La validez de la transición se decide aparte.
 */
export function requiereMotivoCancelacion(desde: EstadoOrden, hacia: EstadoOrden): boolean {
  return desde !== hacia && hacia === 'cancelada';
}
