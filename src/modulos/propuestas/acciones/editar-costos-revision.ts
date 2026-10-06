'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaEditarCostosRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerNumero,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoEditarCostosRevision = {
  revisionId: string;
  categorias: number;
  costoTotal: number;
};

/**
 * SII-B4.5: reemplaza el costeo interno DRAFT por categoría. Guardar el costeo
 * confirma los montos y limpia `requiere_revision_costeo`.
 */
export async function editarCostosRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEditarCostosRevision>> {
  const analisis = esquemaEditarCostosRevision.safeParse(entrada);
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
      rpc: 'editar_costos_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn, costos }),
      },
      accion: 'editar_costos_revision',
      detalles: { revisionId: datos.revisionId, categorias: costos.length },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  return {
    exito: true,
    datos: {
      revisionId: datos.revisionId,
      categorias: leerNumero(respuesta.datos, 'categorias') ?? 0,
      costoTotal: leerNumero(respuesta.datos, 'costoTotal') ?? 0,
    },
  };
}
