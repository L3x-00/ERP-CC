'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaEnviarRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoEnviarRevision = {
  revisionId: string;
  estado: EstadoPropuesta;
  canal: string;
  destino: string;
};

/**
 * SII-B4.7: envía la revisión lista (PDF vigente + canal + destino + próxima
 * acción) y la congela atómicamente en SENT.
 */
export async function enviarRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEnviarRevision>> {
  const analisis = esquemaEnviarRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_enviar',
      rpc: 'enviar_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_canal: datos.canal,
        p_destino: datos.destino,
      },
      accion: 'enviar_revision',
      detalles: { revisionId: datos.revisionId, canal: datos.canal },
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
      canal: leerTexto(respuesta.datos, 'canal') ?? datos.canal,
      destino: leerTexto(respuesta.datos, 'destino') ?? datos.destino,
    },
  };
}
