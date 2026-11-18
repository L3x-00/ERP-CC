'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaEliminarCostoRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

import { comoJson, ejecutarRpcPropuesta, leerNumero, leerTexto } from './utilidades-acciones';

export type ResultadoEliminarCostoRevision = {
  revisionId: string;
  itemId: string | null;
  costoTotal: number;
};

/** Borrado del costeo interno de un ítem en una revisión DRAFT. */
export async function eliminarCostoRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEliminarCostoRevision>> {
  const analisis = esquemaEliminarCostoRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_editar_costo',
      rpc: 'eliminar_costo_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_item_id: datos.itemId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn }),
      },
      accion: 'eliminar_costo_revision',
      detalles: { revisionId: datos.revisionId, itemId: datos.itemId },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  return {
    exito: true,
    datos: {
      revisionId: datos.revisionId,
      itemId: leerTexto(respuesta.datos, 'itemId') ?? datos.itemId,
      costoTotal: leerNumero(respuesta.datos, 'costoTotal') ?? 0,
    },
  };
}
