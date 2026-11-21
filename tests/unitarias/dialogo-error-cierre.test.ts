// @vitest-environment jsdom

/**
 * Regresión del cierre fallido (C17).
 *
 * El aviso de error vive en un `Dialog` del sistema y se abre encima del
 * formulario —que en «Mi panel» también es un `Dialog`—. Antes era un portal
 * propio al `body`: se veía, pero los clics caían al fondo (Radix lo dejaba
 * dentro de la zona `pointer-events: none`/`inert` del diálogo de abajo) y
 * `Esc` cerraba el formulario completo. Estas pruebas ejercitan Radix de
 * verdad para que eso no vuelva a pasar.
 */

import { act, createElement, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { DialogoErrorCierre } from '@/modulos/produccion/componentes/dialogo-error-cierre';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const ERROR = {
  mensaje: 'Declaraste 250 piezas producidas, pero «Usado» tiene 5.',
};

/** El aviso es controlado: al cerrarlo el padre limpia el error y desaparece. */
function AvisoConEstado({
  error,
  onCerrar,
}: {
  error: { mensaje: string; accion?: { etiqueta: string; alElegir: () => void } };
  onCerrar: () => void;
}) {
  const [actual, setActual] = useState<{ mensaje: string; accion?: { etiqueta: string; alElegir: () => void } } | null>(error);
  return createElement(DialogoErrorCierre, {
    error: actual,
    onCerrar: () => {
      setActual(null);
      onCerrar();
    },
  });
}

describe('DialogoErrorCierre', () => {
  it('muestra el motivo exacto y se anuncia como alertdialog', async () => {
    render(createElement(DialogoErrorCierre, { error: ERROR, onCerrar: vi.fn() }));

    const dialogo = await screen.findByTestId('error-cierre-dialogo');
    expect(dialogo.getAttribute('role')).toBe('alertdialog');
    expect(screen.getByTestId('error-cierre-mensaje').textContent).toContain(ERROR.mensaje);
    expect(screen.getByTestId('error-cierre-entendido').textContent).toBe('Entendido');
  });

  it('cierra con «Entendido» y ofrece la acción sugerida cuando existe', async () => {
    const onCerrar = vi.fn();
    const alElegir = vi.fn();
    render(createElement(AvisoConEstado, {
      error: { mensaje: ERROR.mensaje, accion: { etiqueta: 'Usar 250 piezas de Corte laser', alElegir } },
      onCerrar,
    }));

    fireEvent.click(await screen.findByTestId('error-cierre-accion'));
    expect(alElegir).toHaveBeenCalledTimes(1);
    expect(onCerrar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull());

    cleanup();
    render(createElement(AvisoConEstado, { error: ERROR, onCerrar }));
    fireEvent.click(await screen.findByTestId('error-cierre-entendido'));
    expect(onCerrar).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull());
  });

  it('permite un título concreto y una salida acorde al error', async () => {
    render(createElement(DialogoErrorCierre, {
      error: {
        titulo: 'Revisa el consumo de piezas',
        mensaje: 'Falta el campo Usado.',
        etiquetaCerrar: 'Volver a revisar',
      },
      onCerrar: vi.fn(),
    }));

    const dialogo = await screen.findByTestId('error-cierre-dialogo');
    expect(dialogo.textContent).toContain('Revisa el consumo de piezas');
    expect(screen.getByTestId('error-cierre-entendido').textContent).toBe('Volver a revisar');
  });

  it('dentro de otro diálogo, Esc cierra solo el aviso y no el formulario', async () => {
    const avisarCierreFormulario = vi.fn();
    const cerrarAviso = vi.fn();

    render(createElement(
      Dialog,
      { open: true, onOpenChange: (abierto: boolean) => { if (!abierto) avisarCierreFormulario(); } },
      createElement(
        DialogContent,
        { 'data-testid': 'formulario' } as never,
        createElement(DialogHeader, {}, createElement(DialogTitle, {}, 'Cerrar sesión')),
        createElement(DialogoErrorCierre, { error: ERROR, onCerrar: cerrarAviso }),
      ),
    ));

    await screen.findByTestId('error-cierre-dialogo');
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });

    await waitFor(() => expect(cerrarAviso).toHaveBeenCalled());
    expect(avisarCierreFormulario).not.toHaveBeenCalled();
  });
});
