// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

const { limpiarFiltrosMock, refrescarMock } = vi.hoisted(() => ({
  limpiarFiltrosMock: vi.fn(),
  refrescarMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refrescarMock }),
}));
vi.mock('@/estado/uso-tienda-ordenes', () => ({
  usarTiendaOrdenes: (selector: (estado: Record<string, unknown>) => unknown) => selector({
    filtroMaquina: null,
    filtrosEstado: [],
    establecerFiltroMaquina: vi.fn(),
    alternarFiltroEstado: vi.fn(),
    limpiarFiltros: limpiarFiltrosMock,
  }),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));

import { TablaOrdenes } from '@/modulos/ordenes/componentes/tabla-ordenes';

const ORDENES: OrdenTabla[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    folio: 'OP-001001',
    folioSii: 'O-1026_01',
    folioCotizacionCnc: null,
    estado: 'borrador',
    estadoSii: 'CONFIRMADA',
    prioridad: 'normal',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    partidas: [],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    folio: 'OP-001002',
    folioSii: 'O-1026_02',
    folioCotizacionCnc: null,
    estado: 'completada',
    estadoSii: 'CERRADA',
    prioridad: 'alta',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T02:00:00.000Z',
    archivadaEn: '2026-10-10T03:00:00.000Z',
    esInterna: false,
    idHistorico: null,
    partidas: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
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

describe('TablaOrdenes C4.3', () => {
  it('retira mutaciones comerciales y oculta acciones sin permiso', () => {
    render(createElement(TablaOrdenes, { ordenes: ORDENES }));

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Procesos' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Seleccionar|Quitar selecci/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Documento O-1026_01/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  // C8.1: el hilo de comentarios vive en la ficha (pestaña Comentarios); la fila solo abre.
  it('ya no ofrece Comentarios en ninguna fila ni monta diálogos', () => {
    render(createElement(TablaOrdenes, { ordenes: ORDENES }));

    const primera = screen.getByTestId('fila-orden-O-1026_01');
    expect(within(primera).queryByRole('button', { name: 'Comentarios' })).toBeNull();
    expect(within(primera).getByTestId('abrir-ficha-O-1026_01')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Archivo' }));
    const segunda = screen.getByTestId('fila-orden-O-1026_02');
    expect(within(segunda).queryByRole('button', { name: 'Comentarios' })).toBeNull();
    expect(within(segunda).getByTestId('abrir-ficha-O-1026_02')).toBeTruthy();
  });

  it('no ofrece el documento en la fila: se imprime desde la pestaña Documento de la ficha', () => {
    render(createElement(TablaOrdenes, { ordenes: [ORDENES[0]] }));
    expect(screen.queryByRole('button', { name: 'Documento O-1026_01' })).toBeNull();
  });
});
