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

function construirFicha(entregadaTotal: number): DatosFichaOrden {
  return {
    orden: {
      id: '00000000-0000-4000-8000-0000000c8401',
      folio: 'OP-008401',
      folioSii: 'O-1026_84',
      estadoSii: 'PRODUCCION_COMPLETADA',
      estadoLegacy: 'completada',
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
      clienteNombre: 'Cliente C8.4',
      moneda: 'MXN',
    },
    origen: null,
    ruta: [],
    partidas: [
      {
        id: '00000000-0000-4000-8000-0000000c84p1',
        codigoPieza: 'P-01',
        codigoItem: 'IT01',
        descripcion: 'Pieza C8.4',
        cantidadSolicitada: 50,
        cantidadProducida: 50,
        cantidadScrap: 0,
        unidadMedida: 'pieza',
        procesos: [],
        tiempoEstimadoMinutos: 60,
        tiempoRealMinutos: 60,
        areaTrabajoCodigo: null,
      },
    ],
    snapshot: null,
    totales: null,
    entregas: entregadaTotal === 0 ? [] : [
      {
        id: '00000000-0000-4000-8000-0000000c84n1',
        folio: 'NE-8401',
        folioSii: 'NE-O-1026_84-01',
        esParcial: entregadaTotal < 50,
        recibidoPor: 'Almacén',
        creadoEn: '2026-10-09T15:00:00.000Z',
        partidas: [{ partidaId: '00000000-0000-4000-8000-0000000c84p1', cantidadEntregada: entregadaTotal }],
      },
    ],
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

describe('cierre administrativo bloqueado por saldo de entrega (O-01 A / C8.4 R12)', () => {
  it('con 30/50 el botón ficha-cerrar está deshabilitado y anuncia «Faltan 20 piezas por entregar»', () => {
    render(createElement(FichaOrden, { ficha: construirFicha(30), permisos: PERMISOS, usuarioActualId: 'u-84' }));
    const boton = screen.getByTestId('ficha-cerrar') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toContain('Faltan 20 piezas por entregar');
  });

  it('con 50/50 el botón ficha-cerrar queda habilitado', () => {
    render(createElement(FichaOrden, { ficha: construirFicha(50), permisos: PERMISOS, usuarioActualId: 'u-84' }));
    expect((screen.getByTestId('ficha-cerrar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('la ficha muestra el saldo de entrega «Entregado 30/50; faltan 20 por entregar»', () => {
    render(createElement(FichaOrden, {
      ficha: construirFicha(30),
      permisos: PERMISOS,
      usuarioActualId: 'u-84',
      pestanaInicial: 'entregas',
    }));
    expect(screen.getByTestId('ficha-saldo-entrega').textContent).toContain('Entregado 30/50');
    expect(screen.getByTestId('ficha-saldo-entrega').textContent).toContain('faltan 20');
  });
});
