// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';

import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/estado/uso-tienda-ordenes', () => ({
  usarTiendaOrdenes: (selector: (estado: Record<string, unknown>) => unknown) => selector({
    filtroMaquina: null,
    filtrosEstado: [],
    establecerFiltroMaquina: vi.fn(),
    alternarFiltroEstado: vi.fn(),
    limpiarFiltros: vi.fn(),
  }),
}));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));

import { TablaOrdenes } from '@/modulos/ordenes/componentes/tabla-ordenes';

const ID_PROPUESTA = '00000000-0000-4000-8000-0000000d2001';
const PATRON_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function orden(folio: string, extra: Partial<OrdenTabla> = {}): OrdenTabla {
  return {
    id: `00000000-0000-4000-8000-${folio.replace(/\D/g, '').padStart(12, '0')}`,
    folio: `OP-${folio}`,
    folioSii: `O-${folio}`,
    folioCotizacionCnc: null,
    estado: 'programada',
    estadoSii: 'PLANIFICADA',
    prioridad: 'normal',
    fechaCompromiso: '2099-12-31T18:00:00.000Z',
    actualizadoEn: '2026-10-10T01:00:00.000Z',
    archivadaEn: null,
    esInterna: false,
    idHistorico: null,
    partidas: [],
    ...extra,
  };
}

const ORIGEN = { propuestaId: ID_PROPUESTA, propuestaFolio: 'CNC-1026_07', revisionLetra: 'B' };

function montar(ordenes: OrdenTabla[], puedeVerPropuesta?: boolean) {
  return render(createElement(TablaOrdenes, {
    ordenes,
    puedeLiberar: false,
    ...(puedeVerPropuesta === undefined ? {} : { puedeVerPropuesta }),
  }));
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('cola de Órdenes · propuesta de origen bajo el folio', () => {
  it('con propuesta_vista muestra el folio humano como enlace a /propuestas?propuesta=<id>', () => {
    montar([orden('0101', { origenPropuesta: ORIGEN })], true);

    const bloque = screen.getByTestId('origen-propuesta-O-0101');
    expect(bloque.textContent).toContain('Propuesta');
    const enlace = within(bloque).getByRole('link');
    expect(enlace.textContent).toBe('CNC-1026_07');
    expect(enlace.getAttribute('href')).toBe(`/propuestas?propuesta=${ID_PROPUESTA}`);
    expect(bloque.getAttribute('title')).toBe('Propuesta de origen, revisión aceptada B');
  });

  it('sin propuesta_vista muestra el mismo folio como texto, sin enlace', () => {
    montar([orden('0102', { origenPropuesta: ORIGEN })], false);

    const bloque = screen.getByTestId('origen-propuesta-O-0102');
    expect(bloque.textContent).toContain('CNC-1026_07');
    expect(within(bloque).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByTestId('enlace-propuesta-O-0102')).toBeNull();
  });

  it('por omisión (sin la prop de permiso) el folio es texto: el enlace exige concederlo', () => {
    montar([orden('0103', { origenPropuesta: ORIGEN })]);

    expect(screen.getByTestId('origen-propuesta-O-0103').textContent).toContain('CNC-1026_07');
    expect(screen.queryByTestId('enlace-propuesta-O-0103')).toBeNull();
  });

  it.each([
    ['sin origen (null)', { origenPropuesta: null }],
    ['sin la clave de origen', {}],
    ['interna manual sin revisión', { esInterna: true, origenPropuesta: null }],
    ['histórica sin revisión', { idHistorico: 'LEGACY-9', origenPropuesta: null }],
  ])('%s no inventa origen: ni texto ni enlace', (_caso, extra) => {
    montar([orden('0104', extra as Partial<OrdenTabla>)], true);

    expect(screen.queryByTestId('origen-propuesta-O-0104')).toBeNull();
    expect(screen.queryByText(/Propuesta/)).toBeNull();
    expect(within(screen.getByTestId('fila-orden-O-0104')).getAllByRole('link').map((e) => e.textContent?.trim()))
      .toEqual(['Abrir']);
  });

  it('el enlace tiene nombre accesible único por orden y nunca imprime el id interno', () => {
    montar([
      orden('0105', { origenPropuesta: ORIGEN }),
      orden('0106', { origenPropuesta: { ...ORIGEN, propuestaFolio: 'CNC-1026_08', revisionLetra: null } }),
    ], true);

    const primero = screen.getByTestId('enlace-propuesta-O-0105');
    const segundo = screen.getByTestId('enlace-propuesta-O-0106');
    expect(primero.getAttribute('aria-label')).toBe('Propuesta CNC-1026_07, origen de la orden O-0105');
    expect(segundo.getAttribute('aria-label')).toBe('Propuesta CNC-1026_08, origen de la orden O-0106');
    // El nombre accesible contiene el texto visible (WCAG 2.5.3).
    expect(primero.getAttribute('aria-label')).toContain(primero.textContent ?? '');
    expect(screen.getByTestId('origen-propuesta-O-0106').getAttribute('title')).toBe('Propuesta de origen');
    expect(screen.getByTestId('fila-orden-O-0105').textContent).not.toMatch(PATRON_UUID);
    expect(screen.getByTestId('fila-orden-O-0106').textContent).not.toMatch(PATRON_UUID);
  });

  it('un id de propuesta que no es uuid conserva el folio como texto y no arma enlace', () => {
    montar([orden('0107', { origenPropuesta: { ...ORIGEN, propuestaId: '../admin' } })], true);

    expect(screen.getByTestId('origen-propuesta-O-0107').textContent).toContain('CNC-1026_07');
    expect(screen.queryByTestId('enlace-propuesta-O-0107')).toBeNull();
  });

  it('convive con la cotización legacy sin confundirlas y no añade controles a la fila', () => {
    montar([orden('0108', { folioCotizacionCnc: 'CNC-0926-0007', origenPropuesta: ORIGEN })], true);

    const fila = screen.getByTestId('fila-orden-O-0108');
    expect(within(fila).getByTitle('Cotización de origen').textContent).toBe('CNC-0926-0007');
    expect(within(fila).getByTestId('origen-propuesta-O-0108').textContent).toContain('CNC-1026_07');
    expect(within(fila).getAllByRole('link').map((enlace) => enlace.textContent?.trim()).sort())
      .toEqual(['Abrir', 'CNC-1026_07']);
    expect(within(fila).queryAllByRole('button')).toHaveLength(0);
  });

  it('cada fila lleva su propia propuesta (dos órdenes, dos enlaces distintos)', () => {
    const otroId = '00000000-0000-4000-8000-0000000d2002';
    montar([
      orden('0109', { origenPropuesta: ORIGEN }),
      orden('0110', { origenPropuesta: { propuestaId: otroId, propuestaFolio: 'CNC-1026_09', revisionLetra: 'A' } }),
    ], true);

    expect(screen.getByTestId('enlace-propuesta-O-0109').getAttribute('href'))
      .toBe(`/propuestas?propuesta=${ID_PROPUESTA}`);
    expect(screen.getByTestId('enlace-propuesta-O-0110').getAttribute('href'))
      .toBe(`/propuestas?propuesta=${otroId}`);
  });
});
