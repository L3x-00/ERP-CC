// @vitest-environment jsdom
// Panel desplegable de Configuración → Tarifas / TC: colapsado por defecto, con
// el contenido siempre montado (no se pierde lo capturado) y accesible.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';

afterEach(() => {
  cleanup();
});

// `children` va como argumento de createElement (regla react/no-children-prop);
// el cast evita que TS lo exija también dentro de las props.
type PropsPanel = ComponentProps<typeof PanelDesplegable>;

function montar(abiertoInicial = false) {
  const propiedades = {
    titulo: 'Corte láser',
    resumen: 'Máquina $950.00/h',
    'data-testid': 'panel-laser',
    abiertoInicial,
  } as PropsPanel;
  return render(
    createElement(
      PanelDesplegable,
      propiedades,
      createElement('input', {
        'aria-label': 'Tarifa máquina por hora',
        defaultValue: '950',
        required: true,
        min: '1',
        type: 'number',
      }),
    ),
  );
}

describe('PanelDesplegable', () => {
  it('nace colapsado, muestra el resumen y deja el contenido inerte', () => {
    montar();

    const boton = screen.getByRole('button', { name: /Corte láser/ });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.textContent).toContain('Máquina $950.00/h');
    expect(screen.getByTestId('panel-laser').getAttribute('data-estado')).toBe('cerrado');
    const region = document.getElementById(boton.getAttribute('aria-controls') ?? '');
    expect(region?.hasAttribute('inert')).toBe(true);
  });

  it('conserva el contenido montado: lo capturado no se pierde al plegar', () => {
    montar();

    const campo = screen.getByLabelText('Tarifa máquina por hora', { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '1200' } });

    const boton = screen.getByRole('button', { name: /Corte láser/ });
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(boton);
    fireEvent.click(boton);

    expect((screen.getByLabelText('Tarifa máquina por hora', { selector: 'input' }) as HTMLInputElement).value).toBe('1200');
  });

  it('al abrir quita el inert y marca el estado', () => {
    montar();

    const boton = screen.getByRole('button', { name: /Corte láser/ });
    fireEvent.click(boton);

    const region = document.getElementById(boton.getAttribute('aria-controls') ?? '');
    expect(region?.hasAttribute('inert')).toBe(false);
    expect(screen.getByTestId('panel-laser').getAttribute('data-estado')).toBe('abierto');
  });

  it('puede nacer abierto cuando se pide', () => {
    montar(true);

    expect(screen.getByRole('button', { name: /Corte láser/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('se abre solo cuando un campo inválido queda dentro del panel cerrado', async () => {
    montar();

    const campo = screen.getByLabelText('Tarifa máquina por hora', { selector: 'input' });
    fireEvent.invalid(campo);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Corte láser/ }).getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('el botón no envía el formulario que lo contiene', () => {
    const alEnviar = { llamado: false };
    render(
      createElement(
        'form',
        { onSubmit: (evento: { preventDefault: () => void }) => { evento.preventDefault(); alEnviar.llamado = true; } },
        createElement(
          PanelDesplegable,
          { titulo: 'Router CNC' } as PropsPanel,
          createElement('span', null, 'contenido'),
        ),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Router CNC/ }));
    expect(alEnviar.llamado).toBe(false);
  });
});
