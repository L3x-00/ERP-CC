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
// HiloComentarios usa useQuery: esta prueba renderiza la ficha sin QueryClientProvider.
vi.mock('@/modulos/comentarios/componentes/indice', () => ({ HiloComentarios: () => null }));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const FICHA: DatosFichaOrden = {
  orden: {
    id: '00000000-0000-4000-8000-0000000c4201',
    folio: 'OP-004201',
    folioSii: 'O-1026_01',
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
  origen: null,
  ruta: [],
  partidas: [],
  snapshot: null,
  totales: null,
  entregas: [],
  eventos: [],
  archivos: [],
  hojaTrabajo: null,
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
        puedeVerTotales: false,
        puedeAdjuntar: false,
        puedeEliminarTodos: false,
        puedeVerRfq: false,
        puedeVerPropuesta: false,
      },
      usuarioActualId: 'u-c42',
    }));

    expect(screen.getByText('15 de noviembre de 2026')).toBeTruthy();
    expect(screen.getByText(/Operativa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajustar' })).toBeNull();
  });

  it('ofrece la pestaña Documento sin totales comerciales a quien carece de orden_ver_totales', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeCancelar: false,
        puedeVerTotales: false,
        puedeAdjuntar: false,
        puedeEliminarTodos: false,
        puedeVerRfq: false,
        puedeVerPropuesta: false,
      },
      usuarioActualId: 'u-c42',
    }));

    // R17: el Documento es visible siempre; sin orden_ver_totales es la hoja de trabajo (sin Totales).
    expect(screen.getByRole('tab', { name: 'Documento' })).toBeTruthy();
    expect(screen.queryByText('Sin totales comerciales en el snapshot.')).toBeNull();
    expect(screen.queryByText('Origen (snapshot)')).toBeNull();
    // El origen comercial (folios, sin precios) sí lo ve cualquier rol con orden_vista.
    expect(screen.getByText('Origen comercial')).toBeTruthy();
  });

  it('mantiene el documento comercial para una cuenta autorizada', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeCancelar: false,
        puedeVerTotales: true,
        puedeAdjuntar: false,
        puedeEliminarTodos: false,
        puedeVerRfq: false,
        puedeVerPropuesta: false,
      },
      usuarioActualId: 'u-c42',
    }));

    expect(screen.getByRole('tab', { name: 'Documento' })).toBeTruthy();
    expect(screen.getByText('Sin totales comerciales en el snapshot.')).toBeTruthy();
    expect(screen.getByText('Origen comercial')).toBeTruthy();
  });

  it('muestra la pestaña Costos solo con ver_finanzas (C10.2/F-07 B)', () => {
    const permisos = {
      puedeLiberar: false,
      puedeCerrar: false,
      puedeCancelar: false,
      puedeVerTotales: false,
      puedeAdjuntar: false,
      puedeEliminarTodos: false,
      puedeVerRfq: false,
      puedeVerPropuesta: false,
    };
    const { rerender } = render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: { ...permisos, puedeVerCostos: false },
      usuarioActualId: 'u-c42',
    }));

    expect(screen.queryByRole('tab', { name: 'Costos' })).toBeNull();

    rerender(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: { ...permisos, puedeVerCostos: true },
      usuarioActualId: 'u-c42',
    }));

    expect(screen.getByRole('tab', { name: 'Costos' })).toBeTruthy();
  });
});
