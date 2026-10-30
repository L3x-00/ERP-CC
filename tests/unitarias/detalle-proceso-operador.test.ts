// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/compartido/componentes/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
    open === false ? null : createElement('div', {}, children)
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) => createElement('div', {}, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => createElement('h2', {}, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) => createElement('p', {}, children),
}));

vi.mock('@/modulos/ordenes/acciones/obtener-url-archivo-piso', () => ({
  obtenerUrlArchivoPisoAccion: vi.fn(),
}));

import {
  DetalleProcesoOperador,
  type ResultadoOperacion,
} from '@/modulos/produccion/componentes/detalle-proceso-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

const proceso = {
  id: 'proceso-1',
  ordenId: 'orden-1',
  folioOrden: 'OP-001',
  folioSii: null,
  estadoOrden: 'en_proceso',
  estadoSii: 'EN_PRODUCCION',
  prioridad: 'normal',
  clienteNombre: 'Cliente de prueba',
  fechaCompromiso: '2026-10-30',
  fechaOperativa: '2026-10-28',
  notas: null,
  partidaId: 'partida-1',
  codigoPieza: 'PZA-01',
  descripcion: 'Pieza de prueba',
  cantidadSolicitada: 10,
  cantidadProducida: 0,
  unidadMedida: 'piezas',
  esExterno: false,
  proveedorExterno: null,
  material: { id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' },
  areaCodigo: 'CORTE',
  areaNombre: 'Corte',
  areaMacro: 'CORTE',
  areaColor: null,
  metaProcesoId: 'meta-1',
  procesoNombre: 'Láser',
  secuencia: 1,
  metaPiezas: 10,
  hechoPiezas: 0,
  pendientePiezas: 10,
  porcentaje: 0,
  esFinal: true,
  horasEstimadas: 2,
  programacion: {
    id: 'programacion-1',
    fecha: '2026-10-28',
    turno: 'matutino',
    estadoPlaneacion: 'en_proceso',
    horasEstimadas: 2,
    recursoId: 'recurso-1',
    recursoCodigo: 'LASER-01',
    recursoNombre: 'Láser 1',
    actualizadoEn: '2026-10-28T10:00:00.000Z',
  },
  reclamo: null,
  reclamadoPorMi: true,
  nombreReclamante: null,
  sesionActiva: {
    id: 'sesion-1',
    operadorId: 'operador-1',
    operadorNombre: 'Operador de prueba',
    estadoSesion: 'activa',
    fechaInicio: '2026-10-28T10:00:00.000Z',
    fechaFin: null,
    piezasProducidas: 0,
    horasNetas: 0,
    motivoPausa: null,
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
  },
  ultimaSesion: null,
  sesiones: [],
  procesosRuteo: [],
  archivos: [],
  columna: 'en_proceso',
  urgencia: 'normal',
  etiquetas: [],
  puedeIniciar: false,
  puedeReanudar: false,
  motivoNoInicia: 'Ya hay una sesión activa en este proceso',
} as unknown as ProcesoEspacioOperador;

describe('DetalleProcesoOperador', () => {
  it('envía el consumo al cierre y muestra el resumen confirmado de la sesión', async () => {
    let resolverCierre: (resultado: ResultadoOperacion) => void = () => undefined;
    const cerrar = vi.fn(() => new Promise<ResultadoOperacion>((resolver) => {
      resolverCierre = resolver;
    }));

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [{
        id: 'consumo-1',
        partidaId: 'partida-1',
        materialId: 'material-1',
        cantidadUsada: 1,
        cantidadScrap: 0.25,
        creadoEn: '2026-10-28T10:30:00.000Z',
      }],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByText('Consumo acumulado de materiales (1)'));
    expect(screen.getByText(/Usado: 1.000 kg/)).toBeTruthy();
    expect(screen.getByText(/Merma: 0.250 kg/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Piezas producidas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Merma'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('PIN de confirmación'), { target: { value: '4826' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(cerrar).toHaveBeenCalledWith(proceso, expect.objectContaining({
      piezasProducidas: 3,
      estadoDestino: 'finalizada',
      consumo: {
        materialId: 'material-1',
        cantidadUsada: 2,
        cantidadScrap: 0.5,
      },
    }));

    await act(async () => {
      resolverCierre({
        exito: true,
        datos: {
          id: 'sesion-1',
          estadoSesion: 'finalizada',
          horasBrutas: 1.25,
          horasNetas: 1,
          piezasProducidas: 3,
          cantidadProducidaPartida: 3,
          estadoOrden: 'en_proceso',
          estadoPlaneacion: 'programada',
          actualizadoEn: '2026-10-28T11:15:00.000Z',
        },
      });
      await cerrar.mock.results[0]?.value;
    });

    expect((await screen.findByTestId('resumen-cierre-registrado')).textContent).toContain(
      'Sesión finalizada: 3.000 piezas, 1 h netas y material registrado.',
    );
  });

  it('ofrece liberar la primera pieza desde el cierre cuando el proceso la exige', async () => {
    const cerrar = vi.fn().mockResolvedValue({
      exito: false,
      error: 'Falta liberar la primera pieza antes de declarar producción',
      codigo: 'primera_pieza_pendiente',
    } satisfies ResultadoOperacion);

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Piezas producidas'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Merma'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('PIN de confirmación'), { target: { value: '4826' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    const aviso = await screen.findByTestId('aviso-primera-pieza');
    expect(aviso.textContent).toContain('Falta liberar la primera pieza');
    fireEvent.click(screen.getByTestId('abrir-liberar-primera-pieza'));
    expect(screen.getByText('Resultado de la inspección')).toBeTruthy();
    expect(screen.getByTestId('resultado-primera-pieza')).toBeTruthy();
  });
});
