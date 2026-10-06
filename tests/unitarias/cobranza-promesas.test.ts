import { describe, expect, it } from 'vitest';

import {
  esquemaCancelarPromesa,
  esquemaCobroMultiple,
  esquemaCrearPromesa,
} from '@/modulos/cobranza/validaciones/promesas';

const CUENTA_A = '00000000-0000-4000-8000-000000000001';
const CUENTA_B = '00000000-0000-4000-8000-000000000002';

function cobro(extra: Record<string, unknown> = {}) {
  return {
    clienteId: '00000000-0000-4000-8000-000000000010',
    montoPagado: 100,
    monedaPago: 'MXN',
    tipoCambio: 1,
    metodoPago: 'transferencia',
    aplicaciones: [{ cuentaId: CUENTA_A, monto: 100 }],
    ...extra,
  };
}

describe('esquemas de promesas de pago (SII-B8 F3)', () => {
  it('exige fecha ISO de calendario y monto positivo', () => {
    expect(esquemaCrearPromesa.safeParse({
      cuentaId: CUENTA_A, fechaPrometida: '2026-11-30', monto: 50,
    }).success).toBe(true);
    expect(esquemaCrearPromesa.safeParse({
      cuentaId: CUENTA_A, fechaPrometida: '30/11/2026', monto: 50,
    }).success).toBe(false);
    expect(esquemaCrearPromesa.safeParse({
      cuentaId: CUENTA_A, fechaPrometida: '2026-11-30', monto: 0,
    }).success).toBe(false);
  });

  it('la cancelación exige motivo de 3+ caracteres', () => {
    const base = { promesaId: CUENTA_A };
    expect(esquemaCancelarPromesa.safeParse({ ...base, motivo: 'Cliente pidió' }).success).toBe(true);
    expect(esquemaCancelarPromesa.safeParse({ ...base, motivo: 'no' }).success).toBe(false);
  });
});

describe('esquema de cobro múltiple (SII-B8 F3)', () => {
  it('acepta varias AR del mismo cliente y rechaza repetidas o vacías', () => {
    expect(esquemaCobroMultiple.safeParse(cobro({
      aplicaciones: [
        { cuentaId: CUENTA_A, monto: 60 },
        { cuentaId: CUENTA_B, monto: 40 },
      ],
    })).success).toBe(true);
    expect(esquemaCobroMultiple.safeParse(cobro({
      aplicaciones: [
        { cuentaId: CUENTA_A, monto: 60 },
        { cuentaId: CUENTA_A, monto: 40 },
      ],
    })).success).toBe(false);
    expect(esquemaCobroMultiple.safeParse(cobro({ aplicaciones: [] })).success).toBe(false);
  });

  it('un pago MXN exige tipo de cambio 1', () => {
    expect(esquemaCobroMultiple.safeParse(cobro({ tipoCambio: 18.5 })).success).toBe(false);
    expect(esquemaCobroMultiple.safeParse(cobro({
      monedaPago: 'USD', tipoCambio: 18.5,
    })).success).toBe(true);
  });
});
