// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';

import {
  ID_PROPUESTA,
  ID_RFQ,
  PATRON_UUID,
  PERMISOS_BASE,
  fichaCompleta,
  fichaConSnapshot,
} from '../utilidades/ficha-orden-fixture';
import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import type { PermisosFichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import {
  enlacePropuestaOrigen,
  enlaceRfqOrigen,
} from '@/modulos/ordenes/utilidades/enlaces-origen';

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

function montar(ficha: DatosFichaOrden, permisos: PermisosFichaOrden = PERMISOS_BASE) {
  return render(createElement(FichaOrden, { ficha, permisos, usuarioActualId: 'u-origen' }));
}

afterEach(() => cleanup());

describe('enlaces del origen comercial', () => {
  it('construyen exactamente las rutas que leen /rfq y /propuestas', () => {
    expect(enlaceRfqOrigen(ID_RFQ)).toBe(`/rfq?rfq=${ID_RFQ}`);
    expect(enlacePropuestaOrigen(ID_PROPUESTA)).toBe(`/propuestas?propuesta=${ID_PROPUESTA}`);
  });

  it('descartan un id que no es uuid (nunca arman una ruta con texto libre)', () => {
    expect(enlaceRfqOrigen('no-es-uuid')).toBeNull();
    expect(enlaceRfqOrigen('')).toBeNull();
    expect(enlacePropuestaOrigen('../admin')).toBeNull();
    expect(enlacePropuestaOrigen(null)).toBeNull();
  });
});

describe('ficha de Orden C8.2 · Origen comercial', () => {
  it('muestra RFQ, Propuesta y Revisión aceptada por folio a un rol SIN orden_ver_totales', () => {
    montar(fichaCompleta());

    const bloque = screen.getByTestId('ficha-origen-comercial');
    expect(within(bloque).getByText('Origen comercial')).toBeTruthy();
    expect(within(screen.getByTestId('ficha-origen-rfq')).getByText('RFQ-1026_05')).toBeTruthy();
    expect(within(screen.getByTestId('ficha-origen-propuesta')).getByText('CNC-1026_07')).toBeTruthy();
    const revision = screen.getByTestId('ficha-origen-revision');
    expect(revision.textContent).toContain('CNC-1026_07-B');
    expect(revision.textContent).toContain('Revisión B');
    expect(bloque.textContent).not.toMatch(PATRON_UUID);
    // Sin orden_ver_totales: ni totales ni el antiguo volcado del snapshot.
    expect(screen.queryByText('Origen (snapshot)')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('Total')).toBeNull();
  });

  it('sin permisos de destino los folios son texto plano (no hay enlaces)', () => {
    montar(fichaCompleta(), { ...PERMISOS_BASE, puedeVerRfq: false, puedeVerPropuesta: false });

    expect(within(screen.getByTestId('ficha-origen-comercial')).queryAllByRole('link')).toHaveLength(0);
  });

  it('con rfq_vista el RFQ enlaza a /rfq?rfq=<id> y la Propuesta sigue siendo texto', () => {
    montar(fichaCompleta(), { ...PERMISOS_BASE, puedeVerRfq: true });

    const enlaceRfq = within(screen.getByTestId('ficha-origen-rfq')).getByRole('link');
    expect(enlaceRfq.getAttribute('href')).toBe(`/rfq?rfq=${ID_RFQ}`);
    expect(within(screen.getByTestId('ficha-origen-propuesta')).queryByRole('link')).toBeNull();
    expect(within(screen.getByTestId('ficha-origen-revision')).queryByRole('link')).toBeNull();
  });

  it('con propuesta_vista la Propuesta y la Revisión enlazan a /propuestas?propuesta=<id>', () => {
    montar(fichaCompleta(), { ...PERMISOS_BASE, puedeVerPropuesta: true });

    const esperado = `/propuestas?propuesta=${ID_PROPUESTA}`;
    expect(within(screen.getByTestId('ficha-origen-propuesta')).getByRole('link').getAttribute('href'))
      .toBe(esperado);
    expect(within(screen.getByTestId('ficha-origen-revision')).getByRole('link').getAttribute('href'))
      .toBe(esperado);
    expect(within(screen.getByTestId('ficha-origen-rfq')).queryByRole('link')).toBeNull();
  });

  it('con orden_ver_totales el origen sigue ahí junto a los totales, sin volcar el snapshot', () => {
    montar(fichaConSnapshot(), { ...PERMISOS_BASE, puedeVerTotales: true });

    expect(screen.getByTestId('ficha-origen-comercial')).toBeTruthy();
    expect(screen.getByText('Subtotal')).toBeTruthy();
    expect(screen.queryByText('Origen (snapshot)')).toBeNull();
    for (const clave of ['rfq_id', 'propuesta_id', 'revision_id']) {
      expect(screen.getByTestId('ficha-panel-resumen').textContent).not.toContain(clave);
    }
  });

  it.each([
    ['una orden interna o anterior al flujo SII', null],
    [
      'un origen sin ningún folio',
      { rfqId: ID_RFQ, rfqFolio: null, propuestaId: ID_PROPUESTA, propuestaFolio: null, revisionFolio: null, revisionLetra: null },
    ],
  ])('%s muestra «Sin origen comercial»', (_caso, origen) => {
    montar({ ...fichaCompleta(), origen });

    expect(within(screen.getByTestId('ficha-origen-comercial')).getByText('Sin origen comercial')).toBeTruthy();
    expect(screen.queryByTestId('ficha-origen-rfq')).toBeNull();
  });

  it('un folio faltante dentro de un origen parcial se declara «No disponible»', () => {
    montar({
      ...fichaCompleta(),
      origen: {
        rfqId: null,
        rfqFolio: null,
        propuestaId: ID_PROPUESTA,
        propuestaFolio: 'CNC-1026_07',
        revisionFolio: null,
        revisionLetra: null,
      },
    }, { ...PERMISOS_BASE, puedeVerRfq: true, puedeVerPropuesta: true });

    const rfq = screen.getByTestId('ficha-origen-rfq');
    expect(rfq.textContent).toContain('No disponible');
    expect(within(rfq).queryByRole('link')).toBeNull();
  });
});
