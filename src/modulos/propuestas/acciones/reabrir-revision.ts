'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaReabrirRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoReabrirRevision = {
  revisionId: string;
  estado: EstadoPropuesta;
};

/**
 * Obs. cliente 2026-10-12: el botón «Editar» de una revisión LISTA PARA ENVIAR
 * la devuelve a borrador (con motivo y evento). El PDF vigente se invalida en
 * la RPC, así que tras editar hay que revalidar y regenerar el PDF antes de
 * enviar. Una propuesta ya aceptada no se puede reabrir.
 */
export async function reabrirRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoReabrirRevision>> {
  const analisis = esquemaReabrirRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_validar',
      rpc: 'reabrir_revision',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({ actualizado_en: datos.actualizadoEn, motivo: datos.motivo }),
      },
      accion: 'reabrir_revision',
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
