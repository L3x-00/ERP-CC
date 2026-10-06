import {
  type EstadoCorrida,
  type ResultadoInspeccion,
  type TipoInspeccion,
} from '@/modulos/produccion/tipos/corridas';

/** Etiqueta legible por estado de corrida. */
export const ETIQUETAS_ESTADO_CORRIDA: Record<EstadoCorrida, string> = {
  PLANIFICADA: 'Planificada',
  EN_PROCESO: 'En proceso',
  PAUSADA: 'Pausada',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

/** Etiqueta legible por tipo de inspección. */
export const ETIQUETAS_TIPO_INSPECCION: Record<TipoInspeccion, string> = {
  PRIMERA_PIEZA: 'Primera pieza',
  REFERENCIA_LOTE: 'Referencia de lote',
  CIERRE: 'Cierre',
};

/** Etiqueta legible por resultado de inspección. */
export const ETIQUETAS_RESULTADO_INSPECCION: Record<ResultadoInspeccion, string> = {
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

const ESTADOS_TERMINALES: readonly EstadoCorrida[] = ['COMPLETADA', 'CANCELADA'];

/** true si la corrida ya no admite trabajo de piso. */
export function esEstadoCorridaTerminal(estado: EstadoCorrida): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/**
 * Formatea el código de corrida `<PREFIJO><NN>` con dos dígitos mínimos y sin
 * truncar a partir de 100 (misma regla que `privado.corrida_siguiente_codigo`).
 */
export function formatearCodigoCorrida(prefijo: string, consecutivo: number): string {
  const numero = Math.max(1, Math.trunc(consecutivo));
  return `${prefijo}${numero < 10 ? `0${numero}` : String(numero)}`;
}

/**
 * Siguiente consecutivo de corrida para un prefijo dentro de una lista de
 * códigos existentes (parsing tolerante a códigos de otros prefijos).
 */
export function siguienteConsecutivoCorrida(codigos: readonly string[], prefijo: string): number {
  let maximo = 0;
  for (const codigo of codigos) {
    const coincidencia = new RegExp(`^${prefijo}([0-9]+)$`).exec(codigo);
    if (!coincidencia) continue;
    const numero = Number(coincidencia[1]);
    if (Number.isFinite(numero) && numero > maximo) maximo = numero;
  }
  return maximo + 1;
}

/** ¿El checklist de inicio trae las seis claves con la forma esperada? */
export function verificacionInicioCompleta(valor: unknown): boolean {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const checklist = valor as Record<string, unknown>;
  return checklist.material === true
    && checklist.espesor === true
    && checklist.cantidad === true
    && checklist.archivo === true
    && checklist.proceso_equipo === true
    && typeof checklist.observaciones === 'string';
}

/**
 * Referencias de lote exigidas/sugeridas según §6.3: 1, 3 y 5 para lotes ≥5 y
 * cada `intervalo` (10/20) para lotes grandes. Devuelve la lista ordenada.
 */
export function referenciasLotePermitidas(total: number, intervalo: number | null): number[] {
  const referencias = new Set<number>();
  if (total >= 5) {
    referencias.add(1);
    referencias.add(3);
    referencias.add(5);
  }
  if (intervalo !== null && intervalo > 0) {
    for (let referencia = intervalo; referencia <= total; referencia += intervalo) {
      referencias.add(referencia);
    }
  }
  return [...referencias].sort((a, b) => a - b);
}

/** ¿La referencia es válida para el tamaño de lote y el intervalo del proceso? */
export function esReferenciaLoteValida(
  total: number,
  intervalo: number | null,
  referencia: number | null,
): boolean {
  if (referencia === null || referencia <= 0) return false;
  const permitidas = referenciasLotePermitidas(total, intervalo);
  if (permitidas.length === 0) return true;
  return permitidas.includes(referencia);
}
