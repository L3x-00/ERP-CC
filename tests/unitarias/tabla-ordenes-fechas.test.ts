// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/estado/uso-tienda-ordenes', () => ({
  usarTiendaOrdenes: (selector: (estado: Record<string, unknown>) => unknown) => selector({
    filtroMaquina: null,
    filtrosEstado: [],
    establecerFiltroMaquina: vi.fn(),
    alternarFiltroEstado: vi.fn(),
    limpiarFiltros: vi.fn(),
  }),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));

import { TablaOrdenes } from '@/modulos/ordenes/componentes/tabla-ordenes';

function orden(folio: string, extra: Partial<OrdenTabla>): OrdenTabla {
  return {
    id: `00000000-0000-4000-8000-${folio.replace(/\D/g, '').padStart(12, '0')}`,
    folio: `OP-${folio}`,
    folioSii: `O-${folio}`,
    folioCotizacionCnc: null,
    estado: 'programada',
    estadoSii: 'PLANIFICADA',
    prioridad: 'normal',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    partidas: [],
    ...extra,
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('cola de Órdenes · ambas fechas con la promesa original por delante (O-06 A)', () => {
  it('la columna Compromiso muestra el compromiso comercial, no el espejo operativo', () => {
    render(createElement(TablaOrdenes, {
      ordenes: [orden('0401', {
        fechaCompromisoComercial: '2099-11-15',
        fechaOperativa: '2099-12-31T18:00:00.000Z',
      })],
    }));

    const compromiso = screen.getByTestId('compromiso-orden-O-0401');
    // El primer elemento es la promesa; la fecha operativa, si difiere, va debajo (otra prueba).
    expect(compromiso.firstElementChild?.textContent).toBe('15 de noviembre de 2099');
  });

  it('debajo muestra la fecha operativa cuando difiere de la promesa', () => {
    render(createElement(TablaOrdenes, {
      ordenes: [orden('0402', {
        fechaCompromisoComercial: '2099-11-15',
        fechaOperativa: '2099-12-31T18:00:00.000Z',
      })],
    }));

    const operativa = screen.getByTestId('operativa-orden-O-0402');
    expect(operativa.textContent).toContain('Operativa');
    expect(operativa.textContent).toContain('2099');
  });

  it('no repite la fecha operativa si coincide con la promesa', () => {
    render(createElement(TablaOrdenes, {
      ordenes: [orden('0403', {
        fechaCompromisoComercial: '2099-12-31',
        fechaOperativa: '2099-12-31T18:00:00.000Z',
      })],
    }));

    expect(screen.queryByTestId('operativa-orden-O-0403')).toBeNull();
  });

  it('sin compromiso comercial (interna o anterior al flujo SII) muestra la fecha que tenga y nada más', () => {
    render(createElement(TablaOrdenes, {
      ordenes: [orden('0404', { fechaCompromisoComercial: null })],
    }));

    expect(screen.getByTestId('compromiso-orden-O-0404').textContent).toContain('2099');
    expect(screen.queryByTestId('operativa-orden-O-0404')).toBeNull();
  });

  it('el semáforo de vencimiento sigue la promesa original, no la fecha operativa reprogramada', () => {
    render(createElement(TablaOrdenes, {
      ordenes: [orden('0405', {
        fechaCompromisoComercial: '2000-01-05',
        fechaOperativa: '2099-12-31T18:00:00.000Z',
      })],
    }));

    // Vencida en la promesa aunque Planeación la haya movido a 2099: debe verse como vencida.
    const compromiso = screen.getByTestId('compromiso-orden-O-0405');
    expect(compromiso.querySelector('[title^="Compromiso vencido"]')).not.toBeNull();
  });
});
