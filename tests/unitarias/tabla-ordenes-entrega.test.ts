// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
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

import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';
import { TablaOrdenes } from '@/modulos/ordenes/componentes/tabla-ordenes';

function construirOrden(estadoSii: OrdenTabla['estadoSii'], entregada: number): OrdenTabla {
  return {
    id: '00000000-0000-4000-8000-0000000c8403',
    folio: 'OP-008403',
    folioSii: 'O-1026_86',
    folioCotizacionCnc: null,
    estado: 'borrador',
    estadoSii,
    prioridad: 'normal',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    partidas: [
      {
        id: '00000000-0000-4000-8000-0000000c84p3',
        codigoPieza: 'P-03',
        descripcion: null,
        cantidadSolicitada: 50,
        cantidadProducida: 50,
        cantidadScrap: 0,
        cantidadEntregada: entregada,
        unidadMedida: 'pieza',
        tiempoEstimadoMinutos: 30,
        maquinaAsignada: null,
        metasProceso: [],
      },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => cleanup());

describe('cola de órdenes con dato de entrega (C8.4 R13)', () => {
  it('producción 50/50 con entrega 30/50 muestra «Entregado 30/50» y no el tono verde de terminado', () => {
    render(createElement(TablaOrdenes, { ordenes: [construirOrden('PRODUCCION_COMPLETADA', 30)] }));
    const celdaEntrega = screen.getByTestId('entrega-orden-O-1026_86');
    expect(celdaEntrega.textContent).toContain('Entregado 30/50');
    const barra = celdaEntrega
      .closest('tr')
      ?.querySelector('[role="progressbar"] > div');
    expect(barra?.className).not.toContain('bg-exito');
  });

  it('con la entrega completa (50/50, PRODUCCION_COMPLETADA) el avance sí es verde', () => {
    render(createElement(TablaOrdenes, { ordenes: [construirOrden('PRODUCCION_COMPLETADA', 50)] }));
    const barra = screen
      .getByTestId('entrega-orden-O-1026_86')
      .closest('tr')
      ?.querySelector('[role="progressbar"] > div');
    expect(barra?.className).toContain('bg-exito');
  });

  it('sin entregas (entregada 0) la celda todavía indica Entregado 0/50 en producción completada', () => {
    render(createElement(TablaOrdenes, { ordenes: [construirOrden('PRODUCCION_COMPLETADA', 0)] }));
    expect(screen.getByTestId('entrega-orden-O-1026_86').textContent).toContain('Entregado 0/50');
  });
});
