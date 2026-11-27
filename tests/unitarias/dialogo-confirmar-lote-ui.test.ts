// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DialogoConfirmarLote } from '@/modulos/produccion/componentes/dialogo-confirmar-lote';
import type { SugerenciaCorrida } from '@/modulos/produccion/utilidades/agrupacion-corridas';

afterEach(cleanup);

const material = {
  id: 'material-1',
  codigo: 'LAM-CR-14',
  nombre: 'Acero calibre 14',
  unidadBase: 'm2',
  anchoMm: null,
  largoMm: null,
  espesorMm: 1.4,
};

function proceso(id: string, codigoPieza: string, areaNombre: string) {
  return {
    id,
    codigoPieza,
    descripcion: `Pieza ${codigoPieza}`,
    pendientePiezas: 10,
    unidadMedida: 'piezas',
    areaNombre,
    folioSii: null,
    folioOrden: 'OF-001171',
    clienteNombre: 'Manufacturing Group',
    material,
  } as never;
}

const SUGERENCIA = {
  clave: 'orden-1|material-1|1.4|CORTE LASER',
  ordenId: 'orden-1',
  materialCodigo: 'LAM-CR-14',
  espesorMm: 1.4,
  procesoNombre: 'CORTE LASER',
  procesos: [proceso('p1', 'IT01', 'Corte láser'), proceso('p2', 'IT02', 'Corte láser')],
  mensaje: 'Puede iniciarlos en una misma corrida.',
} as unknown as SugerenciaCorrida;

describe('DialogoConfirmarLote', () => {
  it('muestra los ítems, el material, el área y el total antes de crear', () => {
    const onConfirmar = vi.fn();
    render(createElement(DialogoConfirmarLote, {
      sugerencia: SUGERENCIA,
      procesando: false,
      onCancelar: vi.fn(),
      onConfirmar,
    }));

    expect(screen.getByTestId('dialogo-confirmar-lote')).toBeTruthy();
    expect(screen.getByText(/Confirmar creación de lote/)).toBeTruthy();
    expect(screen.getByText(/OF-001171 · Manufacturing Group/)).toBeTruthy();
    const resumen = screen.getByTestId('confirmar-lote-resumen').textContent ?? '';
    expect(resumen).toContain('CORTE LASER');
    expect(resumen).toContain('LAM-CR-14 (Acero calibre 14)');
    expect(resumen).toContain('calibre 1.4 mm');
    expect(resumen).toContain('Corte láser');
    const items = screen.getByTestId('confirmar-lote-items').textContent ?? '';
    expect(items).toContain('IT01');
    expect(items).toContain('IT02');
    expect(screen.getByTestId('confirmar-lote-total').textContent).toContain('2 ítem(s)');
    expect(screen.getByTestId('confirmar-lote-total').textContent).toContain('20 pieza(s)');

    fireEvent.click(screen.getByTestId('confirmar-crear-lote'));
    expect(onConfirmar).toHaveBeenCalledWith(SUGERENCIA);
  });

  it('cancelar no crea el lote', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(createElement(DialogoConfirmarLote, {
      sugerencia: SUGERENCIA,
      procesando: false,
      onCancelar,
      onConfirmar,
    }));

    fireEvent.click(screen.getByTestId('cancelar-crear-lote'));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('no afirma un área única cuando los ítems tienen áreas distintas', () => {
    render(createElement(DialogoConfirmarLote, {
      sugerencia: {
        ...SUGERENCIA,
        procesos: [proceso('p1', 'IT01', 'Corte láser'), proceso('p2', 'IT02', 'Doblado')],
      } as unknown as SugerenciaCorrida,
      procesando: false,
      onCancelar: vi.fn(),
      onConfirmar: vi.fn(),
    }));

    expect(screen.getByTestId('confirmar-lote-resumen').textContent).toContain('áreas distintas');
  });
});
