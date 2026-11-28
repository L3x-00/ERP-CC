// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/produccion-piso',
}));

import { EspacioOperador } from '@/modulos/produccion/componentes/espacio-operador';
import { PaginaMiPanelOperador } from '@/modulos/produccion/componentes/pagina-mi-panel-operador';
import type {
  ProcesoEspacioOperador,
  ResumenEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

const HOY = '2026-11-20';

function sesionCerrada() {
  return {
    id: 'sesion-cerrada',
    operadorId: 'operador-1',
    operadorNombre: 'Jorge Ramírez',
    estadoSesion: 'finalizada',
    fechaInicio: '2026-11-20T20:00:00.000Z',
    fechaFin: '2026-11-20T23:00:00.000Z',
    pendienteActualizacionAvance: false,
    sesionInvalida: false,
    recursoLiberado: false,
    piezasProducidas: 50,
    horasBrutas: 5.5,
    horasNetas: 4.86,
    motivoPausa: null,
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
  };
}

function procesoDelDia() {
  return {
    id: 'proceso-1',
    folioOrden: 'OP-001',
    folioSii: null,
    fechaCompromiso: '2026-11-20',
    codigoPieza: 'IT01',
    clienteNombre: 'Cliente de prueba',
    procesoNombre: 'Corte',
    areaNombre: 'Corte',
    columna: 'en_proceso',
    urgencia: 'normal',
    porcentaje: 50,
    reclamo: null,
    reclamadoPorMi: true,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    puedeIniciar: false,
    puedeReanudar: false,
    motivoNoInicia: null,
    sesionActiva: null,
    sesiones: [sesionCerrada()],
    procesosRuteo: [],
    archivos: [],
    comentariosOrden: [],
    etiquetas: [],
    programacion: null,
    metaPiezas: 100,
    hechoPiezas: 50,
    pendientePiezas: 50,
    horasEstimadas: 2,
  } as unknown as ProcesoEspacioOperador;
}

const RESUMEN = {
  total: 4,
  aprobadas: 0,
  enBandeja: 0,
  enProceso: 1,
  pausadas: 0,
  pendientesActualizacion: 0,
  listas: 3,
  urgentes: 4,
  horasReclamadasHoy: 1.75,
} as unknown as ResumenEspacioOperador;

const PROPESPACIO = {
  procesos: [procesoDelDia()],
  areas: [],
  resumen: RESUMEN,
  motivosPausa: [],
  hoy: HOY,
  dias: [],
  cargasEquipos: [],
  recursosEquipos: [],
  operadorId: 'operador-1',
  soloLectura: false,
  nombreOperador: 'Jorge Ramírez Ortega',
  materiales: [],
  consumos: [],
};

const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function conConsultas(nodo: Parameters<typeof render>[0]) {
  return render(createElement(QueryClientProvider, { client: consultas }, nodo));
}

describe('A18 — horas trabajadas y reservadas con etiquetas claras', () => {
  it('el encabezado de Producción separa lo trabajado hoy de lo reservado hoy', () => {
    conConsultas(createElement(EspacioOperador, PROPESPACIO));

    expect(screen.getByTestId('horas-trabajadas-hoy').textContent)
      .toContain('Trabajado hoy: 4 h 52 min');
    expect(screen.getByTestId('horas-reservadas-hoy').textContent)
      .toContain('Reservado hoy: 1 h 45 min de 8 h');
    expect(screen.queryByText(/Hoy 1\.75 h/)).toBeNull();
  });

  it('la vista de administrador no atribuye horas trabajadas a un operador', () => {
    conConsultas(createElement(EspacioOperador, { ...PROPESPACIO, operadorId: null }));

    expect(screen.queryByTestId('horas-trabajadas-hoy')).toBeNull();
    expect(screen.getByTestId('horas-reservadas-hoy').textContent)
      .toContain('Reservado hoy');
  });

  it('Mi panel no repite las mismas horas con etiquetas distintas', () => {
    conConsultas(createElement(PaginaMiPanelOperador, {
      nombreOperador: 'Jorge Ramírez Ortega',
      operadorId: 'operador-1',
      procesos: [procesoDelDia()],
      ordenes: [],
      materiales: [],
      areas: [],
      motivosPausa: [],
      hoy: HOY,
      horasReclamadasHoy: 1.75,
      consumos: [],
    }));

    const jornada = screen.getByTestId('jornada-diaria-operador');
    expect(jornada.textContent).toContain('Trabajado hoy');
    expect(jornada.textContent).toContain('Reservado hoy');
    expect(jornada.textContent).not.toContain('Horas confirmadas');
    expect(screen.queryByText('Horas trabajadas registradas')).toBeNull();
    expect(screen.queryByText('Horas reservadas en reclamos')).toBeNull();
  });
});
