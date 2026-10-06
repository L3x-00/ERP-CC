'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaAceptarRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoAceptarRevision = {
  revisionId: string;
  estado: EstadoPropuesta;
  acceptedRevisionId: string | null;
};

/**
 * SII-B4.10: acepta la revisión exacta (SENT/FOLLOW_UP) y fija
 * `accepted_revision_id`; puede ser una revisión anterior a la última.
 */
export async function aceptarRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoAceptarRevision>> {
  const analisis = esquemaAceptarRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_aceptar',
      rpc: 'aceptar_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({
          actualizado_en: datos.actualizadoEn,
          ...(datos.canal !== undefined ? { canal: datos.canal } : {}),
          ...(datos.destino !== undefined ? { destino: datos.destino } : {}),
        }),
      },
      accion: 'aceptar_revision',
      detalles: { revisionId: datos.revisionId },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  const estado = leerTexto(respuesta.datos, 'estado') as EstadoPropuesta | null;
  if (!estado) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return {
    exito: true,
    datos: {
      revisionId: datos.revisionId,
      estado,
      acceptedRevisionId: leerTexto(respuesta.datos, 'acceptedRevisionId'),
    },
  };
}
