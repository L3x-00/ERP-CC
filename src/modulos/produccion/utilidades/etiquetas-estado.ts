/** Etiquetas legibles de los estados que se muestran en las fichas de producción. */

import { etiquetaEstado } from '@/compartido/utilidades/estados';

/** Traduce el enum de la orden (`en_proceso`) a texto para la UI. */
export function etiquetaEstadoOrden(estado: string): string {
  return etiquetaEstado(estado);
}

/** Traduce el enum de planeación (`en_preparacion`) a texto para la UI. */
export function etiquetaEstadoPlaneacion(estado: string): string {
  return etiquetaEstado(estado);
}
