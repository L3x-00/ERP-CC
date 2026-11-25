// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/produccion-piso',
}));

import { EspacioOperador } from '@/modulos/produccion/componentes/espacio-operador';
import type {
  ProcesoEspacioOperador,
  ResumenEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

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

const PROCESO = {
  id: 'proceso-1',
  folioOrden: 'OP-001',
  folioSii: null,
  fechaCompromiso: '2026-11-20',
  codigoPieza: 'IT01',
  clienteNombre: 'Cliente de prueba',
  procesoNombre: 'Corte',
  areaNombre: 'Corte',
  columna: 'en_proceso',
  urgencia: 'urgente',
  porcentaje: 50,
  reclamo: null,
  reclamadoPorMi: true,
  piezasDisponibles: null,
  procesoPrevioNombre: null,
  puedeIniciar: false,
  puedeReanudar: false,
  motivoNoInicia: null,
  sesionActiva: null,
  sesiones: [],
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

function montar() {
  return render(createElement(EspacioOperador, {
    procesos: [PROCESO],
    areas: [],
    resumen: RESUMEN,
    motivosPausa: [],
    hoy: '2026-11-20',
    dias: [],
    cargasEquipos: [],
    recursosEquipos: [],
    operadorId: 'operador-1',
    soloLectura: false,
    nombreOperador: 'Jorge Ramírez Ortega',
    materiales: [],
    consumos: [],
  }));
}

describe('A19 — tablero alineado y ordenado', () => {
  it('usa seis columnas para las seis métricas, sin columna vacía', () => {
    montar();
    const resumen = screen.getByTestId('resumen-espacio');

    expect(resumen.children).toHaveLength(6);
    expect(resumen.className).toContain('lg:grid-cols-6');
    expect(resumen.className).not.toContain('lg:grid-cols-7');
  });

  it('reúne pestañas y filtros en una misma barra y a la misma altura', () => {
    montar();
    const barra = screen.getByTestId('barra-herramientas-tablero');
    const vistas = within(barra).getByTestId('grupo-vistas');
    const filtros = within(barra).getByTestId('grupo-filtros');

    expect(within(vistas).getByTestId('vista-kanban')).toBeTruthy();
    expect(within(filtros).getByTestId('filtro-urgentes')).toBeTruthy();
    expect(vistas.className).toContain('h-11');
    expect(filtros.className).toContain('h-11');
  });

  it('conserva el filtro de urgentes y todas las vistas', () => {
    montar();
    const urgentes = screen.getByTestId('filtro-urgentes');

    expect(screen.getByTestId('vista-kanban')).toBeTruthy();
    expect(screen.getByTestId('vista-calendario')).toBeTruthy();
    expect(screen.getByTestId('vista-carga')).toBeTruthy();
    expect(screen.getByTestId('vista-areas')).toBeTruthy();
    expect(urgentes.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(urgentes);
    expect(urgentes.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('C1 — sugerencia de corrida conjunta en el tablero', () => {
  it('muestra el aviso cuando dos ítems comparten material, calibre y proceso inicial', () => {
    const material = {
      id: 'material-1',
      codigo: 'LAM-CR-14',
      nombre: 'Acero calibre 14',
      unidadBase: 'm2',
      anchoMm: null,
      largoMm: null,
      espesorMm: 1.4,
    };
    const primero = {
      ...PROCESO,
      id: 'proceso-1',
      ordenId: 'orden-1',
      codigoPieza: 'IT01',
      descripcion: 'Pieza A',
      procesoNombre: 'Corte Láser',
      secuencia: 1,
      material,
      pendientePiezas: 10,
      procesoCompleto: false,
    } as unknown as ProcesoEspacioOperador;
    const segundo = { ...primero, id: 'proceso-2', codigoPieza: 'IT02', descripcion: 'Pieza B' };

    render(createElement(EspacioOperador, {
      procesos: [primero, segundo],
      areas: [],
      resumen: RESUMEN,
      motivosPausa: [],
      hoy: '2026-11-20',
      dias: [],
      cargasEquipos: [],
      recursosEquipos: [],
      operadorId: 'operador-1',
      soloLectura: false,
      nombreOperador: 'Jorge Ramírez Ortega',
      materiales: [],
      consumos: [],
    }));

    const aviso = screen.getByTestId('sugerencias-corridas');
    expect(aviso.textContent).toContain('IT01 (Pieza A)');
    expect(aviso.textContent).toContain('IT02 (Pieza B)');
    expect(aviso.textContent).toContain('Corte Láser');
    expect(aviso.textContent).toContain('Puede iniciarlos en una misma corrida');
  });
});
