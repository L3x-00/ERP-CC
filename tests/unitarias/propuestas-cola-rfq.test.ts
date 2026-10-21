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
        {
          id: 'p-3',
          folioCnc: 'CNC-0003',
          estado: 'SENT',
          rfqId: 'r-3',
          folioRfq: 'OP-0003',
          empresa: 'Beta',
          clienteRazonSocial: 'Beta',
          responsableId: 'u-1',
          ultimaRevision: {
            letra: 'B',
            folioRevision: 'CNC-0003-B',
            estado: 'SENT',
            requiereRevisionRuteo: false,
            requiereRevisionCosteo: false,
          },
          proximaAccion: {
            codigo: 'WAIT_CUSTOMER_RESPONSE',
            texto: 'Esperar respuesta del cliente',
            fecha: '2026-10-19',
          },
          vencida: true,
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

describe('ColaPropuestas — revisión y próxima acción legibles (obs. cliente 2026-10-20)', () => {
  it('muestra la revisión más reciente y la próxima acción en español con fecha de calendario', () => {
    render(createElement(ColaPropuestas));

    const fila = screen.getByRole('row', { name: /CNC-0003/ });
    expect(fila.textContent).toContain('B · Enviada');
    expect(fila.textContent).toContain('Esperar respuesta del cliente · 19 de octubre de 2026');
    expect(fila.textContent).not.toContain('WAIT_CUSTOMER_RESPONSE');
  });
});
