'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { esquemaRegistrarSeguimientoPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerTexto,
  comoJson,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoSeguimientoPropuesta = {
  revisionId: string;
  accionId: string | null;
  estado: EstadoPropuesta;
};

/**
 * SII-B4.6: registra la próxima acción del catálogo sobre una revisión DRAFT,
 * SENT o FOLLOW_UP. En SENT la revisión pasa a FOLLOW_UP.
 */
export async function registrarSeguimientoPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoSeguimientoPropuesta>> {
  const analisis = esquemaRegistrarSeguimientoPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_seguimiento',
      rpc: 'registrar_seguimiento_propuesta',
      args: {
        p_revision_id: datos.revisionId,
        p_datos: comoJson({
          actualizado_en: datos.actualizadoEn,
          codigo: datos.codigo,
          ...(datos.textoOtro !== undefined ? { texto_otro: datos.textoOtro } : {}),
          fecha: datos.fecha,
          ...(datos.responsableId !== undefined ? { responsable_id: datos.responsableId } : {}),
          ...(datos.canal !== undefined ? { canal: datos.canal } : {}),
          ...(datos.nota !== undefined ? { nota: datos.nota } : {}),
        }),
      },
      accion: 'registrar_seguimiento_propuesta',
      detalles: { revisionId: datos.revisionId, codigo: datos.codigo, fecha: datos.fecha },
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
      accionId: leerTexto(respuesta.datos, 'accionId'),
      estado,
    },
  };
}
