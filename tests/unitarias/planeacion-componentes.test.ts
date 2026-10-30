// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import type { DatosCalendarioPlaneacion } from '@/modulos/planeacion/servicios/indice';
import {
  PanelAsignacionPlaneacion,
  type PartidaProgramablePlaneacion,
} from '@/modulos/planeacion/componentes/panel-asignacion-planeacion';

const {
  activarPreparacionMock,
  obtenerCalendarioMock,
  obtenerDetalleMock,
  programarMock,
  proponerHuecoMock,
  reprogramarMock,
} = vi.hoisted(() => ({
  activarPreparacionMock: vi.fn(),
  obtenerCalendarioMock: vi.fn(),
  obtenerDetalleMock: vi.fn(),
  programarMock: vi.fn(),
  proponerHuecoMock: vi.fn(),
  reprogramarMock: vi.fn(),
}));

const { empujarRutaMock, refrescarRutaMock } = vi.hoisted(() => ({
  empujarRutaMock: vi.fn(),
  refrescarRutaMock: vi.fn(),
}));

const { obtenerDetalleConcluidaMock, generarNotaEntregaMock } = vi.hoisted(() => ({
  obtenerDetalleConcluidaMock: vi.fn(),
  generarNotaEntregaMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: refrescarRutaMock }),
}));

vi.mock('@/modulos/planeacion/acciones/indice', () => ({
  activarModoPreparacionAccion: (...args: unknown[]) => activarPreparacionMock(...args),
  obtenerCalendarioPlaneacionAccion: (...args: unknown[]) => obtenerCalendarioMock(...args),
  obtenerDetalleProgramacionAccion: (...args: unknown[]) => obtenerDetalleMock(...args),
  programarPartidaRecursoAccion: (...args: unknown[]) => programarMock(...args),
  proponerHuecoReprogramacionAccion: (...args: unknown[]) => proponerHuecoMock(...args),
  reprogramarPartidaRecursoAccion: (...args: unknown[]) => reprogramarMock(...args),
}));
vi.mock('@/modulos/planeacion/componentes/sincronizador-planeacion-realtime', () => ({
  SincronizadorPlaneacionRealtime: () => null,
}));
vi.mock('@/modulos/produccion/acciones/indice', () => ({
  obtenerDetalleOrdenConcluidaAccion: (...args: unknown[]) => obtenerDetalleConcluidaMock(...args),
  generarNotaEntregaAccion: (...args: unknown[]) => generarNotaEntregaMock(...args),
}));
vi.mock('@/modulos/produccion/componentes/detalle-orden-concluida', () => ({
  DetalleOrdenConcluida: () => null,
}));

import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';
import { OperacionPlaneacion } from '@/modulos/planeacion/componentes/operacion-planeacion';
import { AccionesTarjetaOrden } from '@/modulos/planeacion/componentes/acciones-tarjeta-orden';
import { PanelBolsaPlaneacion } from '@/modulos/planeacion/componentes/panel-bolsa-planeacion';
import { TarjetaProgramacionPlaneacion } from '@/modulos/planeacion/componentes/tarjeta-programacion-planeacion';
import type { CompatibilidadRecursosPlaneacion } from '@/modulos/planeacion/utilidades/compatibilidad';

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
      horasReales: 0,
      horasExceso: 0,
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
      horasReales: 0,
      horasExceso: 0,
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
      metaProcesoId: null,
    },
  ],
};

