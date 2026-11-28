// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/produccion-piso',
}));

const { crearMock } = vi.hoisted(() => ({ crearMock: vi.fn() }));
vi.mock('@/modulos/produccion/utilidades/crear-lote-cliente', () => ({
  crearLoteDesdeSugerencia: crearMock,
}));

import { EspacioOperador } from '@/modulos/produccion/componentes/espacio-operador';
import type {
  ProcesoEspacioOperador,
  ResumenEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';

afterEach(() => {
  cleanup();
  crearMock.mockReset();
});

const RESUMEN = {
  total: 2, aprobadas: 0, enBandeja: 0, enProceso: 0, pausadas: 0,
  pendientesActualizacion: 0, listas: 0, urgentes: 0, horasReclamadasHoy: 0,
} as unknown as ResumenEspacioOperador;

const material = {
  id: 'material-1', codigo: 'LAM-CR-14', nombre: 'Acero calibre 14',
  unidadBase: 'm2', anchoMm: null, largoMm: null, espesorMm: 1.4,
};

function proceso(id: string, codigoPieza: string): ProcesoEspacioOperador {
  return {
    id,
    ordenId: 'orden-1',
    folioOrden: 'OF-001171',
    folioSii: null,
    estadoOrden: 'en_proceso',
    estadoSii: 'sin_sii',
    prioridad: 'normal',
    fechaCompromiso: '2026-12-01',
    fechaOperativa: '2026-11-27',
    notas: null,
    clienteNombre: 'Manufacturing Group',
    partidaId: `partida-${id}`,
    codigoPieza,
    descripcion: `Pieza ${codigoPieza}`,
    procesoNombre: 'Corte Láser',
    areaCodigo: 'LASER',
    areaNombre: 'Corte láser',
    areaMacro: 'sheet_metal',
    areaColor: null,
    material,
    metaProcesoId: null,
    secuencia: 1,
    unidadMedida: 'piezas',
    cantidadSolicitada: 10,
    cantidadProducida: 0,
    esExterno: false,
    proveedorExterno: null,
    pendientePiezas: 10,
    metaPiezas: 10,
    hechoPiezas: 0,
    porcentaje: 0,
    horasEstimadas: 1,
    procesoCompleto: false,
    esFinal: false,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    puedeIniciar: false,
    puedeReanudar: false,
    motivoNoInicia: null,
    reclamo: null,
    reclamadoPorMi: false,
    sesionActiva: null,
    sesiones: [],
    loteId: null,
    columna: 'bandeja',
    urgencia: 'normal',
    procesosRuteo: [],
    archivos: [],
    comentariosOrden: [],
    etiquetas: [],
    programacion: null,
  } as unknown as ProcesoEspacioOperador;
}

const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function montar() {
  return render(
    createElement(QueryClientProvider, { client: consultas },
      createElement(EspacioOperador, {
    procesos: [proceso('proceso-1', 'IT01'), proceso('proceso-2', 'IT02')],
    areas: [],
    resumen: RESUMEN,
    motivosPausa: [],
    hoy: '2026-11-27',
    dias: [],
    cargasEquipos: [],
    recursosEquipos: [],
    operadorId: 'operador-1',
    soloLectura: false,
    nombreOperador: 'Jorge Ramírez Ortega',
    materiales: [],
    consumos: [],
      })));
}

describe('creación de lote con confirmación', () => {
  beforeEach(() => {
    crearMock.mockResolvedValue({ exito: true, mensaje: 'Lote LAS01 creado con 2 ítems.' });
  });

  it('abre el diálogo al pulsar Crear Lote y no crea nada hasta confirmar', async () => {
    montar();
    fireEvent.click(screen.getByTestId('abrir-detalle-proceso-1'));
    fireEvent.click(screen.getByText('Crear Lote'));

    expect(screen.getByTestId('dialogo-confirmar-lote')).toBeTruthy();
    expect(screen.getByTestId('confirmar-lote-items').textContent).toContain('IT01');
    expect(screen.getByTestId('confirmar-lote-items').textContent).toContain('IT02');
    expect(crearMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirmar-crear-lote'));
    await waitFor(() => expect(crearMock).toHaveBeenCalledTimes(1));
    expect(crearMock.mock.calls[0]?.[0].procesos).toHaveLength(2);
  });

  it('cancelar cierra el diálogo sin crear el lote', async () => {
    montar();
    fireEvent.click(screen.getByTestId('abrir-detalle-proceso-1'));
    fireEvent.click(screen.getByText('Crear Lote'));
    fireEvent.click(screen.getByTestId('cancelar-crear-lote'));

    await waitFor(() => expect(screen.queryByTestId('dialogo-confirmar-lote')).toBeNull());
    expect(crearMock).not.toHaveBeenCalled();
  });
});
