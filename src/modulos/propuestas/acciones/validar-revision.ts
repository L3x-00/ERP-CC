'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaValidarRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoValidarRevision = {
  revisionId: string;
  estado: EstadoPropuesta;
};

/**
 * SII-B4.4/4.9: valida la revisión DRAFT (→ READY_TO_SEND). Se bloquea con
 * `requiere_revision_pendiente` cuando faltan confirmaciones o ítems completos.
 */
export async function validarRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoValidarRevision>> {
  const analisis = esquemaValidarRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_validar',
      rpc: 'validar_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn }),
      },
      accion: 'validar_revision',
      detalles: { revisionId: datos.revisionId },
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
