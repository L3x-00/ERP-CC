'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerTipoCambioVigente } from '@/modulos/configuracion/servicios/configuracion-servicio';

/**
 * Tipo de cambio USD→MXN vigente para cualquier usuario autenticado.
 *
 * Es un escalar global de solo lectura: lo consumen el cotizador y los
 * formularios que capturan montos en USD para prellenar el TC del día.
 */
export async function obtenerTipoCambioVigenteAccion(): Promise<
  RespuestaAccion<{ tipoCambioUsd: number }>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  try {
    const tipoCambioUsd = await obtenerTipoCambioVigente();
    return { exito: true, datos: { tipoCambioUsd } };
  } catch (error) {
    console.error('[CONFIGURACION] Error al consultar el tipo de cambio:', error);
    return { exito: false, error: 'No se pudo obtener el tipo de cambio' };
  }
}
