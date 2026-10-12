/** Tamaño de lote para consultas `.in(ids)`: evita URLs largas y el 414 del gateway. */
export const TAMANO_LOTE_CONSULTAS = 100;

/** Divide una lista de ids en lotes acotados; conserva el orden original. */
export function dividirEnLotes<T>(
  elementos: readonly T[],
  tamano: number = TAMANO_LOTE_CONSULTAS,
): T[][] {
  const lotes: T[][] = [];
  for (let desde = 0; desde < elementos.length; desde += tamano) {
    lotes.push(elementos.slice(desde, desde + tamano));
  }
  return lotes;
}
