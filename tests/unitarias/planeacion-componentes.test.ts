// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesglosePartidaPlaneacion } from '@/modulos/planeacion/tipos/indice';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';

const {
  activarPreparacionMock,
  obtenerCalendarioMock,
  programarMock,
  proponerHuecoMock,
  reprogramarMock,
} = vi.hoisted(() => ({
  activarPreparacionMock: vi.fn(),
  obtenerCalendarioMock: vi.fn(),
  programarMock: vi.fn(),
  proponerHuecoMock: vi.fn(),
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
  proponerHuecoReprogramacionAccion: (...args: unknown[]) => proponerHuecoMock(...args),
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
    {
      recursoId: '11111111-1111-4111-8111-111111111111',
      area: 'taller',
      fechaProgramada: '2026-09-16',
      turno: 'matutino',
      horasCapacidad: 8,
      horasProgramadas: 8,
      horasDisponibles: 0,
      porcentajeOcupacion: 100,
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

const DESGLOSE: DesglosePartidaPlaneacion = {
  partidaId: '44444444-4444-4444-8444-444444444444',
  ordenId: '33333333-3333-4333-8333-333333333333',
  folio: 'OP-000001',
  codigoPieza: 'PIEZA-E2E',
  descripcion: 'Partida temporal',
  areaCodigo: null,
  areaNombre: null,
  procesos: [],
  esExterno: false,
  proveedorExterno: null,
  maquinaAsignada: null,
  materialNombre: null,
  cantidadSolicitada: 2,
  cantidadProducida: 1,
  cantidadScrap: 0,
  unidadMedida: 'pieza',
  tiempoEstimadoMinutos: 0,
  operadorAsignadoId: null,
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
      desglosePartidas: [DESGLOSE],
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
    proponerHuecoMock.mockResolvedValue({
      exito: true,
      datos: {
        fecha: '2026-09-21',
        turno: 'matutino',
        horasCapacidad: 8,
        horasProgramadas: 0,
        horasDisponibles: 8,
        holguraHoras: 8,
      },
    });
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

  it('muestra el desglose de la partida con "Por definir" y el resumen antes de guardar', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));

    const desglose = await screen.findByTestId('desglose-partida-planeacion');
    expect(desglose.textContent).toContain('OP-000001 · PIEZA-E2E');
    expect(desglose.textContent).toContain('Por definir');
    expect(desglose.textContent).toContain('1/2 pieza');

    const resumen = screen.getByTestId('resumen-programacion-planeacion');
    expect(resumen.textContent).toContain('Reprogramar en CNC-01');
    expect(resumen.textContent).toContain('2026-09-15');
    expect(resumen.textContent).toContain('Capacidad tras guardar');
  });

  it('bloquea la previsualización por capacidad y propone el siguiente día hábil', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.change(screen.getByLabelText('Fecha programada'), { target: { value: '2026-09-16' } });

    expect(await screen.findByTestId('aviso-capacidad-insuficiente')).toBeTruthy();
    fireEvent.click(screen.getByTestId('buscar-hueco-planeacion'));

    await waitFor(() => expect(proponerHuecoMock).toHaveBeenCalledTimes(1));
    expect(proponerHuecoMock).toHaveBeenCalledWith({
      recursoId: DATOS.programaciones[0].recursoId,
      turno: 'matutino',
      horasEstimadas: 4,
      desdeFecha: '2026-09-16',
    });

    const sugerencia = await screen.findByTestId('hueco-sugerido-planeacion');
    expect(sugerencia.textContent).toContain('2026-09-21');
    fireEvent.click(screen.getByTestId('usar-hueco-sugerido-planeacion'));
    expect((screen.getByLabelText('Fecha programada') as HTMLInputElement).value).toBe('2026-09-21');
  });

  it('el arrastre abre confirmación con resumen y reprograma solo al confirmar', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const tarjeta = screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`);
    const columna = screen.getByTestId('columna-2026-09-16');
    fireEvent.dragStart(tarjeta, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    fireEvent.drop(columna, {
      dataTransfer: { getData: () => DATOS.programaciones[0].id },
    });

    const dialogo = await screen.findByTestId('dialogo-reprogramacion-planeacion');
    expect(dialogo.textContent).toContain('Reprogramar por arrastre');
    expect(dialogo.textContent).toContain('OP-000001 · PIEZA-E2E');
    expect(reprogramarMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirmar-reprogramacion-planeacion'));
    await waitFor(() =>
      expect(reprogramarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          programacionId: DATOS.programaciones[0].id,
          fechaProgramada: '2026-09-16',
        }),
      ),
    );
  });
});
