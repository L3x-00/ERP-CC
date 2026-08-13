// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';

const {
  activarPreparacionMock,
  obtenerCalendarioMock,
  programarMock,
  reprogramarMock,
} = vi.hoisted(() => ({
  activarPreparacionMock: vi.fn(),
  obtenerCalendarioMock: vi.fn(),
  programarMock: vi.fn(),
  reprogramarMock: vi.fn(),
}));

const { refrescarRutaMock } = vi.hoisted(() => ({ refrescarRutaMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refrescarRutaMock }),
}));

vi.mock('@/modulos/planeacion/acciones/indice', () => ({
  activarModoPreparacionAccion: (...args: unknown[]) => activarPreparacionMock(...args),
  obtenerCalendarioPlaneacionAccion: (...args: unknown[]) => obtenerCalendarioMock(...args),
  programarPartidaRecursoAccion: (...args: unknown[]) => programarMock(...args),
  reprogramarPartidaRecursoAccion: (...args: unknown[]) => reprogramarMock(...args),
}));
vi.mock('@/modulos/planeacion/componentes/sincronizador-planeacion-realtime', () => ({
  SincronizadorPlaneacionRealtime: () => null,
}));

import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import { OperacionPlaneacion } from '@/modulos/planeacion/componentes/operacion-planeacion';

afterEach(() => cleanup());

const DATOS: DatosCalendarioPlaneacion = {
  recursos: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      codigo: 'CNC-01',
      nombre: 'CNC principal',
      area: 'taller',
      activo: true,
      creadoEn: '2026-09-01T12:00:00.000Z',
      actualizadoEn: '2026-09-01T12:00:00.000Z',
    },
  ],
  cargas: [
    {
      recursoId: '11111111-1111-4111-8111-111111111111',
      area: 'taller',
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasCapacidad: 8,
      horasProgramadas: 4,
      horasDisponibles: 4,
      porcentajeOcupacion: 50,
      sobrecargado: false,
    },
  ],
  programaciones: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      ordenId: '33333333-3333-4333-8333-333333333333',
      partidaId: '44444444-4444-4444-8444-444444444444',
      recursoId: '11111111-1111-4111-8111-111111111111',
      secuencia: 1,
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasEstimadas: 4,
      ordenPrioridad: 2,
      estadoPlaneacion: 'programada',
      creadoEn: '2026-09-01T12:00:00.000Z',
      actualizadoEn: '2026-09-01T12:00:00+00:00',
    },
  ],
};

function crearWrapper(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

function renderizarOperacion(cliente: QueryClient): void {
  render(
    createElement(OperacionPlaneacion, {
      datosIniciales: DATOS,
      rangoInicial: { fechaInicio: '2026-09-15', fechaFin: '2026-09-21' },
      partidasProgramables: [
        {
          ordenId: '33333333-3333-4333-8333-333333333333',
          partidaId: '55555555-5555-4555-8555-555555555555',
          etiqueta: 'OP-000001 · PIEZA-E2E',
        },
      ],
    }),
    { wrapper: crearWrapper(cliente) },
  );
}

describe('operación de Planeación en cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usarTiendaPlaneacion.setState({
      rango: null,
      area: null,
      recursoId: null,
      turnos: [],
      estados: [],
      programacionSeleccionadaId: null,
    });
    obtenerCalendarioMock.mockResolvedValue({ exito: true, datos: DATOS });
    programarMock.mockResolvedValue({ exito: true, datos: { id: 'nueva' } });
    reprogramarMock.mockResolvedValue({ exito: true, datos: { id: DATOS.programaciones[0].id } });
    activarPreparacionMock.mockResolvedValue({ exito: true, datos: { id: DATOS.programaciones[0].id } });
  });

  it('rechaza prioridad cero antes de invocar la acción de reprogramación', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.change(screen.getByLabelText('Prioridad'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('guardar-asignacion-planeacion'));

    expect(await screen.findByText('La prioridad debe ser un entero mayor a 0')).toBeTruthy();
    expect(reprogramarMock).not.toHaveBeenCalled();
  });

  it('reprograma con la marca Postgres de compare-and-set e invalida la caché', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const invalidarSpy = vi.spyOn(cliente, 'invalidateQueries');
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.change(screen.getByLabelText('Fecha programada'), { target: { value: '2026-09-16' } });
    fireEvent.click(screen.getByTestId('guardar-asignacion-planeacion'));

    await waitFor(() => expect(reprogramarMock).toHaveBeenCalledTimes(1));
    expect(reprogramarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        programacionId: DATOS.programaciones[0].id,
        actualizadoEnEsperado: '2026-09-01T12:00:00+00:00',
        fechaProgramada: '2026-09-16',
      }),
    );
    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['planeacion', 'calendario'] });
  });

  it('activa preparación solo desde una programación seleccionada', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    expect(screen.queryByTestId('activar-preparacion-planeacion')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.click(await screen.findByTestId('activar-preparacion-planeacion'));

    await waitFor(() => expect(activarPreparacionMock).toHaveBeenCalledTimes(1));
    expect(activarPreparacionMock).toHaveBeenCalledWith({
      programacionId: DATOS.programaciones[0].id,
      actualizadoEnEsperado: '2026-09-01T12:00:00+00:00',
    });
  });
});
