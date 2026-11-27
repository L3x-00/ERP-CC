// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogoDetalleLote } from '@/modulos/produccion/componentes/dialogo-detalle-lote';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';

afterEach(cleanup);

const LOTE: LoteTablero = {
  id: 'corrida-1',
  codigo: 'LAS01',
  estado: 'PLANIFICADA',
  ordenId: 'orden-1',
  folioOrden: 'O-1126_12',
  clienteNombre: 'Muebles Industriales Bravo',
  procesoNombre: 'CORTE LASER',
  areaCodigo: 'LASER',
  areaCodigos: ['LASER'],
  cantidadPlanificada: 210,
  items: [
    { id: null, partidaId: 'partida-1', codigoItem: 'IT01', cantidad: 120 },
    { id: null, partidaId: 'partida-2', codigoItem: 'IT02', cantidad: 90 },
  ],
  creadoEn: '2026-11-27T00:00:00.000Z',
};

describe('DialogoDetalleLote', () => {
  it('muestra el detalle del lote y exige fecha antes de iniciar la corrida', () => {
    const onIniciar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE,
      puedeOperar: true,
      onIniciar,
      onCerrar: vi.fn(),
    }));

    expect(screen.getByText('Lote LAS01')).toBeTruthy();
    expect(screen.getByTestId('item-lote-partida-1').textContent).toContain('120');
    expect(screen.getByTestId('item-lote-partida-2').textContent).toContain('90');

    const fecha = screen.getByTestId('fecha-inicio-corrida') as HTMLInputElement;
    const hoy = hoyIso();
    expect(fecha.value).toBe(hoy);
    expect(fecha.className).not.toContain('border-peligro/50');
    expect((screen.getByTestId('iniciar-corrida-lote') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('iniciar-corrida-lote'));
    expect(onIniciar).toHaveBeenCalledWith(LOTE, hoy, 'matutino');
  });
});
