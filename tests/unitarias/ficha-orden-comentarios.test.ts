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
// HiloComentarios usa useQuery: sin QueryClientProvider la prueba fallaría por otra razón.
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: (props: {
    entidadTipo: string;
    entidadId: string;
    usuarioActualId?: string;
    puedeEliminarTodos?: boolean;
  }) => createElement('div', {
    'data-testid': 'hilo-comentarios',
    'data-entidad-tipo': props.entidadTipo,
    'data-entidad-id': props.entidadId,
    'data-usuario-actual-id': props.usuarioActualId ?? '',
    'data-puede-eliminar-todos': String(props.puedeEliminarTodos ?? false),
  }),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({
  AdjuntosOrdenDialog: ({ ordenId, folio, onCerrar }: { ordenId: string; folio: string; onCerrar: () => void }) =>
    createElement('div', { 'data-testid': 'adjuntos-dialogo', 'data-orden-id': ordenId, 'data-folio': folio },
      createElement('button', { type: 'button', onClick: onCerrar }, 'Cerrar adjuntos')),
}));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const ID_ORDEN = '00000000-0000-4000-8000-0000000c8101';
const ID_USUARIO = '00000000-0000-4000-8000-0000000c8102';

const FICHA: DatosFichaOrden = {
  orden: {
    id: ID_ORDEN,
    folio: 'OP-008101',
    folioSii: 'O-1026_81',
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
  ruta: [],
  partidas: [],
  snapshot: null,
  totales: null,
  entregas: [],
  eventos: [],
  archivos: [],
  hojaTrabajo: null,
};

const FICHA_HISTORICA: DatosFichaOrden = {
  ...FICHA,
  orden: { ...FICHA.orden, idHistorico: 'LEGACY-77' },
};

const PERMISOS = {
  puedeLiberar: false,
  puedeCerrar: false,
  puedeCancelar: false,
  puedeVerTotales: false,
  puedeAdjuntar: true,
  puedeEliminarTodos: false,
  puedeVerRfq: false,
  puedeVerPropuesta: false,
};

function montar(
  ficha: DatosFichaOrden = FICHA,
  permisos: Partial<typeof PERMISOS> = {},
  extra: { pestanaInicial?: 'comentarios' | 'resumen' } = {},
) {
  return render(createElement(FichaOrden, {
    ficha,
    permisos: { ...PERMISOS, ...permisos },
    usuarioActualId: ID_USUARIO,
    ...extra,
  }));
}

afterEach(() => cleanup());

describe('ficha de Orden C8.1 · Comentarios como destino', () => {
  it('ofrece la pestaña Comentarios y monta el hilo de la orden al abrirla', () => {
    montar(FICHA, { puedeEliminarTodos: true });

    expect(screen.queryByTestId('hilo-comentarios')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Comentarios' }));

    const hilo = screen.getByTestId('hilo-comentarios');
    expect(hilo.getAttribute('data-entidad-tipo')).toBe('orden');
    expect(hilo.getAttribute('data-entidad-id')).toBe(ID_ORDEN);
    expect(hilo.getAttribute('data-usuario-actual-id')).toBe(ID_USUARIO);
    expect(hilo.getAttribute('data-puede-eliminar-todos')).toBe('true');
  });

  it('abre directamente en Comentarios cuando se pide pestanaInicial', () => {
    montar(FICHA, {}, { pestanaInicial: 'comentarios' });

    expect(screen.getByTestId('hilo-comentarios').getAttribute('data-entidad-id')).toBe(ID_ORDEN);
    expect(screen.getByRole('tab', { name: 'Comentarios' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Comentarios y Documento (hoja de trabajo) siguen disponibles sin orden_ver_totales', () => {
    montar(FICHA, { puedeVerTotales: false });

    expect(screen.getByRole('tab', { name: 'Comentarios' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Documento' })).toBeTruthy();
  });
});

describe('ficha de Orden C8.1 · Adjuntos legacy', () => {
  it('no muestra Adjuntos si la orden no es histórica', () => {
    montar(FICHA);
    expect(screen.queryByTestId('ficha-adjuntos')).toBeNull();
  });

  it('muestra Adjuntos solo si idHistorico no es null y abre el diálogo de esa orden', () => {
    montar(FICHA_HISTORICA);

    expect(screen.queryByTestId('adjuntos-dialogo')).toBeNull();
    fireEvent.click(screen.getByTestId('ficha-adjuntos'));

    const dialogo = screen.getByTestId('adjuntos-dialogo');
    expect(dialogo.getAttribute('data-orden-id')).toBe(ID_ORDEN);
    expect(dialogo.getAttribute('data-folio')).toBe('O-1026_81');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar adjuntos' }));
    expect(screen.queryByTestId('adjuntos-dialogo')).toBeNull();
  });

  it('oculta Adjuntos a quien no puede adjuntar aunque la orden sea histórica', () => {
    montar(FICHA_HISTORICA, { puedeAdjuntar: false });
    expect(screen.queryByTestId('ficha-adjuntos')).toBeNull();
  });
});
