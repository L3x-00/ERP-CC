// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PERMISOS_BASE, fichaCompleta, fichaConSnapshot } from '../utilidades/ficha-orden-fixture';
import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: () => createElement('div', { 'data-testid': 'hilo-comentarios' }),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const PERMISOS_FINANZAS = { ...PERMISOS_BASE, puedeVerTotales: true };

function montar(ficha: DatosFichaOrden, permisos = PERMISOS_FINANZAS) {
  return render(createElement(FichaOrden, { ficha, permisos, usuarioActualId: 'u-folio' }));
}

/** Texto de todas las pestañas visibles, para buscar rótulos prohibidos en cualquiera. */
function textoDeTodasLasPestanas(): string {
  const partes: string[] = [];
  for (const pestana of screen.getAllByRole('tab')) {
    fireEvent.click(pestana);
    partes.push(document.body.textContent ?? '');
  }
  return partes.join('\n');
}

function tarjeta(titulo: string): HTMLElement {
  const rotulo = screen.getByText(titulo, { exact: true });
  return rotulo.parentElement as HTMLElement;
}

afterEach(() => cleanup());

describe('ficha de Orden C8.2 · identidad: «Folio» y «Referencia migrada»', () => {
  it('una orden creada en el ERP muestra «Folio» con su folio SII y la ficha no dice «legacy»', () => {
    montar(fichaConSnapshot({ folioSii: 'O-1026_01' }));

    expect(tarjeta('Folio').textContent).toContain('O-1026_01');
    expect(screen.queryByText('Folio anterior')).toBeNull();
    expect(screen.queryByText('Folio legacy')).toBeNull();
    expect(textoDeTodasLasPestanas()).not.toMatch(/legacy|legad/iu);
  });

  it('«Referencia migrada» solo aparece cuando la orden trae idHistorico', () => {
    montar(fichaCompleta({ idHistorico: null }));
    expect(screen.queryByText('Referencia migrada')).toBeNull();
    cleanup();

    montar(fichaCompleta({ idHistorico: 'HIST-2024-001' }));
    expect(tarjeta('Referencia migrada').textContent).toContain('HIST-2024-001');
  });

  it('una referencia externa por sí sola no se trata como migrada', () => {
    montar(fichaCompleta({ idHistorico: null, referenciaExterna: 'PO-998877' }));
    expect(screen.queryByText('Referencia migrada')).toBeNull();
  });

  it('una orden anterior al flujo SII (OP-######) muestra su folio bajo «Folio anterior» y textos neutros (O-11)', () => {
    montar(fichaConSnapshot({
      folioSii: null,
      idHistorico: 'HIST-2024-001',
      fechaCompromisoComercial: null,
    }));

    expect(tarjeta('Folio anterior').textContent).toContain('OP-008201');
    expect(screen.queryByText('Folio', { exact: true })).toBeNull();
    expect(screen.getByText('Sin compromiso comercial registrado')).toBeTruthy();
    expect(textoDeTodasLasPestanas()).not.toMatch(/legacy|legad/iu);
  });

  it('el documento de una orden sin snapshot usa una redacción neutra', () => {
    montar({ ...fichaCompleta({ folioSii: null }), snapshot: null });
    fireEvent.click(screen.getByTestId('ficha-pestana-documento'));

    const documento = screen.getByTestId('ficha-panel-documento');
    expect(documento.textContent).toContain('Orden anterior al flujo SII');
    expect(documento.textContent).not.toMatch(/legacy|legad/iu);
  });
});
