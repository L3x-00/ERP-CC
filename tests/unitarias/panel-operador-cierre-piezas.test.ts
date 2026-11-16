// @vitest-environment jsdom

/**
 * El panel rápido debe aplicar exactamente la misma regla de consumo de piezas
 * que la ficha del proceso (C17) y mostrar el motivo en el mismo aviso modal,
 * para que un proceso posterior (Doblado, etc.) no cierre declarando piezas
 * sin consumir las del proceso anterior.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { empujarRutaMock } = vi.hoisted(() => ({ empujarRutaMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: empujarRutaMock, refresh: vi.fn() }),
}));

vi.mock('@/modulos/produccion/acciones/registrar-consumo-piezas', () => ({
  registrarConsumoPiezasAccion: vi.fn().mockResolvedValue({ exito: true, datos: {} }),
}));

import { PanelOperadorProduccion } from '@/modulos/produccion/componentes/panel-operador-produccion';

afterEach(cleanup);

const metaDoblado = {
  id: 'meta-2',
  secuencia: 2,
  nombre: 'DOBLADO_CNC',
  metaPiezas: 250,
  hechoPiezas: 0,
  pendientePiezas: 250,
  porcentaje: 0,
  disponiblePiezas: 250,
  procesoPrevioNombre: 'Corte laser',
};

const orden = {
  id: 'orden-1',
  folio: 'O-1126_03',
  estadoKanban: 'en_proceso',
  sesiones: [],
  partidas: [{
    id: 'partida-1',
    codigoPieza: 'IT01',
    programaciones: [],
    metasProceso: [metaDoblado],
  }],
} as never;

const BASE = {
  orden,
  sesionActiva: {
    id: 'sesion-1',
    ordenId: 'orden-1',
    partidaId: 'partida-1',
    programacionId: 'programacion-1',
  },
  operadorDisponible: true,
  procesando: false,
  motivosPausa: [],
  materiales: [],
  responsables: {},
};

function capturarCierre() {
  fireEvent.change(screen.getByLabelText('Piezas dobladas ahora'), { target: { value: '250' } });
  fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '5' } });
  fireEvent.change(screen.getByTestId('motivo-consumo'), {
    target: { value: 'Consumo de piezas cortadas' },
  });
  fireEvent.change(screen.getByLabelText('Confirmar PIN'), { target: { value: '4826' } });
  fireEvent.submit(screen.getByTestId('cerrar-sesion-produccion').closest('form')!);
}

describe('PanelOperadorProduccion — cierre de un proceso posterior', () => {
  it('no cierra y explica el consumo de piezas con el mismo mensaje del detalle', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true });
    render(createElement(PanelOperadorProduccion, { ...BASE, onCerrar: cerrar, onIniciar: vi.fn(), onReanudar: vi.fn() }));

    capturarCierre();

    const aviso = await screen.findByTestId('error-cierre-panel');
    expect(aviso.getAttribute('role')).toBe('alertdialog');
    const mensaje = screen.getByTestId('error-cierre-mensaje').textContent ?? '';
    expect(mensaje).toContain('Declaraste 250 piezas producidas en DOBLADO_CNC');
    expect(mensaje).toContain('«Usado» de Corte laser tiene 5');
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('la acción sugerida rellena «Usado» con el consumo 1:1', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true });
    render(createElement(PanelOperadorProduccion, { ...BASE, onCerrar: cerrar, onIniciar: vi.fn(), onReanudar: vi.fn() }));

    capturarCierre();
    fireEvent.click(await screen.findByTestId('error-cierre-accion'));

    await waitFor(() => expect(screen.queryByTestId('error-cierre-panel')).toBeNull());
    expect((screen.getByLabelText('Usado') as HTMLInputElement).value).toBe('250');
    expect(cerrar).not.toHaveBeenCalled();
  });
});
