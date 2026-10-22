// @vitest-environment jsdom
// Nota de convención: `vitest.config.ts` solo incluye `tests/**/*.test.ts`
// (sin `.tsx`), así que el componente se monta con `createElement` en vez de JSX.
//
// Obs. cliente 2026-10-21: el historial de versiones del Resumen conserva folio,
// estado, motivo, subtotal de venta, total cliente, validación y el botón «Ver»,
// pero ya no muestra utilidad estimada % sobre costo, precio mínimo recomendado ni
// alertas de objetivo (los datos siguen calculándose y guardándose en `totales`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const { propuestaMock, catalogosMock } = vi.hoisted(() => ({
  propuestaMock: vi.fn(),
  catalogosMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...resto }, children),
}));
vi.mock('@/modulos/propuestas/hooks/usar-propuesta', () => ({
  usarPropuesta: (...argumentos: unknown[]) => propuestaMock(...argumentos),
  usarCatalogosPropuesta: (...argumentos: unknown[]) => catalogosMock(...argumentos),
}));

// Hijos pesados fuera del alcance de esta prueba: se sustituyen por marcadores.
vi.mock('@/modulos/propuestas/componentes/actividad-propuesta', () => ({
  ActividadPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/dialogo-editar-revision', () => ({
  BotonEditarRevision: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/dialogo-nueva-version-propuesta', () => ({
  BotonNuevaVersionPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/editor-items-propuesta', () => ({
  EditorItemsPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/panel-acciones-propuesta', () => ({
  PanelAccionesPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/panel-archivos-propuesta', () => ({
  PanelArchivosPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/panel-pdfs-propuesta', () => ({
  PanelPdfsPropuesta: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/panel-ruteo-costeo', () => ({
  PanelRuteoCosteo: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/panel-seguimiento-propuesta', () => ({
  PanelSeguimientoPropuesta: () => null,
}));

import { FichaPropuesta } from '@/modulos/propuestas/componentes/ficha-propuesta';
import type { DetallePropuestaFicha } from '@/modulos/propuestas/acciones/obtener-propuesta';
import type { PermisosPropuesta } from '@/modulos/propuestas/tipos/indice';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REV_A_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REV_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const PERMISOS = {
  editarArticulo: true,
  editarPrecio: true,
  editarRuteo: true,
  editarCosto: true,
  validar: true,
  generarPdf: true,
  enviar: true,
  seguimiento: true,
  aceptar: true,
  crearRevision: true,
  cerrar: true,
} as PermisosPropuesta;

function totales(parcial: Record<string, unknown>) {
  return {
    bruto: 1000,
    descuento: 0,
    subtotal: 1000,
    ivaPorcentaje: 16,
    iva: 160,
    total: 1160,
    costoManual: 1000,
    costoRuteo: 0,
    costoTotal: 1000,
    utilidadImporte: 0,
    utilidadPorcentaje: 0,
    utilidadObjetivoPorcentaje: 30,
    precioMinimoRecomendado: 1300,
    bajoObjetivo: true,
    moneda: 'MXN',
    ...parcial,
  };
}

function revision(parcial: Record<string, unknown>) {
  return {
    propuestaId: PROPUESTA_ID,
    motivoCreacion: null,
    snapshotCabecera: { ivaPorcentaje: 16, moneda: 'MXN', empresa: 'Metales del Norte' },
    validadaEn: null,
    creadoEn: '2026-10-10T00:00:00Z',
    actualizadoEn: '2026-10-10T00:00:00Z',
    pdfs: [],
    ...parcial,
  };
}

