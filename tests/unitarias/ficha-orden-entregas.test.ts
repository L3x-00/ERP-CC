// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({ HiloComentarios: () => null }));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

function construirOrden(estadoSii: 'EN_PRODUCCION' | 'PRODUCCION_COMPLETADA'): DatosFichaOrden {
  const partidaId = '00000000-0000-4000-8000-0000000c84p2';
  return {
    orden: {
      id: '00000000-0000-4000-8000-0000000c8402',
      folio: 'OP-008402',
      folioSii: 'O-1026_85',
      estadoSii,
      estadoLegacy: estadoSii === 'PRODUCCION_COMPLETADA' ? 'completada' : 'en_proceso',
      prioridad: 'normal',
      fechaCompromisoComercial: '2026-11-15',
      fechaOperativa: '2026-11-17T18:00:00.000Z',
      archivadaEn: null,
      esInterna: false,
      idHistorico: null,
      referenciaExterna: null,
      notas: null,
      creadoEn: '2026-10-09T12:00:00.000Z',
      actualizadoEn: '2026-10-09T12:00:00.000Z',
      cerradaAdminEn: null,
      cerradaAdminPorNombre: null,
      clienteNombre: 'Cliente Entregas',
      moneda: 'MXN',
    },
    origen: null,
    ruta: [],
    partidas: [{
      id: partidaId,
      codigoPieza: 'P-02',
      codigoItem: 'IT01',
      descripcion: 'Pieza entregas',
      cantidadSolicitada: 50,
      cantidadProducida: 50,
      cantidadScrap: 0,
      unidadMedida: 'pieza',
      procesos: [],
      tiempoEstimadoMinutos: 30,
      tiempoRealMinutos: 30,
      areaTrabajoCodigo: null,
    }],
    snapshot: null,
    totales: null,
    entregas: [],
    eventos: [],
    archivos: [],
    hojaTrabajo: null,
  };
}

const PERMISOS = {
  puedeLiberar: false,
  puedeCerrar: true,
  puedeCancelar: false,
  puedeVerTotales: false,
  puedeAdjuntar: false,
  puedeEliminarTodos: false,
  puedeVerRfq: false,
  puedeVerPropuesta: false,
};

afterEach(() => cleanup());

describe('panel Entregas de la ficha (R11 caracterización + O-08 «No»)', () => {
  it('con producción completada muestra el enlace «Preparar entrega» a /entregas?orden=query', () => {
    render(createElement(FichaOrden, {
      ficha: construirOrden('PRODUCCION_COMPLETADA'),
      permisos: PERMISOS,
      usuarioActualId: 'u-84',
      pestanaInicial: 'entregas',
    }));
    const enlace = screen.getByTestId('ficha-preparar-entrega') as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toBe('/entregas?orden=00000000-0000-4000-8000-0000000c8402');
    expect(screen.queryByTestId('ficha-entrega-bloqueada')).toBeNull();
  });

  it('con la orden EN_PRODUCCION el enlace está oculto y se explica el bloqueo (O-08)', () => {
    render(createElement(FichaOrden, {
      ficha: construirOrden('EN_PRODUCCION'),
      permisos: PERMISOS,
      usuarioActualId: 'u-84',
      pestanaInicial: 'entregas',
    }));
    expect(screen.queryByTestId('ficha-preparar-entrega')).toBeNull();
    expect(screen.getByTestId('ficha-entrega-bloqueada').textContent)
      .toContain('Se habilita al completar la producción');
  });

  it('sin entregas la nota parcial/totales del folio NE se marca como esperada (folio SII visible)', () => {
    render(createElement(FichaOrden, {
      ficha: construirOrden('EN_PRODUCCION'),
      permisos: PERMISOS,
      usuarioActualId: 'u-84',
      pestanaInicial: 'entregas',
    }));
    expect(screen.getByText('Sin notas de entrega registradas.')).toBeTruthy();
  });
});
