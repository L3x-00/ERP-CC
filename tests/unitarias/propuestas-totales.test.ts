import { describe, expect, it } from 'vitest';

import {
  calcularTotalesPropuesta,
  resumirCostosRevision,
  type ItemCalculablePropuesta,
} from '@/modulos/propuestas/servicios/calcular-totales-propuesta';

/**
 * Subtotal, IVA y total comparten tabla de casos con
 * `supabase/tests/sii_b4_propuestas.test.sql` (mismos importes y mismo redondeo):
 * si una cambia, la otra debe cambiar. La utilidad sobre costo es solo del
 * dominio TS (el SQL no la calcula; las órdenes solo usan subtotal/total).
 */
type Caso = {
  nombre: string;
  items: ItemCalculablePropuesta[];
  costoTotal: number;
  ivaPorcentaje: number;
  esperado: {
    subtotal: number;
    iva: number;
    total: number;
    utilidadImporte: number;
    utilidadPorcentaje: number | null;
  };
};

const CASOS: Caso[] = [
  {
    nombre: 'sin ítems ni costo: utilidad % nula (nunca NaN ni Infinity)',
    items: [],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 0, iva: 0, total: 0, utilidadImporte: 0, utilidadPorcentaje: null },
  },
  {
    nombre: 'ítem simple con IVA 16 y sin costo capturado: utilidad % no calculable',
    items: [{ cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true }],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 1005, iva: 160.8, total: 1165.8, utilidadImporte: 1005, utilidadPorcentaje: null },
  },
  {
    nombre: 'descuento restado del subtotal y utilidad sobre costo a 4 decimales',
    items: [
      { cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true },
      { cantidad: 1, precioUnitario: 20, esDescuento: true, activo: true },
    ],
    costoTotal: 500,
    ivaPorcentaje: 16,
    // (985 − 500) / 500 = 0.97
    esperado: { subtotal: 985, iva: 157.6, total: 1142.6, utilidadImporte: 485, utilidadPorcentaje: 0.97 },
  },
  {
    nombre: 'los ítems inactivos no cuentan',
    items: [
      { cantidad: 10, precioUnitario: 100.5, esDescuento: false, activo: true },
      { cantidad: 1, precioUnitario: 20, esDescuento: true, activo: true },
      { cantidad: 99, precioUnitario: 1000, esDescuento: false, activo: false },
      { cantidad: 5, precioUnitario: 50, esDescuento: true, activo: false },
    ],
    costoTotal: 500,
    ivaPorcentaje: 16,
    esperado: { subtotal: 985, iva: 157.6, total: 1142.6, utilidadImporte: 485, utilidadPorcentaje: 0.97 },
  },
  {
    nombre: 'redondeo a 2 decimales del subtotal y del IVA',
    items: [{ cantidad: 3, precioUnitario: 33.3333, esDescuento: false, activo: true }],
    costoTotal: 0,
    ivaPorcentaje: 16,
    esperado: { subtotal: 100, iva: 16, total: 116, utilidadImporte: 100, utilidadPorcentaje: null },
  },
  {
    nombre: 'costo mayor a la venta: utilidad negativa sobre costo',
    items: [{ cantidad: 1, precioUnitario: 100, esDescuento: false, activo: true }],
    costoTotal: 150,
    ivaPorcentaje: 8,
    // (100 − 150) / 150 = −0.3333…
    esperado: { subtotal: 100, iva: 8, total: 108, utilidadImporte: -50, utilidadPorcentaje: -0.3333 },
  },
  {
    nombre: 'caso de la ficha: venta 7,000 y costo 7,150 → −2.10 %',
    items: [{ cantidad: 1, precioUnitario: 7000, esDescuento: false, activo: true }],
    costoTotal: 7150,
    ivaPorcentaje: 16,
    esperado: { subtotal: 7000, iva: 1120, total: 8120, utilidadImporte: -150, utilidadPorcentaje: -0.021 },
  },
];

describe('calcularTotalesPropuesta (subtotal/IVA/total espejo del SQL + utilidad sobre costo)', () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      const totales = calcularTotalesPropuesta({
        items: caso.items,
        costoTotal: caso.costoTotal,
        ivaPorcentaje: caso.ivaPorcentaje,
        moneda: 'MXN',
      });

      expect(totales.subtotal).toBe(caso.esperado.subtotal);
      expect(totales.iva).toBe(caso.esperado.iva);
      expect(totales.total).toBe(caso.esperado.total);
      expect(totales.utilidadImporte).toBe(caso.esperado.utilidadImporte);
      expect(totales.utilidadPorcentaje).toBe(caso.esperado.utilidadPorcentaje);
    });
  }

  it('conserva la moneda de la propuesta', () => {
    const totales = calcularTotalesPropuesta({
      items: [{ cantidad: 1, precioUnitario: 100, esDescuento: false, activo: true }],
      costoTotal: 0,
      ivaPorcentaje: 16,
      moneda: 'USD',
    });
    expect(totales.moneda).toBe('USD');
  });

  it('separa bruto y descuento', () => {
    const totales = calcularTotalesPropuesta({
      items: [
        { cantidad: 2, precioUnitario: 100, esDescuento: false, activo: true },
        { cantidad: 1, precioUnitario: 25, esDescuento: true, activo: true },
      ],
      costoTotal: 0,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.bruto).toBe(200);
    expect(totales.descuento).toBe(25);
    expect(totales.subtotal).toBe(175);
  });
});

