// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

const { empujarMock, liberarMock } = vi.hoisted(() => ({
  empujarMock: vi.fn(),
  liberarMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarMock, refresh: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: liberarMock }));

import { AccionesTarjetaOrden } from '@/modulos/planeacion/componentes/acciones-tarjeta-orden';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8141';

function programacion(estadoSii: EstadoSiiOrden): ProgramacionArea {
  return {
    id: '00000000-0000-4000-8000-0000000c8142',
    ordenId: ID_ORDEN,
    partidaId: '00000000-0000-4000-8000-0000000c8143',
    recursoId: '00000000-0000-4000-8000-0000000c8144',
    secuencia: 1,
    fechaProgramada: '2099-12-30',
    turno: 'matutino',
    horasEstimadas: 2,
    ordenPrioridad: 0,
    estadoPlaneacion: 'programada',
    creadoEn: '2026-10-10T01:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    metaProcesoId: null,
    ordenFolio: 'OP-008141',
    ordenEstadoSii: estadoSii,
    ordenActualizadoEn: '2026-10-10T01:00:00.000Z',
  };
}

// Un llamador antiguo todavía podría pasar `puedeAdministrar`; la tarjeta ya no lo usa.
const TarjetaConPermisoHeredado = AccionesTarjetaOrden as unknown as ComponentType<Record<string, unknown>>;

function montar(estadoSii: EstadoSiiOrden) {
  return render(createElement(TarjetaConPermisoHeredado, {
    programacion: programacion(estadoSii),
    puedeAdministrar: true,
    onRefrescar: vi.fn(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  liberarMock.mockResolvedValue({ exito: true });
});

afterEach(() => cleanup());

describe('tarjeta de Planeación C8.1 · sin Reactivar', () => {
  it.each<EstadoSiiOrden>([
    'CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION', 'PRODUCCION_COMPLETADA', 'CERRADA', 'CANCELADA',
  ])('en %s no ofrece Reactivar, aun si un llamador antiguo concede puedeAdministrar', (estado) => {
    montar(estado);

    expect(screen.queryByTestId(`accion-reactivar-${ID_ORDEN}`)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en PRODUCCION_COMPLETADA conserva Bandeja, Entregar e Imprimir', () => {
    montar('PRODUCCION_COMPLETADA');

    expect(screen.getByTestId(`accion-bandeja-${ID_ORDEN}`)).toBeTruthy();
    expect(screen.getByTestId(`accion-entregar-${ID_ORDEN}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`accion-imprimir-${ID_ORDEN}`));
    expect(empujarMock).toHaveBeenCalledWith(`/ordenes/${ID_ORDEN}`);
  });

  it('Bandeja conserva el enlace /ordenes?ordenId= (la página lo redirige a la ficha)', () => {
    montar('EN_PRODUCCION');

    fireEvent.click(screen.getByTestId(`accion-bandeja-${ID_ORDEN}`));
    expect(empujarMock).toHaveBeenCalledWith(`/ordenes?ordenId=${ID_ORDEN}`);
  });

  it('Liberar sigue disponible solo en PLANIFICADA', async () => {
    montar('PLANIFICADA');

    fireEvent.click(screen.getByTestId(`accion-liberar-${ID_ORDEN}`));
    expect(liberarMock).toHaveBeenCalledWith({
      ordenId: ID_ORDEN,
      actualizadoEn: '2026-10-10T01:00:00.000Z',
    });

    cleanup();
    montar('LISTA');
    expect(screen.queryByTestId(`accion-liberar-${ID_ORDEN}`)).toBeNull();
  });
});
