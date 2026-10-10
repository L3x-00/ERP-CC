// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';

const { ajustarMock, refrescarMock } = vi.hoisted(() => ({
  ajustarMock: vi.fn(),
  refrescarMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refrescarMock, push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/ajustar-orden-post-aceptacion', () => ({
  ajustarOrdenPostAceptacionAccion: (...args: unknown[]) => ajustarMock(...args),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ficha de Orden C4.2', () => {
  it('separa el compromiso comercial de la fecha operativa editable', async () => {
    ajustarMock.mockResolvedValue({
      exito: true,
      datos: { id: FICHA.orden.id, estadoSii: 'PLANIFICADA', actualizadoEn: '2026-10-09T13:00:00.000Z' },
    });
    render(createElement(FichaOrden, {
      ficha: FICHA,
      permisos: {
        puedeLiberar: false,
        puedeCerrar: false,
        puedeAjustar: true,
        puedeAdministrar: false,
      },
    }));

    expect(screen.getByText('15 de noviembre de 2026')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ficha-ajustar'));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Fecha operativa')).toBeTruthy();
    expect(within(dialogo).queryByText('Fecha compromiso')).toBeNull();

    fireEvent.change(within(dialogo).getByLabelText('Prioridad'), { target: { value: 'alta' } });
    fireEvent.change(within(dialogo).getByLabelText('Fecha operativa'), {
      target: { value: '2026-11-20T10:30' },
    });
    fireEvent.change(within(dialogo).getByLabelText('Notas'), {
      target: { value: 'Programar en turno vespertino' },
    });
    fireEvent.change(within(dialogo).getByLabelText('Motivo del ajuste (mínimo 3 caracteres)'), {
      target: { value: 'Cambio acordado con Planeación' },
    });
    fireEvent.click(within(dialogo).getByTestId('ficha-confirmar-ajuste'));

    await waitFor(() => expect(ajustarMock).toHaveBeenCalledTimes(1));
    const entrada = ajustarMock.mock.calls[0]?.[0] as { cambios: Record<string, unknown> };
    expect(entrada.cambios).toEqual({
      prioridad: 'alta',
      fechaOperativa: expect.any(String),
      notas: 'Programar en turno vespertino',
    });
    expect(entrada.cambios).not.toHaveProperty('fechaCompromiso');
    expect(refrescarMock).toHaveBeenCalledTimes(1);
  });
});
