// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({
  cambiarEstadoOrdenAccion: vi.fn(),
}));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({
  cerrarOrdenAdministrativaAccion: vi.fn(),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({
  liberarOrdenAccion: vi.fn(),
}));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const FICHA: DatosFichaOrden = {
  orden: {
    id: '00000000-0000-4000-8000-0000000c4201',
    folio: 'OP-004201',
    folioSii: 'OP-1026_01-01',
    estadoSii: 'PLANIFICADA',
    estadoLegacy: 'programada',
    prioridad: 'normal',
    fechaCompromisoComercial: '2026-11-15',
    fechaOperativa: '2026-11-17T18:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    referenciaExterna: null,
    notas: 'Turno matutino',
    creadoEn: '2026-10-09T12:00:00.000Z',
    actualizadoEn: '2026-10-09T12:00:00.000Z',
    cerradaAdminEn: null,
    cerradaAdminPorNombre: null,
    clienteNombre: 'Cliente C4.2',
    moneda: 'MXN',
  },
  partidas: [],
  snapshot: null,
  totales: null,
  entregas: [],
  eventos: [],
  archivos: [],
};

afterEach(() => cleanup());

describe('ficha de Orden C4.3', () => {
  it('conserva separadas las fechas y retira el ajuste comercial de la ficha', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeCancelar: false,
        puedeVerFinanzas: false,
      },
    }));

    expect(screen.getByText('15 de noviembre de 2026')).toBeTruthy();
    expect(screen.getByText(/Operativa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull();
  });

  it('no ofrece documento ni totales comerciales a quien carece de ver_finanzas', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeCancelar: false,
        puedeVerFinanzas: false,
      },
    }));

    expect(screen.queryByRole('tab', { name: 'Documento' })).toBeNull();
    expect(screen.queryByText('Sin totales comerciales en el snapshot.')).toBeNull();
    expect(screen.queryByText('Origen (snapshot)')).toBeNull();
  });

  it('mantiene el documento comercial para una cuenta autorizada', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeCancelar: false,
        puedeVerFinanzas: true,
      },
    }));

    expect(screen.getByRole('tab', { name: 'Documento' })).toBeTruthy();
    expect(screen.getByText('Sin totales comerciales en el snapshot.')).toBeTruthy();
    expect(screen.getByText('Origen (snapshot)')).toBeTruthy();
  });
});
