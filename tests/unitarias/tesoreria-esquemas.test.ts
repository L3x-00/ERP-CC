import { describe, expect, it } from 'vitest';

import {
  esquemaConciliacion,
  esquemaDesconciliacion,
  esquemaSaldoInicial,
  esquemaTransferencia,
} from '@/modulos/tesoreria/validaciones/esquemas-tesoreria';

const CUENTA_A = '00000000-0000-4000-8000-000000000001';
const CUENTA_B = '00000000-0000-4000-8000-000000000002';

describe('esquemas de tesorería (SII-B8 F5)', () => {
  it('el saldo inicial exige moneda coherente con TC', () => {
    expect(esquemaSaldoInicial.safeParse({
      cuentaId: CUENTA_A, monto: 1000, moneda: 'MXN', tipoCambio: 1, fecha: '2026-10-06',
    }).success).toBe(true);
    expect(esquemaSaldoInicial.safeParse({
      cuentaId: CUENTA_A, monto: 1000, moneda: 'MXN', tipoCambio: 18.5, fecha: '2026-10-06',
    }).success).toBe(false);
    expect(esquemaSaldoInicial.safeParse({
      cuentaId: CUENTA_A, monto: -1, moneda: 'MXN', tipoCambio: 1, fecha: '2026-10-06',
    }).success).toBe(false);
  });

  it('la transferencia exige cuentas distintas y monto positivo', () => {
    expect(esquemaTransferencia.safeParse({
      cuentaOrigenId: CUENTA_A, cuentaDestinoId: CUENTA_B, monto: 100,
    }).success).toBe(true);
    expect(esquemaTransferencia.safeParse({
      cuentaOrigenId: CUENTA_A, cuentaDestinoId: CUENTA_A, monto: 100,
    }).success).toBe(false);
    expect(esquemaTransferencia.safeParse({
      cuentaOrigenId: CUENTA_A, cuentaDestinoId: CUENTA_B, monto: 0,
    }).success).toBe(false);
  });

  it('conciliación y desconciliación validan entidad del catálogo', () => {
    expect(esquemaConciliacion.safeParse({
      cuentaId: CUENTA_A, entidad: 'cobro', entidadId: CUENTA_B,
    }).success).toBe(true);
    expect(esquemaConciliacion.safeParse({
      cuentaId: CUENTA_A, entidad: 'otra', entidadId: CUENTA_B,
    }).success).toBe(false);
    expect(esquemaDesconciliacion.safeParse({ entidad: 'gasto', entidadId: CUENTA_B }).success).toBe(true);
  });
});