const DETALLE = {
  propuesta: {
    id: PROPUESTA_ID,
    folioCnc: 'CNC-0001',
    estado: 'SENT',
    revisionVigenteId: REV_A_ID,
    acceptedRevisionId: null,
    creadoEn: '2026-10-10T00:00:00Z',
  },
  revisiones: [
    revision({
      id: REV_A_ID,
      letra: 'A',
      folioRevision: 'CNC-0001-A',
      estado: 'SENT',
      validadaEn: '2026-10-11T00:00:00Z',
      // Bajo objetivo: antes esta fila mostraba el porcentaje en rojo y el precio mínimo.
      totales: totales({ utilidadPorcentaje: 0.1, precioMinimoRecomendado: 1300, bajoObjetivo: true }),
    }),
    revision({
      id: REV_B_ID,
      letra: 'B',
      folioRevision: 'CNC-0001-B',
      estado: 'DRAFT',
      motivoCreacion: 'El cliente pidió ajustar precios',
      totales: totales({
        subtotal: 2000,
        iva: 320,
        total: 2320,
        utilidadPorcentaje: 1,
        precioMinimoRecomendado: 1300,
        bajoObjetivo: false,
      }),
    }),
  ],
  items: [],
  ruteo: [],
  costos: [],
  acciones: [],
  eventos: [],
  archivosPropios: [],
  archivosHeredados: [],
  archivosPorItem: [],
  canalRfq: null,
  utilidadObjetivoPorcentaje: 30,
} as unknown as DetallePropuestaFicha;

function montar() {
  return render(createElement(FichaPropuesta, { propuestaId: PROPUESTA_ID, permisos: PERMISOS }));
}

beforeEach(() => {
  vi.clearAllMocks();
  propuestaMock.mockReturnValue({
    isLoading: false,
    data: { exito: true, datos: DETALLE },
  });
  catalogosMock.mockReturnValue({ data: undefined, error: null });
});

afterEach(() => {
  cleanup();
});

describe('FichaPropuesta — historial de versiones sin utilidad ni precio mínimo (obs. cliente 2026-10-21)', () => {
  it('conserva las columnas de la versión, los importes de venta y la acción Ver', () => {
    montar();

    const historial = screen.getByTestId('historial-versiones-propuesta');
    expect(within(historial).getByText('Historial de versiones')).toBeDefined();

    const encabezados = within(screen.getByTestId('tabla-revisiones-propuesta'))
      .getAllByRole('columnheader')
      .map((celda) => celda.textContent);
    expect(encabezados).toEqual([
      'Versión',
      'Estado',
      'Motivo',
      'Subtotal de venta',
      'Total cliente',
      'Validada',
      'Acciones',
    ]);

    const filaA = within(historial).getByText('CNC-0001-A').closest('tr') as HTMLElement;
    expect(within(filaA).getByText('$1,000.00')).toBeDefined();
    expect(within(filaA).getByText('$1,160.00')).toBeDefined();
    const filaB = within(historial).getByText('CNC-0001-B').closest('tr') as HTMLElement;
    expect(within(filaB).getByText('$2,000.00')).toBeDefined();
    expect(within(filaB).getByText('$2,320.00')).toBeDefined();
    expect(within(filaB).getByText('El cliente pidió ajustar precios')).toBeDefined();
    expect(within(historial).getByRole('button', { name: 'Ver versión CNC-0001-A' })).toBeDefined();
    expect(within(historial).getByRole('button', { name: 'Ver versión CNC-0001-B' })).toBeDefined();
  });

  it('no muestra utilidad estimada, precio mínimo recomendado ni alerta de objetivo', () => {
    montar();

    const historial = screen.getByTestId('historial-versiones-propuesta');
    expect(historial.querySelector('[data-testid^="utilidad-revision-"]')).toBeNull();
    expect(historial.querySelector('[data-bajo-objetivo]')).toBeNull();
    expect(within(historial).queryByText(/utilidad/i)).toBeNull();
    expect(within(historial).queryByText(/precio m[ií]nimo/i)).toBeNull();
    expect(within(historial).queryByText(/objetivo/i)).toBeNull();
    expect(within(historial).queryByText('$1,300.00')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('«Ver» sigue abriendo la versión elegida como solo lectura del historial', () => {
    montar();

    const pestanaB = screen.getByRole('button', { name: /^B · Borrador/ });
    expect(pestanaB.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Ver versión CNC-0001-B' }));

    expect(pestanaB.getAttribute('aria-pressed')).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Ver versión CNC-0001-B' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
