/**
 * Reglas de procesos que se complementan en una misma pieza. Antes de un
 * proceso que depende de un corte previo, la cotización debe declararlo: la
 * lista se normaliza agregando el proceso previo, nunca se rechaza la captura.
 */

const PREVIOS: Readonly<Record<string, readonly string[]>> = {
  doblez: ['corte'],
  doblado: ['corte'],
  pulido: ['corte'],
  soldadura: ['corte'],
  soldado: ['corte'],
  maquinado: ['corte'],
  cnc: ['corte'],
};

const ETIQUETA_CORTE = 'Corte';

/** Clave tolerante a mayúsculas y acentos para comparar procesos. */
export function claveProceso(proceso: string): string {
  return proceso
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esCorte(clave: string): boolean {
  return clave === 'corte' || clave === 'cortar';
}

export interface ProcesosNormalizados {
  procesos: string[];
  /** Nombres agregados automáticamente para conservar la secuencia. */
  agregados: string[];
}

/**
 * Agrega los procesos previos que falten (p. ej. `doblez` requiere `Corte`)
 * conservando el orden y las etiquetas capturadas por el usuario.
 */
export function normalizarProcesosConPrevios(
  entrada: readonly string[],
): ProcesosNormalizados {
  const limpios = entrada.map((proceso) => proceso.trim()).filter((proceso) => proceso !== '');
  const claves = new Set(limpios.map(claveProceso));
  const agregados: string[] = [];
  for (const proceso of limpios) {
    for (const previo of PREVIOS[claveProceso(proceso)] ?? []) {
      const yaPresente = previo === 'corte'
        ? [...claves].some(esCorte)
        : claves.has(previo);
      if (!yaPresente && !agregados.includes(ETIQUETA_CORTE)) {
        agregados.push(ETIQUETA_CORTE);
      }
    }
  }
  return {
    procesos: agregados.length === 0 ? limpios : [...agregados, ...limpios],
    agregados,
  };
}
