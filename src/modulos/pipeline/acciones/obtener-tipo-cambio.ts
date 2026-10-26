'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerTipoCambioVigenteAccion } from '@/modulos/configuracion/acciones/obtener-tipo-cambio-vigente';

/**
 * Tipo de cambio USD→MXN vigente, para mostrar el equivalente en MXN de las
 * cotizaciones en USD — RFQ-11. Se conserva esta ruta por compatibilidad; el
 * dueño del dato es Configuración.
 */
export async function obtenerTipoCambioAccion(): Promise<RespuestaAccion<{ tipoCambioUsd: number }>> {
  return obtenerTipoCambioVigenteAccion();
}
