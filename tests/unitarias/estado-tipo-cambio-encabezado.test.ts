// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

vi.mock('@/modulos/configuracion/componentes/dialogo-tipo-cambio-diario', () => ({
  DialogoTipoCambioDiario: ({ abierto }: { abierto: boolean }) => (
    abierto ? createElement('div', { 'data-testid': 'modal-tipo-cambio-diario' }) : null
  ),
}));

import { EstadoTipoCambioEncabezado } from '@/modulos/configuracion/componentes/estado-tipo-cambio-encabezado';

const VIGENTE: EstadoTipoCambioDiario = {
  requiereActualizacion: false,
  motivo: null,
  tipoCambioUsd: 18.42,
  actualizadoEn: '2026-10-25T17:00:00.000Z',
  fechaLocal: '2026-10-25',
  horasDesdeActualizacion: 1,
};

afterEach(cleanup);

describe('estado de tipo de cambio del encabezado', () => {
  it('muestra el valor global con dos decimales cuando ya fue establecido', () => {
    render(createElement(EstadoTipoCambioEncabezado, {
      estado: VIGENTE,
      puedeActualizar: true,
    }));

    expect(screen.getByTestId('tipo-cambio-encabezado').textContent).toBe('T.C. $18.42 MXN/USD');
  });

  it('permite al administrador abrir el diálogo existente si aún no hay captura', () => {
    render(createElement(EstadoTipoCambioEncabezado, {
      estado: { ...VIGENTE, tipoCambioUsd: 20, actualizadoEn: null, requiereActualizacion: true, motivo: 'sin_registro' },
      puedeActualizar: true,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Establecer tipo de cambio' }));
    expect(screen.getByTestId('modal-tipo-cambio-diario')).toBeTruthy();
  });

  it('informa que falta establecerlo sin ofrecer una acción no autorizada', () => {
    render(createElement(EstadoTipoCambioEncabezado, {
      estado: { ...VIGENTE, tipoCambioUsd: 20, actualizadoEn: null, requiereActualizacion: true, motivo: 'sin_registro' },
      puedeActualizar: false,
    }));

    expect(screen.getByText('T.C. sin establecer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Establecer tipo de cambio' })).toBeNull();
  });
});
