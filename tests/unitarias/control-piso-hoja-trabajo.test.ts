// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/registrar-avance-partida', () => ({ registrarAvancePartidaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/registrar-consumo', () => ({ registrarConsumoOperadorAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/registrar-tiempo-operador', () => ({ registrarTiempoOperadorAccion: vi.fn() }));

import { ControlPisoPanel } from '@/modulos/ordenes/componentes/control-piso-panel';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';

const ORDEN_ID = '00000000-0000-4000-8000-0000000c8391';
const OPERADOR_ID = '00000000-0000-4000-8000-0000000c8392';

const ORDENES: OrdenConPartidas[] = [{
  orden: {
    id: ORDEN_ID, folio: 'O-1026_01', clienteId: 'c1', cotizacionId: null, estado: 'en_proceso',
    estadoSii: 'EN_PRODUCCION', folioSii: 'O-1026_01', prioridad: 'normal', fechaCompromiso: '2026-11-15',
    fechaInicio: null, fechaFin: null, motivoCancelacion: null, esInterna: false, archivadaEn: null,
    idHistorico: null, referenciaExterna: null, notas: null, fechaTrabajo: null, horasEstimadas: null,
    ordenOrigenId: null, creadoEn: '2026-10-09T12:00:00.000Z', actualizadoEn: '2026-10-09T12:00:00.000Z',
  },
  partidas: [{
    id: 'p1', ordenId: ORDEN_ID, codigoPieza: 'PZA-1', descripcion: 'Soporte', cantidadSolicitada: 4,
    cantidadProducida: 1, cantidadScrap: 0, unidadMedida: 'pza', materialId: null, tiempoEstimadoMinutos: 30,
    tiempoRealMinutos: 0, maquinaAsignada: null, operadorAsignadoId: OPERADOR_ID,
    creadoEn: '2026-10-09T12:00:00.000Z', actualizadoEn: '2026-10-09T12:00:00.000Z',
  }],
}];

afterEach(() => cleanup());

describe('Control de piso · acceso a la hoja de trabajo (C8.3c)', () => {
  it('la OP activa ofrece abrir su hoja de trabajo (sin precios)', () => {
    render(createElement(ControlPisoPanel, {
      operadorId: OPERADOR_ID, nombreOperador: 'Operador Uno', ordenes: ORDENES, materiales: [],
    }));

    const enlace = screen.getByTestId('abrir-hoja-trabajo');
    expect(enlace.getAttribute('href')).toBe(`/produccion-piso/hoja/${ORDEN_ID}`);
    expect(enlace.textContent).toContain('Hoja de trabajo');
  });

  it('también está disponible en la vista de solo lectura (administrador o vista delegada)', () => {
    render(createElement(ControlPisoPanel, {
      operadorId: OPERADOR_ID, ordenes: ORDENES, materiales: [], soloLectura: true,
    }));

    expect(screen.getByTestId('abrir-hoja-trabajo')).toBeTruthy();
  });
});
