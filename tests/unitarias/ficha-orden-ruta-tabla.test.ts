// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';

import { PanelRutaFicha } from '@/modulos/ordenes/componentes/panel-ruta-ficha';
import type { RutaItemFicha } from '@/modulos/ordenes/tipos/ficha-orden';

const RUTA: RutaItemFicha[] = [{
  codigoItem: 'IT01',
  descripcion: 'Soporte lateral',
  pasos: [
    { secuencia: 1, proceso: 'Corte láser', prepHoras: 0.25, operacionHoras: 1.5 },
    { secuencia: 2, proceso: 'Doblez', prepHoras: null, operacionHoras: null },
  ],
}];

afterEach(() => cleanup());

describe('pestaña Ruta de la ficha como tabla (R08)', () => {
  it('muestra por ítem una tabla # | Proceso | Prep. estimada | Operación estimada | Estado', () => {
    render(createElement(PanelRutaFicha, { ruta: RUTA }));

    const panel = screen.getByTestId('ficha-panel-ruta');
    expect(within(panel).getByText(/IT01/u)).toBeTruthy();
    const encabezados = within(panel).getAllByRole('columnheader').map((celda) => celda.textContent?.trim());
    expect(encabezados).toEqual(['#', 'Proceso', 'Prep. estimada', 'Operación estimada', 'Estado']);
  });

  it('cada paso trae su número, proceso, horas (o guion) y Estado «Pendiente»', () => {
    render(createElement(PanelRutaFicha, { ruta: RUTA }));

    const filas = within(screen.getByTestId('ficha-panel-ruta')).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    const primera = within(filas[0] as HTMLElement).getAllByRole('cell').map((celda) => celda.textContent?.trim());
    expect(primera).toEqual(['1', 'Corte láser', '0.25 h', '1.5 h', 'Pendiente']);
    const segunda = within(filas[1] as HTMLElement).getAllByRole('cell').map((celda) => celda.textContent?.trim());
    expect(segunda).toEqual(['2', 'Doblez', '—', '—', 'Pendiente']);
  });

  it('no usa los términos en inglés setup / run', () => {
    render(createElement(PanelRutaFicha, { ruta: RUTA }));
    expect(screen.getByTestId('ficha-panel-ruta').textContent).not.toMatch(/\b(setup|run)\b/iu);
  });

  it('sin ruta declara que no hay ruta registrada (sin hablar de snapshot)', () => {
    render(createElement(PanelRutaFicha, { ruta: [] }));

    const texto = screen.getByTestId('ficha-panel-ruta').textContent ?? '';
    expect(texto).toContain('Sin ruta registrada');
    expect(texto).not.toMatch(/snapshot/iu);
  });

  it('un ítem sin pasos lo dice en vez de dejar una tabla vacía', () => {
    render(createElement(PanelRutaFicha, { ruta: [{ codigoItem: 'IT03', descripcion: null, pasos: [] }] }));

    const panel = screen.getByTestId('ficha-panel-ruta');
    expect(within(panel).getByText('Sin operaciones registradas')).toBeTruthy();
    expect(within(panel).queryAllByRole('row')).toHaveLength(0);
  });
});
