'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { esquemaCrearPropuesta } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  ejecutarRpcPropuesta,
  leerBooleano,
  leerNumero,
  leerTexto,
} from '@/modulos/propuestas/acciones/utilidades-acciones';

export type ResultadoCrearPropuesta = {
  propuestaId: string;
  propuestaFolio: string;
  revisionId: string;
  revisionFolio: string;
  letra: string;
  items: number;
  yaExistia: boolean;
};

/**
 * SII-B4.2: crea la propuesta + revisión A DRAFT desde un RFQ LISTO (el RFQ
 * pasa a CONVERTED en la misma transacción). Idempotente: si ya existe una
 * revisión DRAFT, devuelve la existente.
 */
export async function crearPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCrearPropuesta>> {
  const analisis = esquemaCrearPropuesta.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const respuesta = await ejecutarRpcPropuesta(
    {
      permiso: 'propuesta_editar_articulo',
      rpc: 'crear_propuesta',
      args: { p_rfq_id: analisis.data.rfqId },
      accion: 'crear_propuesta',
    },
    analisis.data.rfqId,
  );
  if (!respuesta.exito) return respuesta;

  const propuestaId = leerTexto(respuesta.datos, 'propuestaId');
  const propuestaFolio = leerTexto(respuesta.datos, 'propuestaFolio');
  const revisionId = leerTexto(respuesta.datos, 'revisionId');
  const revisionFolio = leerTexto(respuesta.datos, 'revisionFolio');
  const letra = leerTexto(respuesta.datos, 'letra');
  if (!propuestaId || !revisionId || !propuestaFolio || !revisionFolio || !letra) {
    return { exito: false, error: 'Respuesta inválida del servidor' };
  }

  return {
    exito: true,
    datos: {
      propuestaId,
      propuestaFolio,
      revisionId,
      revisionFolio,
      letra,
      items: leerNumero(respuesta.datos, 'items') ?? 0,
      yaExistia: leerBooleano(respuesta.datos, 'yaExistia') ?? false,
    },
  };
}
