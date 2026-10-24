import { describe, expect, it } from 'vitest';

import {
  numerosPagina,
  paginar,
} from '@/compartido/utilidades/paginar';
import { TAMANO_PAGINA_RFQ } from '@/modulos/pipeline/servicios/paginar';

const RFQS = Array.from({ length: 27 }, (_, indice) => `RFQ-${indice + 1}`);

describe('paginación de la cola RFQ', () => {
  it('usa páginas de 15 RFQ', () => {
    expect(TAMANO_PAGINA_RFQ).toBe(15);

    const primera = paginar(RFQS, 1, TAMANO_PAGINA_RFQ);
    expect(primera.visibles).toHaveLength(15);
    expect(primera.visibles[0]).toBe('RFQ-1');
    expect(primera.visibles[14]).toBe('RFQ-15');
    expect(primera).toMatchObject({
      pagina: 1,
      totalPaginas: 2,
      desde: 1,
      hasta: 15,
      total: 27,
    });

    const segunda = paginar(RFQS, 2, TAMANO_PAGINA_RFQ);
    expect(segunda.visibles).toHaveLength(12);
    expect(segunda.visibles[0]).toBe('RFQ-16');
    expect(segunda.visibles[11]).toBe('RFQ-27');
    expect(segunda).toMatchObject({ pagina: 2, desde: 16, hasta: 27 });
  });

  it('acota la página al rango disponible cuando cambian los filtros', () => {
    expect(paginar(RFQS, 99, TAMANO_PAGINA_RFQ).pagina).toBe(2);
    expect(paginar(RFQS, 0, TAMANO_PAGINA_RFQ).pagina).toBe(1);
    expect(paginar(RFQS, -4, TAMANO_PAGINA_RFQ).pagina).toBe(1);
  });

  it('con una lista vacía informa 0–0 sin romper la navegación', () => {
    const vacia = paginar([], 1, TAMANO_PAGINA_RFQ);
    expect(vacia.visibles).toEqual([]);
    expect(vacia.totalPaginas).toBe(1);
    expect(vacia.desde).toBe(0);
    expect(vacia.hasta).toBe(0);
  });

  it('no muta la lista original', () => {
    const copia = [...RFQS];
    paginar(RFQS, 2, TAMANO_PAGINA_RFQ);
    expect(RFQS).toEqual(copia);
  });
});

describe('números de página visibles', () => {
  it('muestra todas las páginas cuando caben en el control', () => {
    expect(numerosPagina(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosPagina(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('resume con elipsis los extremos en listas largas', () => {
    expect(numerosPagina(1, 10)).toEqual([1, 2, 3, 4, 'elipsis', 10]);
    expect(numerosPagina(5, 10)).toEqual([1, 'elipsis', 4, 5, 6, 'elipsis', 10]);
    expect(numerosPagina(10, 10)).toEqual([1, 'elipsis', 7, 8, 9, 10]);
  });

  it('no repite números de página', () => {
    const paginas = numerosPagina(4, 9).filter((valor): valor is number => valor !== 'elipsis');
    expect(new Set(paginas).size).toBe(paginas.length);
  });
});
