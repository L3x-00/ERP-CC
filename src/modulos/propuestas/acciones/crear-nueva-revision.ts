'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaCrearNuevaRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerBooleano,
  leerNumero,
  leerTexto,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoCrearNuevaRevision = {
  propuestaId: string;
  revisionId: string;
  letra: string;
  folioRevision: string;
  items: number;
  requiereRevisionRuteo: boolean;
  requiereRevisionCosteo: boolean;
  yaExistia: boolean;
};

/**
 * SII-B4.3: crea la revisión siguiente (B..Z) copiando el snapshot completo de
 * la revisión origen. Exige motivo (≥3 caracteres). Idempotente si ya hay un
 * borrador en la propuesta.
 */
export async function crearNuevaRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCrearNuevaRevision>> {
  const analisis = esquemaCrearNuevaRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_crear_revision',
      rpc: 'crear_nueva_revision',
      args: {
        p_revision_origen: analisis.data.revisionOrigen,
        p_motivo: analisis.data.motivo,
      },
      accion: 'crear_nueva_revision',
      detalles: { motivo: analisis.data.motivo },
    },
    analisis.data.revisionOrigen,
  );
  if (!respuesta.exito) return respuesta;

  const propuestaId = leerTexto(respuesta.datos, 'propuestaId');
  const revisionId = leerTexto(respuesta.datos, 'revisionId');
  const letra = leerTexto(respuesta.datos, 'letra');
  const folioRevision = leerTexto(respuesta.datos, 'folioRevision');
  if (!propuestaId || !revisionId || !letra || !folioRevision) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return {
    exito: true,
    datos: {
      propuestaId,
      revisionId,
      letra,
      folioRevision,
      items: leerNumero(respuesta.datos, 'items') ?? 0,
      requiereRevisionRuteo: leerBooleano(respuesta.datos, 'requiereRevisionRuteo') ?? false,
      requiereRevisionCosteo: leerBooleano(respuesta.datos, 'requiereRevisionCosteo') ?? false,
      yaExistia: leerBooleano(respuesta.datos, 'yaExistia') ?? false,
    },
  };
}
