'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerTipoCambioVigente } from '@/modulos/configuracion/servicios/configuracion-servicio';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Tipo de cambio USD→MXN vigente, para mostrar el equivalente en MXN de las
 * cotizaciones en USD — RFQ-11. Es un escalar de configuración global; se
 * expone solo a usuarios autenticados. Lectura, no mutación.
 */
export async function obtenerTipoCambioAccion(): Promise<RespuestaAccion<{ tipoCambioUsd: number }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  try {
    const tipoCambioUsd = await obtenerTipoCambioVigente();
    return { exito: true, datos: { tipoCambioUsd } };
  } catch {
    return { exito: false, error: 'No se pudo obtener el tipo de cambio' };
  }
}
