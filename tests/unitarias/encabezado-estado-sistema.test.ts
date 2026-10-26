// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  CentroNotificacionesHeader: () => null,
}));
vi.mock('@/modulos/autenticacion/acciones/cerrar-sesion', () => ({
  cerrarSesionAccion: vi.fn(),
}));

import { EncabezadoApp } from '@/compartido/componentes/navegacion/encabezado-app';

afterEach(cleanup);

describe('estado global del encabezado', () => {
  it('combina el tipo de cambio establecido y el estado en línea con texto visible', () => {
    render(createElement(EncabezadoApp, {
      titulo: 'Dashboard',
      usuarioId: 'usuario-1',
      nombreUsuario: 'Ana Torres',
      rolUsuario: 'admin',
      estadoTipoCambio: {
        requiereActualizacion: false,
        motivo: null,
        tipoCambioUsd: 18.42,
        actualizadoEn: '2026-10-25T17:00:00.000Z',
        fechaLocal: '2026-10-25',
        horasDesdeActualizacion: 1,
      },
      puedeActualizarTipoCambio: true,
      onAbrirMenu: () => undefined,
    }));

    expect(screen.getByTestId('tipo-cambio-encabezado').textContent).toBe('T.C. $18.42 MXN/USD');
    expect(within(screen.getByTestId('estado-conexion')).getByText('En línea')).toBeTruthy();
  });
});
