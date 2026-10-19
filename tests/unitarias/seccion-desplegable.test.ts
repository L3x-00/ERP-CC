// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SeccionDesplegable } from '@/compartido/componentes/ui/seccion-desplegable';

afterEach(cleanup);

describe('SeccionDesplegable', () => {
  it('inicia cerrada, conserva el contenido montado y lo abre con aria-expanded', () => {
    render(
      createElement(
        SeccionDesplegable,
        {
          titulo: 'Filtros',
          descripcion: 'Rango y recurso',
          dataTestIdBoton: 'toggle',
        },
        createElement(
          'label',
          null,
          'Fecha inicial',
          createElement('input', { 'aria-label': 'Fecha inicial' }),
        ),
      ),
    );

    const boton = screen.getByTestId('toggle');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(boton.getAttribute('aria-controls')).toBeTruthy();
    // El contenido sigue montado para no perder el estado de los formularios.
    expect(screen.getByLabelText('Fecha inicial')).toBeTruthy();

    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('respeta el estado controlado y notifica el cambio', () => {
    let abierto = false;
    const alternar = (siguiente: boolean) => { abierto = siguiente; };
    const contenido = createElement('p', null, 'Contenido');

    const { rerender } = render(
      createElement(
        SeccionDesplegable,
        {
          titulo: 'Capacidad instalada',
          abierto,
          onAbiertoChange: alternar,
          dataTestIdBoton: 'toggle-controlado',
        },
        contenido,
      ),
    );

    fireEvent.click(screen.getByTestId('toggle-controlado'));
    expect(abierto).toBe(true);
    rerender(
      createElement(
        SeccionDesplegable,
        {
          titulo: 'Capacidad instalada',
          abierto,
          onAbiertoChange: alternar,
          dataTestIdBoton: 'toggle-controlado',
        },
        contenido,
      ),
    );
    expect(screen.getByTestId('toggle-controlado').getAttribute('aria-expanded')).toBe('true');
  });
});
