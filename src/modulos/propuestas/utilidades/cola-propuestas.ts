import { etiquetaProximaAccion } from '@/modulos/pipeline/utilidades/proxima-accion';
import { CODIGO_ACCION_OTRO } from '@/modulos/propuestas/utilidades/indice';

/**
 * La revisión más reciente es la de letra mayor (A..Z). PostgREST no garantiza el
 * orden de los hijos embebidos, así que no se puede confiar en la posición.
 */
export function elegirUltimaRevision<T extends { letra: string }>(
  revisiones: readonly T[],
): T | null {
  return revisiones.reduce<T | null>(
    (ultima, actual) => (ultima === null || actual.letra > ultima.letra ? actual : ultima),
    null,
  );
}

/**
 * El histórico de acciones es append-only: la vigente es la última registrada, no
 * la de fecha más cercana (una acción vieja con fecha pasada seguiría marcando la
 * propuesta como vencida aunque ya se registró un seguimiento posterior).
 */
export function elegirProximaAccion<T extends { creado_en: string }>(
  acciones: readonly T[],
): T | null {
  return acciones.reduce<T | null>(
    (vigente, actual) =>
      vigente === null || Date.parse(actual.creado_en) > Date.parse(vigente.creado_en)
        ? actual
        : vigente,
    null,
  );
}

/** Texto legible de la acción: para «Otro» es lo que escribió el usuario. */
export function textoProximaAccion(codigo: string, textoOtro: string | null): string {
  if (codigo === CODIGO_ACCION_OTRO) {
    const detalle = textoOtro?.trim();
    if (detalle) return detalle;
  }
  return etiquetaProximaAccion(codigo);
}
