// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';
import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';

const { liberarMock, refrescarMock } = vi.hoisted(() => ({
  liberarMock: vi.fn(),
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
    limpiarFiltros: vi.fn(),
  }),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: liberarMock }));

import { TablaOrdenes } from '@/modulos/ordenes/componentes/tabla-ordenes';

// La cola ya no usa estos permisos (Cancelar, Cerrar, Comentarios, Documento, Adjuntos,
// Repetir y Reactivar viven en la ficha o se retiraron). Se pasan TODOS concedidos para
// demostrar que ningún permiso devuelve controles a la fila.
const PERMISOS_HEREDADOS = {
  usuarioActualId: 'u-cola',
  puedeEliminarTodos: true,
  puedeAdministrar: true,
  puedeCerrar: true,
  puedeCancelar: true,
  puedeVerFinanzas: true,
};
const TablaConPermisosHeredados = TablaOrdenes as unknown as ComponentType<Record<string, unknown>>;

function orden(
  folio: string,
  estadoSii: EstadoSiiOrden,
  extra: Partial<OrdenTabla> = {},
): OrdenTabla {
  return {
    id: `00000000-0000-4000-8000-${folio.replace(/\D/g, '').padStart(12, '0')}`,
    folio: `OP-${folio}`,
    folioSii: `O-${folio}`,
    folioCotizacionCnc: null,
    estado: 'programada',
    estadoSii,
    prioridad: 'alta',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    partidas: [
      {
        id: `p-${folio}-1`, codigoPieza: 'P1', descripcion: null, cantidadSolicitada: 10,
        cantidadProducida: 4, cantidadScrap: 1, unidadMedida: 'pza', tiempoEstimadoMinutos: 5,
        maquinaAsignada: null, metasProceso: [],
      },
      {
        id: `p-${folio}-2`, codigoPieza: 'P2', descripcion: null, cantidadSolicitada: 10,
        cantidadProducida: 6, cantidadScrap: 0, unidadMedida: 'pza', tiempoEstimadoMinutos: 5,
        maquinaAsignada: null, metasProceso: [],
      },
    ],
    ...extra,
  };
}

function montar(ordenes: OrdenTabla[], extra: Record<string, unknown> = {}) {
  return render(createElement(TablaConPermisosHeredados, {
    ordenes,
    ...PERMISOS_HEREDADOS,
    puedeLiberar: true,
    ...extra,
  }));
}

