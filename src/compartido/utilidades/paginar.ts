/** Tamaño de página por defecto para listados del sistema. */
export const TAMANO_PAGINA_POR_DEFECTO = 10;

export type Pagina<T> = {
  /** Elementos de la página solicitada (ya acotada al rango válido). */
  visibles: T[];
  /** Página efectiva tras acotar entre 1 y `totalPaginas`. */
  pagina: number;
  totalPaginas: number;
  /** Posición 1-based del primer elemento visible; 0 si la lista está vacía. */
  desde: number;
  /** Posición 1-based del último elemento visible; 0 si la lista está vacía. */
  hasta: number;
  total: number;
};

/**
 * Pagina una lista en memoria sin mutarla. Si la página pedida queda fuera de
 * rango (p. ej. un filtro redujo la lista o llegó un cambio en tiempo real), se
 * acota a la última página disponible en vez de mostrar una tabla vacía.
 */
export function paginar<T>(
  elementos: readonly T[],
  paginaSolicitada: number,
  tamano: number = TAMANO_PAGINA_POR_DEFECTO,
): Pagina<T> {
  const total = elementos.length;
  const tamanoSeguro =
    Number.isFinite(tamano) && tamano > 0 ? Math.trunc(tamano) : TAMANO_PAGINA_POR_DEFECTO;
  const totalPaginas = Math.max(1, Math.ceil(total / tamanoSeguro));
  const solicitada = Number.isFinite(paginaSolicitada) ? Math.trunc(paginaSolicitada) : 1;
  const pagina = Math.min(Math.max(1, solicitada), totalPaginas);
  const inicio = (pagina - 1) * tamanoSeguro;
  const visibles = elementos.slice(inicio, inicio + tamanoSeguro);

  return {
    visibles,
    pagina,
    totalPaginas,
    desde: visibles.length === 0 ? 0 : inicio + 1,
    hasta: inicio + visibles.length,
    total,
  };
}

/**
 * Números de página visibles con elipsis para listas largas. Mantiene siempre
 * la primera, la última y el entorno de la página actual.
 */
export function numerosPagina(
  pagina: number,
  totalPaginas: number,
): (number | 'elipsis')[] {
  if (totalPaginas <= 7) {
    return Array.from({ length: totalPaginas }, (_, indice) => indice + 1);
  }

  const candidatas = new Set<number>([1, totalPaginas, pagina, pagina - 1, pagina + 1]);
  if (pagina <= 3) {
    candidatas.add(2);
    candidatas.add(3);
    candidatas.add(4);
  }
  if (pagina >= totalPaginas - 2) {
    candidatas.add(totalPaginas - 1);
    candidatas.add(totalPaginas - 2);
    candidatas.add(totalPaginas - 3);
  }

  const ordenadas = [...candidatas]
    .filter((numero) => numero >= 1 && numero <= totalPaginas)
    .sort((a, b) => a - b);

  const resultado: (number | 'elipsis')[] = [];
  let anterior = 0;
  for (const numero of ordenadas) {
    if (anterior !== 0 && numero - anterior > 1) resultado.push('elipsis');
    resultado.push(numero);
    anterior = numero;
  }
  return resultado;
}
