'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { cambiarPeriodoDashboardAccion as ejecutarCambioPeriodoDashboard } from '@/modulos/dashboard/acciones/obtener-metricas-inicio';
import type { DashboardConsolidado } from '@/modulos/dashboard/tipos/indice';

/** Reevalúa el dashboard al cambiar el intervalo, manteniendo el contrato único de la acción. */
export async function cambiarPeriodoDashboardAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DashboardConsolidado>> {
  return ejecutarCambioPeriodoDashboard(entrada);
}

/** Nombre corto para la ruta de cambio de periodo. */
export const cambiarPeriodoDashboard = cambiarPeriodoDashboardAccion;
