'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaMotivoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
} from '@/modulos/propuestas/acciones/utilidades-acciones';
import type { ResultadoEstadoPropuesta } from '@/modulos/propuestas/acciones/rechazar-propuesta';

/** SII-B4.10: cierra la propuesta (motivo obligatorio, historia conservada). */
export async function cerrarPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEstadoPropuesta>> {
  const analisis = esquemaMotivoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_cerrar',
      rpc: 'cerrar_propuesta',
      args: {
        p_revision_id: datos.revisionId,
        p_motivo: datos.motivo,
        p_actualizado_en: datos.actualizadoEn,
      },
      accion: 'cerrar_propuesta',
      detalles: { revisionId: datos.revisionId, motivo: datos.motivo },
    },
    datos.revisionId,
  );
  if (!respuesta.exito) return respuesta;

  const estado = leerTexto(respuesta.datos, 'estado') as EstadoPropuesta | null;
  if (!estado) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return { exito: true, datos: { revisionId: datos.revisionId, estado } };
}
