'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * SII-B3 ola 2: el cambio de etapa fue retirado de la UI. La etapa de
 * `pipeline` es una columna histórica (grandfathering ADR-09) y el estado del
 * RFQ se gobierna con acciones de negocio (`cambiarEstadoRfqAccion`:
 * marcar listo, poner en espera, cerrar, cancelar).
 *
 * La acción se conserva solo para no romper importadores antiguos y responde
 * con un error de negocio claro.
 */
export async function actualizarEtapaAccion(
  _entrada: unknown,
): Promise<RespuestaAccion<{ folioCnc?: string | null }>> {
  void _entrada;
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  return {
    exito: false,
    error:
      'El cambio de etapa fue reemplazado por las acciones de estado del RFQ ' +
      '(Marcar listo, Poner en espera, Cerrar, Cancelar)',
  };
}