describe('calcularTotalesPropuesta — utilidad estimada sobre costo y precio mínimo', () => {
  const ITEM_7000: ItemCalculablePropuesta[] = [
    { cantidad: 1, precioUnitario: 7000, esDescuento: false, activo: true },
  ];

  it('el IVA queda fuera: la utilidad usa la venta sin IVA', () => {
    const conIva16 = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 5000,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    const conIva0 = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 5000,
      ivaPorcentaje: 0,
      moneda: 'MXN',
    });
    expect(conIva16.utilidadImporte).toBe(2000);
    expect(conIva16.utilidadPorcentaje).toBe(0.4);
    expect(conIva0.utilidadPorcentaje).toBe(conIva16.utilidadPorcentaje);
  });

  it('con el objetivo por defecto (30 %) el precio mínimo es costo × 1.30', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 7150,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.utilidadObjetivoPorcentaje).toBe(30);
    expect(totales.precioMinimoRecomendado).toBe(9295);
    expect(totales.bajoObjetivo).toBe(true);
  });

  it('el objetivo es configurable sin cambiar código', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 5000,
      ivaPorcentaje: 16,
      utilidadObjetivoPorcentaje: 50,
      moneda: 'MXN',
    });
    expect(totales.utilidadObjetivoPorcentaje).toBe(50);
    expect(totales.precioMinimoRecomendado).toBe(7500);
    // 40 % < 50 % → alerta; con el 30 % por defecto no la habría.
    expect(totales.bajoObjetivo).toBe(true);
  });

  it('exactamente en el objetivo no es alerta', () => {
    const totales = calcularTotalesPropuesta({
      items: [{ cantidad: 1, precioUnitario: 1300, esDescuento: false, activo: true }],
      costoTotal: 1000,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.utilidadPorcentaje).toBe(0.3);
    expect(totales.precioMinimoRecomendado).toBe(1300);
    expect(totales.bajoObjetivo).toBe(false);
  });

  it('por encima del objetivo no es alerta', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 5000,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.bajoObjetivo).toBe(false);
  });

  it('sin costo no hay precio mínimo ni alerta (no se puede calcular)', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 0,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.utilidadPorcentaje).toBeNull();
    expect(totales.precioMinimoRecomendado).toBeNull();
    expect(totales.bajoObjetivo).toBe(false);
  });

  it('un objetivo inválido cae al valor por defecto', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEM_7000,
      costoTotal: 1000,
      ivaPorcentaje: 16,
      utilidadObjetivoPorcentaje: Number.NaN,
      moneda: 'MXN',
    });
    expect(totales.utilidadObjetivoPorcentaje).toBe(30);
  });
});

describe('resumirCostosRevision — mismo costo en Ítems, Ruteo/Costeo y Resumen', () => {
  const ruteo = [
    { itemId: 'a', costeadoEn: '2026-10-20T10:00:00Z', costoTotal: 2375 },
    { itemId: 'a', costeadoEn: '2026-10-20T10:00:00Z', costoTotal: 2975 },
    { itemId: 'b', costeadoEn: null, costoTotal: null },
    { itemId: 'inactivo', costeadoEn: '2026-10-20T10:00:00Z', costoTotal: 999 },
  ];
  const costos = [
    { categoria: 'material' as const, monto: 1500 },
    { categoria: 'gastos_directos' as const, monto: 300 },
    { categoria: 'maquina' as const, monto: 800 },
  ];

  it('suma el ruteo costeado de los ítems activos y descarta el manual de máquina', () => {
    const resumen = resumirCostosRevision({
      idsItemsActivos: new Set(['a', 'b']),
      costos,
      ruteo,
    });
    expect(resumen.costoRuteo).toBe(5350);
    expect(resumen.ruteoCosteado).toBe(true);
    expect(resumen.costoTotal).toBe(2600);
    expect(resumen.costoManualMaquina).toBe(800);

    const totales = calcularTotalesPropuesta({
      items: [{ cantidad: 1, precioUnitario: 7000, esDescuento: false, activo: true }],
      ...resumen,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    // 1,500 + 300 (sin máquina manual) + 5,350 de ruteo = 7,150 (caso de la ficha).
    expect(totales.costoTotal).toBe(7150);
    expect(totales.utilidadPorcentaje).toBe(-0.021);
  });

  it('sin ruteo costeado conserva el costo manual de máquina', () => {
    const resumen = resumirCostosRevision({
      idsItemsActivos: new Set(['b']),
      costos,
      ruteo,
    });
    expect(resumen.ruteoCosteado).toBe(false);
    expect(resumen.costoRuteo).toBe(0);

    const totales = calcularTotalesPropuesta({
      items: [{ cantidad: 1, precioUnitario: 7000, esDescuento: false, activo: true }],
      ...resumen,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.costoTotal).toBe(2600);
  });
});
