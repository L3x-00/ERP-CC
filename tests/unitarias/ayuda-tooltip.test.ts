// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AyudaTooltip } from '@/compartido/componentes/ui/ayuda-tooltip';

afterEach(cleanup);

function renderTooltip() {
  return render(createElement(AyudaTooltip, {
    texto: 'Viene de los consumos registrados',
    children: '$320.00',
  }));
}

describe('AyudaTooltip', () => {
  it('muestra la explicación al pasar el puntero y la oculta al salir', () => {
    renderTooltip();
    const disparador = screen.getByText('$320.00');

    expect(screen.queryByTestId('ayuda-tooltip')).toBeNull();
    fireEvent.mouseEnter(disparador);

    const ayuda = screen.getByTestId('ayuda-tooltip');
    expect(ayuda.textContent).toContain('consumos registrados');
    expect(disparador.getAttribute('aria-describedby')).toBe(ayuda.id);
    expect(disparador.getAttribute('tabindex')).toBe('0');

    fireEvent.mouseLeave(disparador);
    expect(screen.queryByTestId('ayuda-tooltip')).toBeNull();
  });

  it('también se abre con el foco del teclado', () => {
    renderTooltip();
    const disparador = screen.getByText('$320.00');

    fireEvent.focus(disparador);
    expect(screen.getByRole('tooltip').textContent).toContain('consumos registrados');

    fireEvent.blur(disparador);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
