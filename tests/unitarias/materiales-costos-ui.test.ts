// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type {
  MaterialCosto,
  PropuestaCostoMaterial,
  VersionCostoMaterial,
} from '@/modulos/inventario/tipos/materiales-costos';
import { ModalConfirmarCosto } from '@/modulos/inventario/componentes/modal-confirmar-costo';
import { TablaHistorialCostos } from '@/modulos/inventario/componentes/tabla-historial-costos';
import { TablaMaterialesCostos } from '@/modulos/inventario/componentes/tabla-materiales-costos';
import { TablaPropuestasCosto } from '@/modulos/inventario/componentes/tabla-propuestas-costo';
import {
  etiquetaFuenteCosto,
  formatearFechaDia,
} from '@/modulos/inventario/utilidades/materiales-costos';

afterEach(cleanup);

const MATERIAL_CON_COSTO: MaterialCosto = {
  id: 'm-1',
  codigo: 'ACERO',
  nombre: 'Acero',
  activo: true,
  unidadBase: 'kg',
  monedaCosto: 'USD',
  costoVigente: 12.5,
  fechaVigenciaCosto: '2026-10-15',
  costoConfirmadoEn: '2026-10-10T12:00:00+00:00',
  costoConfirmadoPorNombre: 'Ana QA',
  actualizadoEn: '2026-10-10T12:00:00+00:00',
  propuestasPendientes: 2,
};

const MATERIAL_SIN_COSTO: MaterialCosto = {
  ...MATERIAL_CON_COSTO,
  id: 'm-2',
  codigo: 'MDF',
  nombre: 'MDF',
  monedaCosto: 'MXN',
  costoVigente: null,
  fechaVigenciaCosto: null,
  costoConfirmadoPorNombre: null,
  propuestasPendientes: 0,
};

const PROPUESTA: PropuestaCostoMaterial = {
  id: 'p-1',
  materialId: 'm-1',
  materialCodigo: 'ACERO',
  materialNombre: 'Acero',
  costoPropuesto: 20,
  moneda: 'MXN',
  fechaEfectiva: '2026-10-20',
  fuente: 'COMPRA',
  referencia: 'OC-100',
  propuestoPorNombre: 'Luis Compras',
  propuestoEn: '2026-10-11T09:00:00+00:00',
};

const VERSION: VersionCostoMaterial = {
  id: 'h-1',
  materialId: 'm-1',
  materialCodigo: 'ACERO',
  materialNombre: 'Acero',
  costoAnterior: null,
  monedaAnterior: null,
  costoNuevo: 12.5,
  monedaNueva: 'USD',
  fechaEfectiva: '2026-10-15',
  fuente: 'MANUAL',
  referencia: null,
  actorNombre: 'Ana QA',
  confirmadoEn: '2026-10-10T12:00:00+00:00',
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

describe('TablaMaterialesCostos (C6.1)', () => {
  it('sin permiso no ofrece proponer ni costo manual; mantiene el historial', () => {
    render(
      createElement(TablaMaterialesCostos, {
        materiales: [MATERIAL_CON_COSTO, MATERIAL_SIN_COSTO],
        puedeGestionar: false,
        onProponer: vi.fn(),
        onCostoManual: vi.fn(),
        onHistorial: vi.fn(),
      }),
    );

    expect(screen.getByText('Acero')).toBeDefined();
    expect(screen.getByText('Sin costo')).toBeDefined();
    expect(screen.getByText('Ana QA')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Proponer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Costo manual' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Historial' })).toHaveLength(2);
  });

  it('con permiso abre proponer, costo manual e historial del material correcto', () => {
    const onProponer = vi.fn();
    const onCostoManual = vi.fn();
    const onHistorial = vi.fn();
    render(
      createElement(TablaMaterialesCostos, {
        materiales: [MATERIAL_CON_COSTO, MATERIAL_SIN_COSTO],
        puedeGestionar: true,
        onProponer,
        onCostoManual,
        onHistorial,
      }),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Proponer' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Costo manual' })[1]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Historial' })[0]!);

    expect(onProponer.mock.calls[0]?.[0]).toMatchObject({ id: 'm-1' });
    expect(onCostoManual.mock.calls[0]?.[0]).toMatchObject({ id: 'm-2' });
    expect(onHistorial.mock.calls[0]?.[0]).toMatchObject({ id: 'm-1' });
  });
});

