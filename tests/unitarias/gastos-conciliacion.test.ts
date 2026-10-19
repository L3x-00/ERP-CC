// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TablaConciliacionCostos,
  formatearMargen,
  formatearVariacionMonto,
  formatearVariacionPct,
} from '@/modulos/gastos/componentes/tabla-conciliacion-costos';
import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/indice';
import { esquemaConciliacionCostosOrden } from '@/modulos/gastos/validaciones/indice';

afterEach(cleanup);

function conciliacion(extra: Partial<ConciliacionCostosOrden> = {}): ConciliacionCostosOrden {
  return {
    ordenId: '11111111-1111-4111-8111-111111111111',
    esInterna: false,
    tieneEstimado: true,
    moneda: 'MXN',
    tipoCambio: 1,
    ventaBaseEstimadoMxn: 20000,
    ventaBaseRealMxn: 20000,
    conceptos: [
      {
        concepto: 'material',
        estimado: 5000,
        comprometido: 5450,
        real: 5450,
        variacionAbs: 450,
        variacionPct: 9,
        fuentes: ['compra', 'consumo'],
      },
      {
        concepto: 'fabricacion',
        estimado: 2000,
        comprometido: 0,
        real: 1800,
        variacionAbs: -200,
        variacionPct: -10,
        fuentes: ['sesion'],
      },
      {
        concepto: 'subcontratacion',
        estimado: 0,
        comprometido: 0,
        real: 500,
        variacionAbs: 500,
        variacionPct: null,
        fuentes: ['gasto'],
      },
      {
        concepto: 'gastos_directos',
        estimado: 800,
        comprometido: 0,
        real: 650,
        variacionAbs: -150,
        variacionPct: -18.75,
        fuentes: ['gasto'],
      },
    ],
    totales: {
      estimado: 7800,
      comprometido: 5450,
      real: 8400,
      variacionAbs: 600,
      variacionPct: 7.6923,
    },
    margenEstimadoPct: 61,
    margenRealPct: 58,
    avisos: {
      comprasSinRubro: { n: 1, importe: 200 },
      comprasPagadasSinRecepcion: { n: 0, importe: 0 },
      gastosIncluidosEnRubros: { n: 1, importe: 1000 },
    },
    ...extra,
  };
}

describe('contrato de la conciliación (C10.2)', () => {
  it('acepta el payload del ejemplo y rechaza conceptos o fuentes inválidas', () => {
    expect(esquemaConciliacionCostosOrden.safeParse(conciliacion()).success).toBe(true);
    expect(esquemaConciliacionCostosOrden.safeParse({
      ...conciliacion(),
      conceptos: [{ ...conciliacion().conceptos[0], concepto: 'otro' }],
    }).success).toBe(false);
    expect(esquemaConciliacionCostosOrden.safeParse({
      ...conciliacion(),
      conceptos: [{ ...conciliacion().conceptos[0], fuentes: ['otra'] }],
    }).success).toBe(false);
    expect(esquemaConciliacionCostosOrden.safeParse({ ...conciliacion(), extra: 1 }).success).toBe(false);
  });

  it('exige las cuatro filas de concepto', () => {
    expect(esquemaConciliacionCostosOrden.safeParse({
      ...conciliacion(),
      conceptos: conciliacion().conceptos.slice(0, 3),
    }).success).toBe(false);
  });
});

describe('formato de variaciones y márgenes', () => {
  it('antepone el signo y deja la raya cuando no hay dato', () => {
    expect(formatearVariacionMonto(450)).toBe('+$450.00');
    expect(formatearVariacionMonto(-450)).toBe('-$450.00');
    expect(formatearVariacionMonto(0)).toBe('$0.00');
    expect(formatearVariacionMonto(null)).toBe('—');
    expect(formatearVariacionPct(9)).toBe('+9.0 %');
    expect(formatearVariacionPct(-10)).toBe('-10.0 %');
    expect(formatearVariacionPct(0)).toBe('0.0 %');
    expect(formatearVariacionPct(null)).toBe('—');
    expect(formatearMargen(61)).toBe('61.0 %');
    expect(formatearMargen(null)).toBe('No calculable');
  });
});

describe('tabla de conciliación', () => {
  it('muestra el ejemplo del cliente con fuente y variación por fila', () => {
    render(createElement(TablaConciliacionCostos, { datos: conciliacion() }));

    expect(screen.getByTestId('conciliacion-fila-material')).toBeTruthy();
    expect(screen.getByTestId('conciliacion-material-estimado').textContent).toBe('$5,000.00');
    expect(screen.getByTestId('conciliacion-material-comprometido').textContent).toBe('$5,450.00');
    expect(screen.getByTestId('conciliacion-material-real').textContent).toBe('$5,450.00');
    expect(screen.getByTestId('conciliacion-material-variacion').textContent).toBe('+$450.00');
    expect(screen.getByTestId('conciliacion-material-variacion-pct').textContent).toBe('+9.0 %');
    expect(screen.getByTestId('conciliacion-material-fuente').textContent).toBe('Compra · Consumo');
    expect(screen.getByTestId('conciliacion-fabricacion-variacion').textContent).toBe('-$200.00');
    expect(screen.getByTestId('conciliacion-subcontratacion-variacion-pct').textContent).toBe('—');
    expect(screen.getByTestId('conciliacion-total-estimado').textContent).toBe('$7,800.00');
    expect(screen.getByTestId('conciliacion-total-real').textContent).toBe('$8,400.00');
    expect(screen.getByTestId('conciliacion-total-variacion').textContent).toBe('+$600.00');
    expect(screen.getByTestId('conciliacion-total-variacion-pct').textContent).toBe('+7.7 %');
    expect(screen.getByTestId('conciliacion-margen-estimado').textContent).toBe('61.0 %');
    expect(screen.getByTestId('conciliacion-margen-real').textContent).toBe('58.0 %');
    expect(screen.getByTestId('conciliacion-pie-ajuste').textContent).toContain('Ajuste manual');
  });

  it('avisa compras sin rubro y gastos ya incluidos', () => {
    render(createElement(TablaConciliacionCostos, { datos: conciliacion() }));

    expect(screen.getByTestId('conciliacion-aviso-compras-sin-rubro').textContent).toContain('1 compra');
    expect(screen.getByTestId('conciliacion-aviso-gastos-incluidos').textContent).toContain('1 gasto');
  });

  it('oculta la tabla de una Orden interna', () => {
    const { container } = render(createElement(TablaConciliacionCostos, {
      datos: conciliacion({ esInterna: true }),
    }));
    expect(container.innerHTML).toBe('');
  });

  it('sin Propuesta muestra Sin estimado y no ceros', () => {
    render(createElement(TablaConciliacionCostos, {
      datos: conciliacion({
        tieneEstimado: false,
        conceptos: conciliacion().conceptos.map((fila) => ({
          ...fila,
          estimado: null,
          variacionAbs: null,
          variacionPct: null,
        })),
        totales: { ...conciliacion().totales, estimado: null, variacionAbs: null, variacionPct: null },
        margenEstimadoPct: null,
      }),
    }));

    expect(screen.getByTestId('conciliacion-sin-estimado').textContent).toContain('Sin estimado');
    expect(screen.getByTestId('conciliacion-material-estimado').textContent).toBe('Sin estimado');
    expect(screen.getByTestId('conciliacion-margen-estimado').textContent).toBe('No calculable');
  });
});
