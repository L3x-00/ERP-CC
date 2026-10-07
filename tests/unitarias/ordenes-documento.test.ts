import { describe, expect, it } from 'vitest';

import { comercialDesdeSnapshot } from '@/modulos/ordenes/servicios/documento-orden-servicio';

const SNAPSHOT_COMERCIAL = {
  version: 1,
  origen: { propuesta_folio: 'CNC-1026_01-A' },
  cabecera: {
    folio_legacy: 'RFQ-1026_01',
    iva_porcentaje: 16,
    moneda: 'MXN',
    contacto: { nombre: 'Ana Compras' },
    po_cliente: 'PO-7788',
  },
  totales: {
    subtotal: 900,
    descuento: 100,
    iva: 128,
    total: 928,
    iva_porcentaje: 16,
    moneda: 'MXN',
  },
  items: [
    { codigo: 'IT01', descripcion: 'Placa', cantidad: 2, precio_unitario: 500, es_descuento: false },
    { codigo: 'IT02', descripcion: 'Descuento', cantidad: 1, precio_unitario: 100, es_descuento: true },
  ],
  observaciones: 'Entregar en bodega',
};

describe('comercialDesdeSnapshot (B5 §5.4.3)', () => {
  it('lee líneas, totales y cabecera comercial congelados en el snapshot', () => {
    const comercial = comercialDesdeSnapshot(SNAPSHOT_COMERCIAL);

    expect(comercial?.lineas).toEqual([
      { descripcion: 'Placa', cantidad: 2, precioUnitario: 500, esDescuento: false },
      { descripcion: 'Descuento', cantidad: 1, precioUnitario: 100, esDescuento: true },
    ]);
    expect(comercial?.totales).toEqual({
      subtotal: 900,
      descuento: 100,
      iva: 128,
      total: 928,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(comercial?.folioCotizacion).toBe('RFQ-1026_01');
    expect(comercial?.nombreContacto).toBe('Ana Compras');
    expect(comercial?.poCliente).toBe('PO-7788');
    expect(comercial?.notas).toBe('Entregar en bodega');
  });

  it('recalcula los totales si el snapshot no los trae y respeta USD/frontera', () => {
    const comercial = comercialDesdeSnapshot({
      cabecera: { moneda: 'USD', iva_porcentaje: 8 },
      items: [{ codigo: 'IT01', descripcion: 'Pieza', cantidad: 1, precio_unitario: 100 }],
    });

    expect(comercial?.totales).toEqual({
      subtotal: 100,
      descuento: 0,
      iva: 8,
      total: 108,
      ivaPorcentaje: 8,
      moneda: 'USD',
    });
    expect(comercial?.folioCotizacion).toBeNull();
    expect(comercial?.poCliente).toBeNull();
  });

  it('devuelve null cuando no hay snapshot (histórico conserva lectura viva)', () => {
    expect(comercialDesdeSnapshot(null)).toBeNull();
    expect(comercialDesdeSnapshot({})).toBeNull();
    expect(comercialDesdeSnapshot({ items: [] })).toBeNull();
    expect(comercialDesdeSnapshot('texto')).toBeNull();
  });

  it('no inventa líneas comerciales en una orden interna sin precios', () => {
    const comercial = comercialDesdeSnapshot({
      items: [{ codigo_item: 'IT01', descripcion: 'Mantenimiento', cantidad: 1 }],
    });

    expect(comercial?.lineas).toEqual([]);
    expect(comercial?.totales).toEqual({
      subtotal: 0,
      descuento: 0,
      iva: 0,
      ivaPorcentaje: 16,
      total: 0,
      moneda: 'MXN',
    });
  });
});
