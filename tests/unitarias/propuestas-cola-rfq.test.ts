// @vitest-environment jsdom
// Obs. cliente 2026-10-12 (3): la cola de propuestas muestra la columna RFQ con
// el folio del RFQ de origen y un enlace a su ficha.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/modulos/propuestas/hooks/usar-propuesta', () => ({
  usarPropuestas: () => ({
    isLoading: false,
    isError: false,
    data: {
      exito: true,
      datos: [
        {
          id: 'p-1',
          folioCnc: 'CNC-0001',
          estado: 'SENT',
          rfqId: 'r-1',
          folioRfq: 'OP-0001',
          empresa: 'ACME',
          clienteRazonSocial: 'ACME',
          responsableId: 'u-1',
          ultimaRevision: null,
          proximaAccion: null,
          vencida: false,
          actualizadoEn: '2026-10-12T00:00:00+00:00',
        },
        {
          id: 'p-2',
          folioCnc: 'CNC-0002',
          estado: 'DRAFT',
          rfqId: 'r-2',
          folioRfq: null,
          empresa: null,
          clienteRazonSocial: null,
          responsableId: 'u-1',
          ultimaRevision: null,
          proximaAccion: null,
          vencida: false,
          actualizadoEn: '2026-10-12T00:00:00+00:00',
        },
      ],
    },
  }),
}));

import { ColaPropuestas } from '@/modulos/propuestas/componentes/cola-propuestas';

afterEach(() => {
  cleanup();
});

describe('ColaPropuestas — columna RFQ (obs. cliente 3)', () => {
  it('coloca el encabezado RFQ entre Folio y Cliente', () => {
    render(createElement(ColaPropuestas));

    const encabezados = screen.getAllByRole('columnheader').map((celda) => celda.textContent);
    expect(encabezados[0]).toBe('Folio');
    expect(encabezados[1]).toBe('RFQ');
    expect(encabezados[2]).toBe('Cliente');
  });

  it('enlaza el folio del RFQ de origen y muestra — cuando falta', () => {
    render(createElement(ColaPropuestas));

    const enlace = screen.getByRole('link', { name: 'OP-0001' });
    expect(enlace.getAttribute('href')).toBe('/rfq?rfq=r-1');

    const filaSinRfq = screen.getByRole('row', { name: /CNC-0002/ });
    expect(filaSinRfq.textContent).toContain('—');
  });
});
