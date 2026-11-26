import { crearLoteOperadorAccion } from '@/modulos/produccion/acciones/crear-lote-operador';
import type { SugerenciaCorrida } from '@/modulos/produccion/utilidades/agrupacion-corridas';

export interface ResultadoCrearLote {
  exito: boolean;
  mensaje: string;
}

/**
 * Único punto de creación desde el tablero y desde la ficha del ítem, para que
 * el botón muestre siempre el mismo mensaje y envíe las mismas cantidades.
 */
export async function crearLoteDesdeSugerencia(
  sugerencia: SugerenciaCorrida,
): Promise<ResultadoCrearLote> {
  const respuesta = await crearLoteOperadorAccion({
    ordenId: sugerencia.ordenId,
    procesoNombre: sugerencia.procesoNombre,
    items: sugerencia.procesos.map((proceso) => ({
      partidaId: proceso.partidaId,
      cantidad: proceso.pendientePiezas,
    })),
  });
  if (!respuesta.exito) {
    return { exito: false, mensaje: respuesta.error ?? 'No se pudo crear el lote' };
  }
  return {
    exito: true,
    mensaje: `Lote ${respuesta.datos?.codigo ?? ''} creado con ${sugerencia.procesos.length} ítems.`,
  };
}
