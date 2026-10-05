'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Acción retirada (SII-B2.3): el borrado duro de contactos ya no se usa.
 *
 * Se conserva bloqueada para que ningún llamador antiguo elimine historial por
 * accidente; la UI opera con `desactivar-contacto-cliente` (baja lógica) y
 * `reactivar-contacto-cliente`.
 */
export async function eliminarContactoClienteAccion(): Promise<RespuestaAccion> {
  return {
    exito: false,
    error: 'La baja de contactos es lógica: usa desactivar para conservar el historial',
  };
}
