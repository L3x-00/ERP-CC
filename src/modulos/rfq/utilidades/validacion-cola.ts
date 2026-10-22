import type { RespuestaAccion } from '@/compartido/tipos/indice';

import type { EstadoRfq, ValidacionRfqListo } from '../tipos/indice';
import { MAXIMO_RFQ_VALIDACION_LOTE } from '../tipos/indice';

export type ValidacionesPorRfq = Record<string, ValidacionRfqListo>;

/**
 * RFQ de la cola cuya captura puede declararse completa: solo los
 * `INCOMPLETE` (el resto conserva su estado comercial), sin repetidos y sin
 * truncar. Va ordenado para que la llave de la consulta no cambie al reordenar
 * filas.
 */
export function idsRfqParaValidarEnCola(
  oportunidades: readonly { id: string; estadoRfq: EstadoRfq }[],
): string[] {
  const ids = new Set<string>();
  for (const oportunidad of oportunidades) {
    if (oportunidad.estadoRfq === 'INCOMPLETE') ids.add(oportunidad.id);
  }
  return [...ids].sort();
}

/** Parte la lista en lotes de a lo más `tamano` ids (por defecto, el tope por llamada). */
export function dividirIdsEnLotes(
  ids: readonly string[],
  tamano: number = MAXIMO_RFQ_VALIDACION_LOTE,
): string[][] {
  const lotes: string[][] = [];
  for (let inicio = 0; inicio < ids.length; inicio += tamano) {
    lotes.push(ids.slice(inicio, inicio + tamano));
  }
  return lotes;
}

/**
 * Valida TODOS los ids pedidos, un lote acotado por llamada y en serie (nunca
 * una solicitud por fila). Un lote que falla o lanza no invalida a los demás: sus
 * ids simplemente quedan sin validación confirmada y la cola no los declara
 * completos. Si todos los lotes fallan lanza, para que la consulta quede en error.
 */
export async function validarRfqsEnCola(
  ids: readonly string[],
  validarLote: (entrada: { rfqIds: string[] }) => Promise<RespuestaAccion<ValidacionesPorRfq>>,
): Promise<ValidacionesPorRfq> {
  const lotes = dividirIdsEnLotes(ids);
  const validaciones: ValidacionesPorRfq = {};
  let fallidos = 0;

  for (const rfqIds of lotes) {
    try {
      const respuesta = await validarLote({ rfqIds });
      if (respuesta.exito) {
        Object.assign(validaciones, respuesta.datos ?? {});
      } else {
        fallidos += 1;
      }
    } catch {
      fallidos += 1;
    }
  }

  if (lotes.length > 0 && fallidos === lotes.length) {
    throw new Error('No se pudo validar el avance de los RFQ');
  }
  return validaciones;
}

/**
 * Validación que la fila puede usar para el indicador. Mientras la consulta se
 * actualiza, falló o no devolvió ese RFQ no hay validación confirmada (la fila
 * conserva «Incompleto»), igual que la ficha.
 */
export function validacionConfirmadaDeFila(
  validaciones: Readonly<ValidacionesPorRfq> | null,
  rfqId: string,
): ValidacionRfqListo | null {
  return validaciones?.[rfqId] ?? null;
}