const DESGLOSE: DesglosePartidaPlaneacion = {
  partidaId: '44444444-4444-4444-8444-444444444444',
  ordenId: '33333333-3333-4333-8333-333333333333',
  folio: 'OP-000001',
  codigoPieza: 'PIEZA-E2E',
  codigoItem: 'ITM-000001',
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

const PARTIDAS_POR_DEFECTO: PartidaProgramablePlaneacion[] = [
  {
    ordenId: '33333333-3333-4333-8333-333333333333',
    partidaId: '55555555-5555-4555-8555-555555555555',
    etiqueta: 'OP-000001 · PIEZA-E2E',
    secuenciaSugerida: 1,
    operaciones: [],
  },
];

interface ExtrasRenderizadoOperacion {
  partidasTotal?: number;
  compatibilidad?: CompatibilidadRecursosPlaneacion;
  datosIniciales?: DatosCalendarioPlaneacion;
}

function renderizarOperacion(
  cliente: QueryClient,
  partidas: PartidaProgramablePlaneacion[] = PARTIDAS_POR_DEFECTO,
  extras: ExtrasRenderizadoOperacion = {},
): void {
  const { datosIniciales, ...restoExtras } = extras;
  render(
    createElement(OperacionPlaneacion, {
      datosIniciales: datosIniciales ?? DATOS,
      rangoInicial: { fechaInicio: '2026-09-15', fechaFin: '2026-09-21' },
      partidasProgramables: partidas,
      desglosePartidas: [DESGLOSE],
      ...restoExtras,
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
    obtenerDetalleMock.mockResolvedValue({
      exito: true,
      datos: {
        responsableNombre: 'Ana Planeación',
        recursoNombre: 'CNC-01 · CNC principal',
        grupoEquipoNombre: 'CNC · Centros de maquinado',
        horasEstimadas: 4,
        horasReales: 5,
        horasExceso: 1,
        recursoLiberado: false,
        historial: [{
          creadoEn: '2026-09-14T10:00:00.000Z',
          actorNombre: 'Bruno Planeación',
          motivo: 'Ajuste de turno',
          anterior: {
            recurso: 'CNC-02 · CNC respaldo',
            fechaProgramada: '2026-09-14',
            turno: 'matutino',
            horasEstimadas: 4,
            ordenPrioridad: 2,
          },
          nuevo: {
            recurso: 'CNC-01 · CNC principal',
            fechaProgramada: '2026-09-15',
            turno: 'matutino',
            horasEstimadas: 4,
            ordenPrioridad: 1,
          },
        }],
      },
    });
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
    fireEvent.change(screen.getByLabelText('Motivo de la reprogramación'), {
      target: { value: 'Cambio de capacidad' },
    });
    fireEvent.click(screen.getByTestId('guardar-asignacion-planeacion'));

    await waitFor(() => expect(reprogramarMock).toHaveBeenCalledTimes(1));
    expect(reprogramarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        programacionId: DATOS.programaciones[0].id,
        actualizadoEnEsperado: '2026-09-01T12:00:00+00:00',
        fechaProgramada: '2026-09-16',
        motivo: 'Cambio de capacidad',
      }),
    );
    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['planeacion', 'calendario'] });
    expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['planeacion', 'detalle-programacion'] });
  });

  it('carga el detalle al seleccionar y muestra responsable, grupo, horas e historial', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    expect(screen.queryByTestId('detalle-programacion-planeacion')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));

    const detalle = await screen.findByTestId('detalle-programacion-planeacion');
    await waitFor(() => expect(obtenerDetalleMock).toHaveBeenCalledWith({
      programacionId: DATOS.programaciones[0].id,
    }));
    expect(detalle.textContent).toContain('Ana Planeación');
    expect(detalle.textContent).toContain('CNC · Centros de maquinado');
    expect(detalle.textContent).toContain('5 h');
    expect(detalle.textContent).toContain('1 h');
    expect(detalle.textContent).toContain('Horas estimadas (Planeación)');
    expect(detalle.textContent).toContain('Horas reales (Producción)');
    expect(detalle.textContent).toContain('Historial de cambios');
    expect(detalle.textContent).toContain('Ajuste de turno');
    expect(detalle.textContent).toContain('Bruno Planeación');
  });

  it('el clic en el bloque abre el panel con el contexto de la operación (P05)', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    expect(screen.queryByTestId('detalle-programacion-planeacion')).toBeNull();
    fireEvent.click(screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`));

    const detalle = await screen.findByTestId('detalle-programacion-planeacion');
    await waitFor(() => expect(detalle.textContent).toContain('Ana Planeación'));
    expect(screen.getByTestId('panel-asignacion-planeacion')).toBeTruthy();
  });

  it('ofrece reintentar cuando el detalle falla', async () => {
    obtenerDetalleMock
      .mockResolvedValueOnce({ exito: false, error: 'Fallo temporal' })
      .mockResolvedValueOnce({
        exito: true,
        datos: {
          responsableNombre: 'Ana Planeación',
          recursoNombre: 'CNC-01 · CNC principal',
          grupoEquipoNombre: null,
          horasEstimadas: 4,
          horasReales: 0,
          horasExceso: 0,
          recursoLiberado: false,
          historial: [],
        },
      });
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    const contenedor = await screen.findByTestId('detalle-programacion-planeacion');
    const alerta = await within(contenedor).findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar el detalle');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Sin cambios registrados.')).toBeTruthy();
    expect(obtenerDetalleMock).toHaveBeenCalledTimes(2);
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

    fireEvent.change(screen.getByLabelText('Motivo de la reprogramación'), {
      target: { value: 'Cambio de capacidad' },
    });
    fireEvent.click(screen.getByTestId('confirmar-reprogramacion-planeacion'));
    await waitFor(() =>
      expect(reprogramarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          programacionId: DATOS.programaciones[0].id,
          fechaProgramada: '2026-09-16',
          motivo: 'Cambio de capacidad',
        }),
      ),
    );
  });

  it('abre el detalle de una orden concluida en lugar de reprogramar y bloquea el arrastre', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const programacionConcluida = {
      ...DATOS.programaciones[0],
      estadoPlaneacion: 'completada' as const,
      ordenEstado: 'completada' as const,
      ordenEstadoSii: 'PRODUCCION_COMPLETADA' as const,
    };
    obtenerDetalleConcluidaMock.mockResolvedValue({
      exito: true,
      datos: {
        orden: { folio: 'OP-000001' },
        areas: [],
        responsables: {},
        recursos: [],
        puedeEntregar: true,
      },
    });
    renderizarOperacion(cliente, PARTIDAS_POR_DEFECTO, {
      datosIniciales: { ...DATOS, programaciones: [programacionConcluida] },
    });

    const tarjeta = screen.getByTestId(`programacion-${programacionConcluida.id}`);
    expect(tarjeta.getAttribute('draggable')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByTestId('panel-detalle-orden-concluida')).toBeTruthy();
    await waitFor(() => expect(obtenerDetalleConcluidaMock).toHaveBeenCalledWith({
      ordenId: programacionConcluida.ordenId,
    }));
    expect(screen.getByTestId('panel-programar-partida').className).toContain('hidden');
    expect(screen.queryByTestId('detalle-programacion-planeacion')).toBeNull();

    fireEvent.drop(screen.getByTestId('columna-2026-09-16'), {
      dataTransfer: { getData: () => programacionConcluida.id },
    });
    expect(screen.queryByTestId('dialogo-reprogramacion-planeacion')).toBeNull();
  });

  it('programa por operación del ruteo preseleccionando la pendiente (C9.0)', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente, [
      {
        ordenId: '33333333-3333-4333-8333-333333333333',
        partidaId: '55555555-5555-4555-8555-555555555555',
        etiqueta: 'OP-000001 · PIEZA-E2E',
        secuenciaSugerida: 2,
        operaciones: [
          {
            metaProcesoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            secuencia: 1,
            nombre: 'Corte',
            programada: true,
          },
          {
            metaProcesoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            secuencia: 2,
            nombre: 'Doblez',
            programada: false,
          },
        ],
      },
    ]);

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: '55555555-5555-4555-8555-555555555555' },
    });
    const selectorOperacion = screen.getByLabelText('Operación') as HTMLSelectElement;
    expect(selectorOperacion.value).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(screen.queryByLabelText('Secuencia')).toBeNull();

    fireEvent.change(screen.getAllByLabelText('Recurso').at(-1)!, {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.change(screen.getByLabelText('Fecha programada'), {
      target: { value: '2026-09-17' },
    });
    fireEvent.change(screen.getByLabelText('Horas estimadas'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('guardar-asignacion-planeacion'));

    await waitFor(() => expect(programarMock).toHaveBeenCalledTimes(1));
    expect(programarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partidaId: '55555555-5555-4555-8555-555555555555',
        secuencia: null,
        metaProcesoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    );
  });

  it('al elegir una operación completa los datos confirmados del ruteo y el compromiso comercial', () => {
    const avisoFecha = vi.fn();
    const partida = {
      ordenId: '33333333-3333-4333-8333-333333333333',
      partidaId: '55555555-5555-4555-8555-555555555555',
      etiqueta: 'OP-000001 · PIEZA-E2E',
      secuenciaSugerida: 1,
      operaciones: [
        {
          metaProcesoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          secuencia: 1,
          nombre: 'Corte',
          programada: false,
          recursoIdSugerido: DATOS.recursos[0].id,
          fechaProgramadaSugerida: '2026-10-29',
          horasEstimadasSugeridas: 2.5,
        },
      ],
    } satisfies PartidaProgramablePlaneacion;

    render(
      createElement(PanelAsignacionPlaneacion, {
        recursos: DATOS.recursos,
        partidasProgramables: [partida],
        onCambiarFecha: avisoFecha,
        onEnviar: async () => ({ exito: true as const }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: partida.partidaId },
    });

    expect((screen.getByLabelText('Recurso') as HTMLSelectElement).value).toBe(
      DATOS.recursos[0].id,
    );
    expect((screen.getByLabelText('Fecha programada') as HTMLInputElement).value).toBe(
      '2026-10-29',
    );
    expect((screen.getByLabelText('Horas estimadas') as HTMLInputElement).value).toBe('2.5');
    expect(screen.getByTestId('sugerencias-ruteo-planeacion').textContent).toContain(
      'no reserva el recurso',
    );
    expect(avisoFecha).toHaveBeenCalledWith('2026-10-29');
  });

  it('pinta el resumen de carga semanal antes de los filtros, con ocupadas/capacidad y libre (C9.1)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const resumen = screen.getByTestId('resumen-carga-semanal');
    expect(resumen.textContent).toContain('CNC-01 · CNC principal');
    expect(resumen.textContent).toContain('4/8 h');
    expect(resumen.textContent).toContain('Libre');
    expect(screen.getByTestId('libre-CNC-01').textContent).toBe('4 h');

    const insignia = within(resumen).getByTestId('insignia-saturacion-cerca-del-limite');
    expect(insignia.getAttribute('aria-label')).toBe('Cerca del límite: 8/8 h');

    const fechaInicial = screen.getByLabelText('Fecha inicial');
    expect(resumen.compareDocumentPosition(fechaInicial) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('mientras la capacidad carga no declara «Sin turnos definidos» (C9.1)', () => {
    obtenerCalendarioMock.mockImplementation(() => new Promise(() => {}));
    usarTiendaPlaneacion.setState({
      rango: { fechaInicio: '2026-09-15', fechaFin: '2026-09-21' },
    });
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    expect(screen.getByText('Cargando capacidad…')).toBeTruthy();
    expect(screen.queryByText('Sin turnos definidos')).toBeNull();
  });

  it('las vistas y la navegación se pintan antes que los filtros del calendario (C9.1/P-02)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const navegacion = screen.getByRole('group', { name: 'Navegación del calendario' });
    const fechaInicial = screen.getByLabelText('Fecha inicial');
    expect(
      navegacion.compareDocumentPosition(fechaInicial) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('Área y Turnos viven en «Más filtros», cerrado sin filtros activos (C9.1/P-02)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const pliegue = screen.getByTestId('mas-filtros-planeacion') as HTMLDetailsElement;
    expect(pliegue.open).toBe(false);
    expect(within(pliegue).getByLabelText('Área')).toBeTruthy();
    expect(within(pliegue).getByText('Turnos')).toBeTruthy();
  });

  it('con área activa el pliegue abre (C9.1/P-02)', () => {
    usarTiendaPlaneacion.setState({ area: 'taller' });
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const pliegue = screen.getByTestId('mas-filtros-planeacion') as HTMLDetailsElement;
    expect(pliegue.open).toBe(true);
  });

  it('la opción de recurso incluye su área (C9.1/P-02)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    const selectorRecurso = screen.getAllByLabelText('Recurso')[0] as HTMLElement;
    expect(within(selectorRecurso).getByText('CNC-01 · CNC principal (Taller)')).toBeTruthy();
  });

  it('Limpiar filtros vuelve a la vista Semana (C9.1/P-02)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByTestId('vista-planeacion-mes'));
    expect(screen.getByTestId('vista-mes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByTestId('vista-semana')).toBeTruthy();
  });

  it('la tarjeta compacta muestra Ítem, procesos y horas (C9.1/P-04)', () => {
    render(
      createElement(TarjetaProgramacionPlaneacion, {
        programacion: DATOS.programaciones[0],
        desglose: DESGLOSE,
        seleccionada: false,
        compacta: true,
      }),
    );

    const tarjeta = screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`);
    expect(within(tarjeta).getByText('Ítem ITM-000001')).toBeTruthy();
    expect(within(tarjeta).getByText('Procesos: Por definir')).toBeTruthy();
    expect(tarjeta.textContent).toContain('4 h');
  });

  it('la tarjeta compacta muestra la operación programada del ruteo (P04)', () => {
    render(
      createElement(TarjetaProgramacionPlaneacion, {
        programacion: {
          ...DATOS.programaciones[0],
          secuencia: 2,
          operacionNombre: 'Corte',
        },
        desglose: DESGLOSE,
        seleccionada: false,
        compacta: true,
      }),
    );

    const tarjeta = screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`);
    expect(within(tarjeta).getByText('Operación 2 · Corte')).toBeTruthy();
  });

  it('la tarjeta declara Ítem «Por definir», procesos capturados y ya no muestra Avance (C9.1)', () => {
    render(
      createElement(TarjetaProgramacionPlaneacion, {
        programacion: DATOS.programaciones[0],
        desglose: { ...DESGLOSE, codigoItem: null, procesos: ['Corte', 'Doblez'] },
        seleccionada: false,
      }),
    );

    const tarjeta = screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`);
    const bloqueItem = within(tarjeta).getByText('Ítem').closest('div');
    expect(bloqueItem?.textContent).toContain('Por definir');
    expect(tarjeta.textContent).toContain('Corte · Doblez');
    expect(tarjeta.textContent).toContain('Tiempo estimado');
    expect(tarjeta.textContent).not.toContain('Avance');
  });

  it('la tarjeta sobrecargada muestra el semáforo «Sobrecargado» con horas (C9.1/P-03)', () => {
    const cargaSobrecargada: CargaCapacidadDiaria = {
      recursoId: '11111111-1111-4111-8111-111111111111',
      area: 'taller',
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasCapacidad: 8,
      horasProgramadas: 9,
      horasReales: 0,
      horasExceso: 1,
      horasDisponibles: 0,
      porcentajeOcupacion: 112.5,
      sobrecargado: true,
    };

    render(
      createElement(TarjetaProgramacionPlaneacion, {
        programacion: DATOS.programaciones[0],
        desglose: DESGLOSE,
        carga: cargaSobrecargada,
        recurso: DATOS.recursos[0],
        seleccionada: false,
      }),
    );

    const tarjeta = screen.getByTestId(`programacion-${DATOS.programaciones[0].id}`);
    const insignia = within(tarjeta).getByTestId('insignia-saturacion-sobrecargado');
    expect(insignia.textContent).toContain('Sobrecargado');
    expect(insignia.textContent).toContain('9/8 h');
    expect(insignia.getAttribute('aria-label')).toBe('Sobrecargado: 9/8 h');
  });

  it('el título abre el resumen rápido sin seleccionar y «Abrir orden» navega a la ficha (C9.1/P-08)', async () => {
    const seleccionarMock = vi.fn();
    const programacion = DATOS.programaciones[0];
    render(
      createElement(TarjetaProgramacionPlaneacion, {
        programacion,
        desglose: DESGLOSE,
        seleccionada: false,
        onSeleccionar: seleccionarMock,
      }),
    );

    const titulo = screen.getByTestId(`resumen-orden-${programacion.id}`);
    expect(titulo.getAttribute('draggable')).toBe('false');
    fireEvent.click(titulo);

    expect(seleccionarMock).not.toHaveBeenCalled();
    const dialogo = await screen.findByTestId('resumen-orden-planeacion');
    expect(dialogo.textContent).toContain('OP-000001');

    fireEvent.click(screen.getByTestId(`abrir-orden-${programacion.id}`));
    expect(empujarRutaMock).toHaveBeenCalledWith(`/ordenes?ordenId=${programacion.ordenId}`);
  });

  it('precarga la secuencia sugerida al elegir una partida heredada (C9.2/P06)', () => {
    render(
      createElement(PanelAsignacionPlaneacion, {
        recursos: DATOS.recursos,
        partidasProgramables: [{ ...PARTIDAS_POR_DEFECTO[0], secuenciaSugerida: 7 }],
        onEnviar: async () => ({ exito: true as const }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: PARTIDAS_POR_DEFECTO[0].partidaId },
    });

    expect((screen.getByLabelText('Secuencia') as HTMLInputElement).value).toBe('7');
  });

  it('avisa cuántas partidas quedaron fuera del tope del selector (C9.2/P06)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente, undefined, { partidasTotal: 305 });

    expect(screen.getByTestId('aviso-partidas-truncadas-planeacion').textContent).toContain(
      'Mostrando 1 de 305 partidas',
    );
  });

  it('lista primero los recursos compatibles y elegir otro grupo impide guardar (C9.2/P10/P-04)', () => {
    const recursoCompatible = { ...DATOS.recursos[0] };
    const recursoOtroGrupo = {
      ...DATOS.recursos[0],
      id: '99999999-9999-4999-8999-999999999999',
      codigo: 'DBL-01',
      nombre: 'Dobladora',
    };
    const partida = PARTIDAS_POR_DEFECTO[0];
    const compatibilidad: CompatibilidadRecursosPlaneacion = {
      grupoPorRecurso: {
        [recursoCompatible.id]: { id: 'grupo-laser', nombre: 'Láser' },
        [recursoOtroGrupo.id]: { id: 'grupo-doblez', nombre: 'Doblez' },
      },
      gruposRequeridosPorPartida: { [partida.partidaId]: ['grupo-laser'] },
      gruposRequeridosPorOperacion: {},
      nombrePorGrupo: { 'grupo-laser': 'Láser', 'grupo-doblez': 'Doblez' },
    };

    render(
      createElement(PanelAsignacionPlaneacion, {
        recursos: [recursoOtroGrupo, recursoCompatible],
        partidasProgramables: [partida],
        compatibilidad,
        onEnviar: async () => ({ exito: true as const }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: partida.partidaId },
    });

    const selector = screen.getByLabelText('Recurso') as HTMLSelectElement;
    const opciones = within(selector).getAllByRole('option');
    expect(opciones[1].textContent).toContain('CNC-01');
    expect(opciones[1].textContent).toContain('Láser');
    expect(opciones[1].textContent).not.toContain('(otro grupo)');
    expect(opciones[2].textContent).toContain('Doblez');
    expect(opciones[2].textContent).toContain('(otro grupo)');

    fireEvent.change(selector, { target: { value: recursoOtroGrupo.id } });

    // P-04 (respuesta del cliente): elegir otro grupo impide guardar además del
    // candado `recurso_incompatible` de la RPC.
    expect(screen.getByTestId('aviso-compatibilidad-planeacion').textContent).toContain(
      'Doblez',
    );
    expect(screen.getByTestId('aviso-compatibilidad-planeacion').textContent).toContain(
      'Láser',
    );
    expect(
      (screen.getByTestId('guardar-asignacion-planeacion') as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(selector, { target: { value: recursoCompatible.id } });

    expect(screen.queryByTestId('aviso-compatibilidad-planeacion')).toBeNull();
    expect(
      (screen.getByTestId('guardar-asignacion-planeacion') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('evalúa el grupo contra la operación elegida, no contra toda la partida (C11)', () => {
    const recursoLaser = { ...DATOS.recursos[0] };
    const recursoDoblez = {
      ...DATOS.recursos[0],
      id: '99999999-9999-4999-8999-999999999998',
      codigo: 'DBL-02',
      nombre: 'Dobladora',
    };
    const partida: PartidaProgramablePlaneacion = {
      ...PARTIDAS_POR_DEFECTO[0],
      operaciones: [
        {
          metaProcesoId: 'meta-laser', secuencia: 1, nombre: 'Láser fibra',
          programada: false, grupoEquipoId: 'grupo-laser',
        },
        {
          metaProcesoId: 'meta-doblez', secuencia: 2, nombre: 'Doblez',
          programada: false, grupoEquipoId: 'grupo-doblez',
        },
      ],
    };
    const compatibilidad: CompatibilidadRecursosPlaneacion = {
      grupoPorRecurso: {
        [recursoLaser.id]: { id: 'grupo-laser', nombre: 'Láser' },
        [recursoDoblez.id]: { id: 'grupo-doblez', nombre: 'Doblez' },
      },
      gruposRequeridosPorPartida: { [partida.partidaId]: ['grupo-laser', 'grupo-doblez'] },
      gruposRequeridosPorOperacion: {
        'meta-laser': ['grupo-laser'],
        'meta-doblez': ['grupo-doblez'],
      },
      nombrePorGrupo: { 'grupo-laser': 'Láser', 'grupo-doblez': 'Doblez' },
    };

    render(
      createElement(PanelAsignacionPlaneacion, {
        recursos: [recursoDoblez, recursoLaser],
        partidasProgramables: [partida],
        compatibilidad,
        onEnviar: async () => ({ exito: true as const }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: partida.partidaId },
    });

    const selector = screen.getByLabelText('Recurso') as HTMLSelectElement;
    const opcion = (codigo: string) => within(selector).getAllByRole('option')
      .find((option) => option.textContent?.includes(codigo));
    expect(opcion('CNC-01')?.textContent).not.toContain('(otro grupo)');
    expect(opcion('DBL-02')?.textContent).toContain('(otro grupo)');
    expect(screen.getByTestId('ruteo-equipo-operacion-planeacion').textContent).toContain('Láser');

    fireEvent.change(screen.getByLabelText('Operación'), {
      target: { value: 'meta-doblez' },
    });

    expect(opcion('DBL-02')?.textContent).not.toContain('(otro grupo)');
    expect(opcion('CNC-01')?.textContent).toContain('(otro grupo)');
    expect(screen.getByTestId('ruteo-equipo-operacion-planeacion').textContent).toContain('Doblez');
  });

  it('el aviso de sobrecapacidad muestra el exceso en horas antes de guardar (C9.2/P09)', () => {
    const carga: CargaCapacidadDiaria = {
      recursoId: '11111111-1111-4111-8111-111111111111',
      area: 'taller',
      fechaProgramada: '2026-09-16',
      turno: 'matutino',
      horasCapacidad: 8,
      horasProgramadas: 8,
      horasReales: 0,
      horasExceso: 0,
      horasDisponibles: 0,
      porcentajeOcupacion: 100,
      sobrecargado: true,
    };

    render(
      createElement(PanelAsignacionPlaneacion, {
        recursos: DATOS.recursos,
        partidasProgramables: PARTIDAS_POR_DEFECTO,
        cargas: [carga],
        onEnviar: async () => ({ exito: true as const }),
      }),
    );

    fireEvent.change(screen.getByLabelText('Partida'), {
      target: { value: PARTIDAS_POR_DEFECTO[0].partidaId },
    });
    fireEvent.change(screen.getByLabelText('Recurso'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.change(screen.getByLabelText('Fecha programada'), {
      target: { value: '2026-09-16' },
    });
    fireEvent.change(screen.getByLabelText('Horas estimadas'), { target: { value: '4' } });

    const aviso = screen.getByTestId('aviso-capacidad-insuficiente');
    expect(aviso.textContent).toContain('Excede la capacidad por 4 h (12/8 h)');
    expect(within(aviso).getByTestId('insignia-saturacion-sobrecargado')).toBeTruthy();
    // La RPC es la autoridad: el aviso no deshabilita Guardar (C9.2/P09).
    expect(
      (screen.getByTestId('guardar-asignacion-planeacion') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('una fecha fuera del rango consulta la capacidad real con «Verificando capacidad…» (C9.2/P09)', async () => {
    let resolverConsulta: (resultado: { exito: true; datos: typeof DATOS }) => void = () => {};
    obtenerCalendarioMock.mockImplementation(
      (filtros: { fechaInicio: string; fechaFin: string }) => {
        if (filtros.fechaInicio === filtros.fechaFin) {
          return new Promise<{ exito: true; datos: typeof DATOS }>((resolver) => {
            resolverConsulta = resolver;
          });
        }
        return Promise.resolve({ exito: true, datos: DATOS });
      },
    );
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.change(screen.getByLabelText('Fecha programada'), {
      target: { value: '2026-10-05' },
    });

    expect(await screen.findByTestId('verificando-capacidad-planeacion')).toBeTruthy();
    expect(
      screen.queryByText('Sin capacidad configurada para ese recurso, fecha y turno'),
    ).toBeNull();
    expect(obtenerCalendarioMock).toHaveBeenCalledTimes(1);
    expect(obtenerCalendarioMock).toHaveBeenCalledWith({
      fechaInicio: '2026-10-05',
      fechaFin: '2026-10-05',
    });

    resolverConsulta({ exito: true, datos: DATOS });
    await waitFor(() =>
      expect(screen.queryByTestId('verificando-capacidad-planeacion')).toBeNull(),
    );
  });

  it('dentro del rango la capacidad viaja en el calendario y no hay consulta extra (C9.2/P09)', () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    renderizarOperacion(cliente);

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }));
    fireEvent.change(screen.getByLabelText('Fecha programada'), {
      target: { value: '2026-09-16' },
    });

    expect(screen.queryByTestId('verificando-capacidad-planeacion')).toBeNull();
    expect(obtenerCalendarioMock).not.toHaveBeenCalled();
  });

  it('resume los procesos de la bolsa con la misma regla de Órdenes (C9.4/P-19)', () => {
    render(
      createElement(PanelBolsaPlaneacion, {
        bolsa: {
          pausadasSinPlan: [{
            partidaId: '55555555-5555-4555-8555-555555555555',
            ordenId: DATOS.programaciones[0].ordenId,
            folio: 'OP-000001',
            codigoPieza: 'PIEZA-E2E',
            areaCodigo: 'taller',
            procesos: [' Corte ', 'corte', 'Doblez'],
            horas: 2,
            estimadoMinutos: 120,
          }],
          activasSinFechaHoy: [],
          sugerencias: [],
        },
        procesando: false,
        mensaje: null,
        error: null,
        onAsignar: async () => ({ exito: true as const }),
      }),
    );

    expect(screen.getByTestId('bolsa-pausadas').textContent).toContain(
      'Corte (2 operaciones) · Doblez',
    );
  });

  it('no vuelve a ofrecer reactivación desde la tarjeta de Planeación (C9.4/P-19)', () => {
    const programacion = {
      ...DATOS.programaciones[0],
      ordenEstadoSii: 'PLANIFICADA' as const,
      ordenActualizadoEn: '2026-09-01T12:00:00.000Z',
    };
    render(
      createElement(AccionesTarjetaOrden, {
        programacion,
        onRefrescar: vi.fn(),
      }),
    );

    expect(screen.queryByTestId(`accion-reactivar-${programacion.ordenId}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /reactivar/i })).toBeNull();
  });
});
