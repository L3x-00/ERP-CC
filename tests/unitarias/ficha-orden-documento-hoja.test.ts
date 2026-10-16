// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/obtener-url-archivo-ficha', () => ({ obtenerUrlArchivoFichaAccion: vi.fn() }));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({ HiloComentarios: () => null }));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import { PERMISOS_BASE, PATRON_UUID, fichaCompleta, fichaConSnapshot } from '../utilidades/ficha-orden-fixture';

afterEach(() => cleanup());

function abrirDocumento(ficha = fichaCompleta(), puedeVerTotales = false): HTMLElement {
  render(createElement(FichaOrden, {
    ficha, permisos: { ...PERMISOS_BASE, puedeVerTotales }, usuarioActualId: 'u-hoja',
  }));
  fireEvent.click(screen.getByTestId('ficha-pestana-documento'));
  return screen.getByTestId('ficha-panel-documento');
}

describe('pestaña Documento · hoja de trabajo sin precios (R17)', () => {
  it('es visible aunque el rol no tenga orden_ver_totales', () => {
    abrirDocumento(fichaCompleta(), false);

    expect(screen.getByRole('tab', { name: 'Documento' })).toBeTruthy();
  });

  it('sin orden_ver_totales muestra cliente, orden, ITxx, descripción, cantidad, material, espesor, procesos, observaciones y archivos', () => {
    const documento = abrirDocumento(fichaCompleta(), false);
    const texto = documento.textContent ?? '';

    expect(texto).toContain('Orden de servicio O-1026_01');
    expect(texto).toContain('Cliente C8.2');
    expect(texto).toContain('IT01');
    expect(texto).toContain('Soporte lateral');
    expect(texto).toMatch(/4/u);
    expect(texto).toContain('Acero A36');
    expect(texto).toContain('3 mm');
    expect(texto).toContain('Corte láser');
    expect(texto).toContain('Doblez');
    expect(texto).toContain('Rebabar bordes');
    expect(texto).toContain('Turno matutino');
    expect(texto).toContain('Archivo sin nombre');
  });

  it('sin orden_ver_totales no hay bloque Totales ni ningún monto o moneda', () => {
    const documento = abrirDocumento(fichaCompleta(), false);
    const texto = documento.textContent ?? '';

    for (const rotulo of ['Subtotal', 'Descuento', 'IVA', 'Total']) {
      expect(within(documento).queryByText(rotulo, { exact: true }), `bloque «${rotulo}»`).toBeNull();
    }
    expect(texto).not.toContain('Sin totales comerciales');
    expect(texto).not.toMatch(/\bMXN\b|\bUSD\b|\$/u);
  });

  it('con orden_ver_totales conserva el mismo marcado y añade el bloque Totales', () => {
    const documento = abrirDocumento(fichaConSnapshot(), true);

    expect(documento.textContent).toContain('Soporte lateral');
    expect(within(documento).getByText('Total', { exact: true })).toBeTruthy();
    expect(within(documento).getByText('Subtotal', { exact: true })).toBeTruthy();
  });

  it('no imprime ningún UUID ni la palabra snapshot', () => {
    const documento = abrirDocumento(fichaCompleta(), false);

    expect(documento.textContent).not.toMatch(PATRON_UUID);
    expect(documento.textContent).not.toMatch(/snapshot/iu);
  });

  it('una orden anterior al flujo SII (sin hoja) cae a sus partidas con redacción neutra', () => {
    const documento = abrirDocumento({ ...fichaCompleta({ folioSii: null }), hojaTrabajo: null }, false);

    expect(documento.textContent).toContain('Orden anterior al flujo SII');
    expect(documento.textContent).toContain('Soporte lateral');
    expect(documento.textContent).not.toMatch(/legacy|legad|snapshot/iu);
  });

  it('el botón Imprimir está disponible para quien ve la hoja', () => {
    abrirDocumento(fichaCompleta(), false);

    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeTruthy();
  });
});