/** Nombres accesibles de todos los controles interactivos de la fila. */
function controlesDeLaFila(folio: string): string[] {
  const fila = screen.getByTestId(`fila-orden-O-${folio}`);
  return within(fila)
    .queryAllByRole('button')
    .concat(within(fila).queryAllByRole('link'))
    .map((control) => control.textContent?.trim() ?? '')
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  liberarMock.mockResolvedValue({ exito: true });
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

describe('cola de Órdenes C8.1 · columnas (R01, caracterización)', () => {
  it('conserva Folio, Estado, Prioridad, Compromiso, Partidas, Avance y Acciones', () => {
    montar([orden('0101', 'PLANIFICADA')]);

    const encabezados = screen.getAllByRole('columnheader').map((celda) => celda.textContent?.trim());
    expect(encabezados).toEqual(['Folio', 'Estado', 'Prioridad', 'Compromiso', 'Partidas', 'Avance', 'Acciones']);
  });

  it('muestra en la fila folio, estado, prioridad, partidas y avance de producción', () => {
    montar([orden('0102', 'EN_PRODUCCION')]);

    const fila = screen.getByTestId('fila-orden-O-0102');
    expect(within(fila).getByText('O-0102')).toBeTruthy();
    expect(screen.getByTestId('estado-orden-O-0102').textContent).toContain('En producción');
    expect(within(fila).getByText('Alta')).toBeTruthy();
    expect(within(fila).getByText('2')).toBeTruthy();
    expect(within(fila).getByText('10/20')).toBeTruthy();
    expect(within(fila).getByLabelText('Avance de la orden O-0102')).toBeTruthy();
  });

  it('Abrir lleva a la ficha de la orden', () => {
    const fila = orden('0103', 'CONFIRMADA');
    montar([fila]);

    const enlace = screen.getByTestId('abrir-ficha-O-0103');
    expect(enlace.textContent?.trim()).toBe('Abrir');
    expect(enlace.getAttribute('href')).toBe(`/ordenes/${fila.id}`);
  });
});

describe('cola de Órdenes C8.1 · una sola acción contextual', () => {
  const ESTADOS_SIN_LIBERAR: EstadoSiiOrden[] = [
    'CONFIRMADA', 'LISTA', 'EN_PRODUCCION', 'PRODUCCION_COMPLETADA', 'CERRADA', 'CANCELADA',
  ];

  it.each(ESTADOS_SIN_LIBERAR)('en %s la fila solo tiene Abrir, aun con todos los permisos', (estado) => {
    montar([orden('0201', estado)]);
    expect(controlesDeLaFila('0201')).toEqual(['Abrir']);
  });

  it('en PLANIFICADA con orden_liberar la fila tiene Abrir y Liberar, nada más', () => {
    montar([orden('0202', 'PLANIFICADA')]);

    expect(controlesDeLaFila('0202')).toEqual(['Abrir', 'Liberar']);
    expect(screen.getByTestId('liberar-orden-O-0202')).toBeTruthy();
  });

  it('en PLANIFICADA sin orden_liberar la fila solo tiene Abrir', () => {
    montar([orden('0203', 'PLANIFICADA')], { puedeLiberar: false });
    expect(controlesDeLaFila('0203')).toEqual(['Abrir']);
  });

  it('una orden histórica, interna o archivada tampoco recupera Adjuntos, Repetir ni Reactivar', () => {
    montar([
      orden('0204', 'PRODUCCION_COMPLETADA', { idHistorico: 'LEGACY-1' }),
      orden('0205', 'CERRADA', { esInterna: true, archivadaEn: '2026-10-10T03:00:00.000Z' }),
    ]);
    fireEvent.click(screen.getByTestId('bandeja-activas'));
    expect(controlesDeLaFila('0204')).toEqual(['Abrir']);

    fireEvent.click(screen.getByTestId('bandeja-archivo'));
    expect(controlesDeLaFila('0205')).toEqual(['Abrir']);
  });

  it('no monta diálogos ni testids retirados de la fila', () => {
    montar([orden('0206', 'PRODUCCION_COMPLETADA', { idHistorico: 'LEGACY-2' })]);

    expect(screen.queryByRole('dialog')).toBeNull();
    for (const idRetirado of [
      'cerrar-administrativa-O-0206',
      'cambiar-estado-cancelada',
      'adjuntos-orden-O-0206',
      'repetir-orden-O-0206',
      'reactivar-orden-O-0206',
    ]) {
      expect(screen.queryByTestId(idRetirado)).toBeNull();
    }
    for (const nombre of ['Comentarios', 'Cancelar', 'Cerrar administrativa', 'Adjuntos', 'Repetir', 'Reactivar']) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /Documento/ })).toBeNull();
  });
});

describe('cola de Órdenes C8.1 · Liberar (comportamiento conservado)', () => {
  it('libera con el token de versión de la orden y refresca la cola', async () => {
    const planificada = orden('0301', 'PLANIFICADA');
    montar([planificada]);

    fireEvent.click(screen.getByTestId('liberar-orden-O-0301'));

    await waitFor(() => expect(liberarMock).toHaveBeenCalledWith({
      ordenId: planificada.id,
      actualizadoEn: planificada.actualizadoEn,
    }));
    expect((await screen.findByTestId('ordenes-mensaje')).textContent).toContain('O-0301 liberada a producción');
    expect(refrescarMock).toHaveBeenCalled();
  });

  it('muestra el error de la acción sin refrescar', async () => {
    liberarMock.mockResolvedValue({ exito: false, error: 'La orden cambió. Recarga e intenta de nuevo.' });
    montar([orden('0302', 'PLANIFICADA')]);

    fireEvent.click(screen.getByTestId('liberar-orden-O-0302'));

    expect((await screen.findByTestId('ordenes-error')).textContent).toContain('La orden cambió');
    expect(refrescarMock).not.toHaveBeenCalled();
  });
});
