// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: ({ entidadId, titulo }: { entidadId: string; titulo: string }) =>
    createElement('div', { 'data-testid': 'hilo-comentarios', 'data-entidad-id': entidadId }, titulo),
}));
vi.mock('@/modulos/ordenes/componentes/documento-orden-boton', () => ({
  DocumentoOrdenBoton: ({ folio }: { folio: string }) =>
    createElement('button', { type: 'button' }, `Documento ${folio}`),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));
vi.mock('@/modulos/ordenes/componentes/reactivar-orden-dialog', () => ({ ReactivarOrdenDialog: () => null }));
vi.mock('@/modulos/ordenes/componentes/repetir-orden-dialog', () => ({ RepetirOrdenDialog: () => null }));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
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

  it('abre y cambia el hilo de comentarios por una accion explicita de cada fila', async () => {
    render(createElement(TablaOrdenes, { ordenes: ORDENES }));

    const primera = screen.getByTestId('fila-orden-O-1026_01');
    fireEvent.click(within(primera).getByRole('button', { name: 'Comentarios' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('hilo-comentarios').getAttribute('data-entidad-id')).toBe(ORDENES[0].id);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('tab', { name: 'Archivo' }));
    const segunda = screen.getByTestId('fila-orden-O-1026_02');
    fireEvent.click(within(segunda).getByRole('button', { name: 'Comentarios' }));
    expect(screen.getByTestId('hilo-comentarios').getAttribute('data-entidad-id')).toBe(ORDENES[1].id);
  });

  it('abre el comentario enlazado, limpia filtros y muestra la bandeja correspondiente', async () => {
    render(createElement(TablaOrdenes, {
      ordenes: ORDENES,
      ordenInicialId: ORDENES[1].id,
    }));

    await waitFor(() => expect(limpiarFiltrosMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('hilo-comentarios').getAttribute('data-entidad-id')).toBe(ORDENES[1].id);
    expect(screen.getByTestId('fila-orden-O-1026_02')).toBeTruthy();
  });

  it('muestra el documento solo con permiso financiero', () => {
    render(createElement(TablaOrdenes, { ordenes: [ORDENES[0]], puedeVerFinanzas: true }));
    expect(screen.getByRole('button', { name: 'Documento O-1026_01' })).toBeTruthy();
  });
});
