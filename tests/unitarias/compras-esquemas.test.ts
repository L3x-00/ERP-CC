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
