// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PERMISOS_BASE, fichaCompleta } from '../utilidades/ficha-orden-fixture';
import type { PermisosFichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/crear-orden-basada-anterior', () => ({
  crearOrdenBasadaEnAnteriorAccion: vi.fn(),
}));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: () => createElement('div', { 'data-testid': 'hilo-comentarios' }),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const PERMISOS_CON_BASE = {
  ...PERMISOS_BASE,
  puedeCrearBasadaEnAnterior: true,
} as PermisosFichaOrden;

afterEach(() => cleanup());

describe('ficha de Orden C8.6 · nueva orden basada en anterior', () => {
  it('ofrece una nueva OP solo técnica desde una orden actual ya finalizada', () => {
    render(createElement(FichaOrden, {
      ficha: fichaCompleta({ estadoSii: 'PRODUCCION_COMPLETADA', estadoLegacy: 'completada' }),
      permisos: PERMISOS_CON_BASE,
      usuarioActualId: 'u-c8-6',
    }));

    fireEvent.click(screen.getByTestId('ficha-crear-basada-en-anterior'));

    expect(screen.getByRole('dialog').textContent).toContain('solo datos técnicos');
    expect(screen.getByRole('dialog').textContent).toContain('No copia precios ni cuentas por cobrar');
  });

  it('no permite basar una nueva OP en una orden legacy ni en una activa', () => {
    const { rerender } = render(createElement(FichaOrden, {
      ficha: fichaCompleta({
        estadoSii: 'PRODUCCION_COMPLETADA',
        estadoLegacy: 'completada',
        idHistorico: 'LEG-008201',
      }),
      permisos: PERMISOS_CON_BASE,
      usuarioActualId: 'u-c8-6',
    }));
    expect(screen.queryByTestId('ficha-crear-basada-en-anterior')).toBeNull();

    rerender(createElement(FichaOrden, {
      ficha: fichaCompleta({ estadoSii: 'PLANIFICADA', estadoLegacy: 'programada' }),
      permisos: PERMISOS_CON_BASE,
      usuarioActualId: 'u-c8-6',
    }));
    expect(screen.queryByTestId('ficha-crear-basada-en-anterior')).toBeNull();
  });
});
