import { describe, expect, it } from 'vitest';

import {
  esquemaCrearCompra,
  esquemaEstadoCompra,
  esquemaPagarCompra,
} from '@/modulos/compras/validaciones/esquemas-compras';

const PROVEEDOR = '00000000-0000-4000-8000-000000000001';

function compra(extra: Record<string, unknown> = {}) {
  return {
    proveedorId: PROVEEDOR,
    montoSubtotal: 100,
    montoIva: 16,
    moneda: 'MXN',
    tipoCambio: 1,
    ...extra,
  };
}

describe('esquemas de compras (SII-B8 F4)', () => {
  it('acepta montos coherentes y rechaza negativos o extra', () => {
    expect(esquemaCrearCompra.safeParse(compra()).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra({ montoSubtotal: -1 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ extra: 1 })).success).toBe(false);
  });

  it('un monto MXN exige tipo de cambio 1', () => {
    expect(esquemaCrearCompra.safeParse(compra({ tipoCambio: 18.5 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ moneda: 'USD', tipoCambio: 18.5 })).success).toBe(true);
  });

  it('la cancelación exige motivo de 3+ caracteres', () => {
    const base = { compraId: PROVEEDOR, actualizadoEn: '2026-10-06T10:00:00.000Z' };
    expect(esquemaEstadoCompra.safeParse({ ...base, estado: 'CONFIRMADA' }).success).toBe(true);
    expect(esquemaEstadoCompra.safeParse({ ...base, estado: 'CANCELADA', motivo: 'no' }).success).toBe(false);
    expect(esquemaEstadoCompra.safeParse({ ...base, estado: 'CANCELADA', motivo: 'Duplicada' }).success).toBe(true);
  });

  it('el pago exige monto positivo y método válido', () => {
    const base = { compraId: PROVEEDOR };
    expect(esquemaPagarCompra.safeParse({ ...base, monto: 50, metodoPago: 'transferencia' }).success).toBe(true);
    expect(esquemaPagarCompra.safeParse({ ...base, monto: 0, metodoPago: 'transferencia' }).success).toBe(false);
    expect(esquemaPagarCompra.safeParse({ ...base, monto: 50, metodoPago: 'otro' }).success).toBe(false);
  });
});

const ORDEN = '00000000-0000-4000-8000-000000000002';
const MATERIAL = '00000000-0000-4000-8000-000000000003';

describe('esquemas de compras (C10.1/F06/F08)', () => {
  it('con Orden exige rubro de costo; sin Orden puede quedar sin rubro', () => {
    expect(esquemaCrearCompra.safeParse(compra({ ordenId: ORDEN })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ ordenId: ORDEN, rubroCosto: 'material' })).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra()).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra({ ordenId: ORDEN, rubroCosto: 'otro' })).success).toBe(false);
  });

  it('los rubros válidos son material, subcontratación y gastos directos', () => {
    for (const rubroCosto of ['material', 'subcontratacion', 'gastos_directos']) {
      expect(esquemaCrearCompra.safeParse(compra({ ordenId: ORDEN, rubroCosto })).success, rubroCosto).toBe(true);
    }
  });

  it('la cantidad debe ser positiva y el costo unitario no negativo', () => {
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 0 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: -2 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 2, costoUnitario: -1 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 2, costoUnitario: 50, concepto: 'Placa' })).success).toBe(true);
  });

  it('con cantidad y costo unitario el subtotal debe cuadrar con tolerancia 0.01', () => {
    const detalle = { cantidad: 2, costoUnitario: 100, concepto: 'Placa de acero' };
    expect(esquemaCrearCompra.safeParse(compra({ montoSubtotal: 200, ...detalle })).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra({ montoSubtotal: 200.01, ...detalle })).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra({ montoSubtotal: 200.02, ...detalle })).success).toBe(false);
  });

  it('el detalle de material exige concepto o material del catálogo', () => {
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 2 })).success).toBe(false);
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 2, materialId: MATERIAL })).success).toBe(true);
    expect(esquemaCrearCompra.safeParse(compra({ cantidad: 2, concepto: 'Servicio de corte' })).success).toBe(true);
  });
});
