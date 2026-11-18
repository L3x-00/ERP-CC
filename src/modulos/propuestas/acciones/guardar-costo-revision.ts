'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaGuardarCostoRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

import { comoJson, ejecutarRpcPropuesta, leerNumero, leerTexto } from './utilidades-acciones';

export type ResultadoGuardarCostoRevision = {
  revisionId: string;
  itemId: string | null;
  costoTotal: number;
};

/** Alta o edición del costeo interno de un ítem en una revisión DRAFT. */
export async function guardarCostoRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoGuardarCostoRevision>> {
  const analisis = esquemaGuardarCostoRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;
  const costos = datos.costos.map((costo) => ({
    categoria: costo.categoria,
    monto: costo.monto,
    ...(costo.nota !== undefined ? { nota: costo.nota } : {}),
  }));

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_editar_costo',
      rpc: 'guardar_costo_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_item_id: datos.itemId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn, costos }),
      },
      accion: 'guardar_costo_revision',
      detalles: {
        revisionId: datos.revisionId,
        itemId: datos.itemId,
        categorias: costos.length,
      },
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