describe('TablaPropuestasCosto (C6.1/DC-13)', () => {
  it('muestra la propuesta y permite confirmarla con permiso', () => {
    const onConfirmar = vi.fn();
    render(
      createElement(TablaPropuestasCosto, {
        propuestas: [PROPUESTA],
        puedeGestionar: true,
        confirmandoId: null,
        onConfirmar,
      }),
    );

    expect(screen.getByText('OC-100')).toBeDefined();
    expect(screen.getByText('Compra')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirmar.mock.calls[0]?.[0]).toMatchObject({ id: 'p-1' });
  });

  it('sin permiso queda en solo lectura', () => {
    render(
      createElement(TablaPropuestasCosto, {
        propuestas: [PROPUESTA],
        puedeGestionar: false,
        confirmandoId: null,
        onConfirmar: vi.fn(),
      }),
    );

    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(screen.getByText('Solo lectura')).toBeDefined();
  });
});

describe('TablaHistorialCostos (C6.1)', () => {
  it('muestra el cambio sin costo anterior y permite quitar el filtro', () => {
    const onQuitarFiltro = vi.fn();
    render(
      createElement(TablaHistorialCostos, {
        versiones: [VERSION],
        materialFiltro: { codigo: 'ACERO', nombre: 'Acero' },
        onQuitarFiltro,
      }),
    );

    expect(screen.getByText(/Sin costo anterior/)).toBeDefined();
    expect(screen.getByText(/12\.5000/)).toBeDefined();
    expect(screen.getByText('Manual')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todo el historial' }));
    expect(onQuitarFiltro).toHaveBeenCalledTimes(1);
  });

  it('explica el estado vacío', () => {
    render(
      createElement(TablaHistorialCostos, {
        versiones: [],
        materialFiltro: null,
        onQuitarFiltro: vi.fn(),
      }),
    );
    expect(screen.getByText('Sin costos confirmados en el historial.')).toBeDefined();
  });
});

describe('ModalConfirmarCosto (C6.1)', () => {
  it('en modo propuesta muestra el resumen de solo lectura y confirma con sus datos', () => {
    render(
      envolver(
        createElement(ModalConfirmarCosto, {
          modo: 'propuesta',
          material: MATERIAL_CON_COSTO,
          propuesta: PROPUESTA,
          onCerrar: vi.fn(),
        }),
      ),
    );

    expect(screen.getByRole('heading', { name: /Confirmar propuesta/ })).toBeDefined();
    expect(screen.getByText('OC-100')).toBeDefined();
    expect(screen.getByText('Luis Compras')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmar propuesta' })).toBeDefined();
    expect(screen.queryByLabelText('Costo')).toBeNull();
  });

  it('en modo manual expone los campos editables y advierte el efecto', () => {
    render(
      envolver(
        createElement(ModalConfirmarCosto, {
          modo: 'manual',
          material: MATERIAL_CON_COSTO,
          onCerrar: vi.fn(),
        }),
      ),
    );

    expect(screen.getByLabelText('Costo')).toBeDefined();
    expect(screen.getByLabelText('Moneda')).toBeDefined();
    expect(screen.getByLabelText('Fecha efectiva')).toBeDefined();
    expect(screen.getByLabelText(/Referencia/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmar costo' })).toBeDefined();
  });
});

describe('utilidades de materiales y costos', () => {
  it('formatea la fecha calendario en UTC y tolera valores raros', () => {
    expect(formatearFechaDia('2026-10-15')).toBe('15 de octubre de 2026');
    expect(formatearFechaDia(null)).toBe('—');
    expect(formatearFechaDia('2026-13-40')).toBe('—');
  });

  it('traduce la fuente del costo', () => {
    expect(etiquetaFuenteCosto('MANUAL')).toBe('Manual');
    expect(etiquetaFuenteCosto('COMPRA')).toBe('Compra');
    expect(etiquetaFuenteCosto('GASTO')).toBe('Gasto');
  });
});
