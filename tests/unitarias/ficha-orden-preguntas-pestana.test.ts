// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: () => createElement('div', { 'data-testid': 'hilo-comentarios' }),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import { PREGUNTAS_PESTANA } from '@/modulos/ordenes/utilidades/preguntas-pestana';

const FICHA: DatosFichaOrden = {
  orden: {
    id: '00000000-0000-4000-8000-0000000c8111',
    folio: 'OP-008111',
    folioSii: 'O-1026_82',
    estadoSii: 'PLANIFICADA',
    estadoLegacy: 'programada',
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
    clienteNombre: 'Cliente C8.1',
    moneda: 'MXN',
  },
  origen: null,
  partidas: [],
  snapshot: null,
  totales: null,
  entregas: [],
  eventos: [],
  archivos: [],
};

const PERMISOS = {
  puedeLiberar: false,
  puedeCerrar: false,
  puedeCancelar: false,
  puedeVerTotales: true,
  puedeAdjuntar: false,
  puedeEliminarTodos: false,
  puedeVerRfq: false,
  puedeVerPropuesta: false,
};

// Rótulo de la pestaña → pregunta guía (R19 de la nota del cliente).
const ESPERADO: readonly [string, string][] = [
  ['Resumen', '¿Qué es esta Orden?'],
  ['Ítems / Partidas', '¿Qué hay que fabricar?'],
  ['Ruta / Operaciones', '¿Cómo se hará?'],
  ['Archivos vivos', '¿Con qué archivos?'],
  ['Entregas', '¿Qué se entregó?'],
  ['Actividad', '¿Qué ha pasado?'],
  ['Documento', '¿Qué puedo imprimir?'],
  ['Comentarios', '¿Qué se ha conversado?'],
];

afterEach(() => cleanup());

describe('ficha de Orden C8.1 · pregunta guía por pestaña (R19)', () => {
  it('declara la pregunta de las 8 pestañas', () => {
    expect(Object.values(PREGUNTAS_PESTANA).sort()).toEqual(ESPERADO.map(([, pregunta]) => pregunta).sort());
  });

  it.each(ESPERADO)('la pestaña %s muestra «%s»', (rotulo, pregunta) => {
    render(createElement(FichaOrden, { ficha: FICHA, permisos: PERMISOS, usuarioActualId: 'u-1' }));

    fireEvent.click(screen.getByRole('tab', { name: rotulo }));

    expect(screen.getByTestId('ficha-pregunta-pestana').textContent).toBe(pregunta);
  });

  it('una pestanaInicial que el usuario no puede ver cae en Resumen (Documento sin orden_ver_totales)', () => {
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: { ...PERMISOS, puedeVerTotales: false },
      usuarioActualId: 'u-1',
      pestanaInicial: 'documento',
    }));

    expect(screen.getByRole('tab', { name: 'Resumen' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('ficha-pregunta-pestana').textContent).toBe('¿Qué es esta Orden?');
    expect(screen.queryByTestId('ficha-panel-documento')).toBeNull();
  });

  it('abre en Resumen con su pregunta y conserva los data-testid previos de las pestañas', () => {
    render(createElement(FichaOrden, { ficha: FICHA, permisos: PERMISOS, usuarioActualId: 'u-1' }));

    expect(screen.getByTestId('ficha-pregunta-pestana').textContent).toBe('¿Qué es esta Orden?');
    for (const id of ['resumen', 'partidas', 'ruta', 'archivos', 'entregas', 'actividad', 'documento', 'comentarios']) {
      expect(screen.getByTestId(`ficha-pestana-${id}`)).toBeTruthy();
    }
  });
});
