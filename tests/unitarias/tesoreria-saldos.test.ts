import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import { calcularSaldosTesoreria } from '@/modulos/tesoreria/servicios/calcular-saldos-tesoreria';
import { obtenerTesoreria } from '@/modulos/tesoreria/servicios/obtener-tesoreria';

const CUENTA = {
  id: 'cuenta-1',
  etiqueta: 'Banco · …0001 · MXN',
  tipo: 'banco' as const,
  moneda: 'MXN',
  activa: true,
  saldoInicial: 100,
};

function entrada(extra: Partial<Parameters<typeof calcularSaldosTesoreria>[0]> = {}) {
  return {
    cuentas: [CUENTA],
    cobros: [],
    pagosCompra: [],
    gastos: [],
    transferencias: [],
    conciliadoPorEntidad: new Map<string, string>(),
    ...extra,
  };
}

describe('calcularSaldosTesoreria (C10.3)', () => {
  it('saldo = inicial + cobros - pagos de compra - gastos pagados', () => {
    const datos = calcularSaldosTesoreria(entrada({
      cobros: [{
        id: 'cobro-1', cuentaId: CUENTA.id, folio: 'REC-000001', fecha: '2026-10-01',
        monto: 50, moneda: 'MXN', reversado: false, reversoId: null, reversoFecha: null,
      }],
      pagosCompra: [{
        id: 'pago-1', cuentaId: CUENTA.id, referencia: 'CG-9910_0001', fecha: '2026-10-02',
        monto: 20, moneda: 'MXN',
      }],
      gastos: [{
        id: 'gasto-1', cuentaId: CUENTA.id, referencia: 'GTO-000001', fecha: '2026-10-03',
        monto: 10, moneda: 'MXN', tipoCambio: 1,
      }],
    }));

    expect(datos.cuentas[0]?.saldoActual).toBe(120);
    expect(datos.movimientos.map((movimiento) => movimiento.signo)).toEqual([-1, -1, 1]);
  });

  it('un cobro reversado conserva original y reverso, con neto cero', () => {
    const datos = calcularSaldosTesoreria(entrada({
      cobros: [{
        id: 'cobro-1', cuentaId: CUENTA.id, folio: 'REC-000001', fecha: '2026-10-01',
        monto: 50, moneda: 'MXN', reversado: true, reversoId: 'reverso-1',
        reversoFecha: '2026-10-04',
      }],
    }));

    expect(datos.cuentas[0]?.saldoActual).toBe(100);
    const original = datos.movimientos.find((movimiento) => movimiento.entidad === 'cobro');
    const reverso = datos.movimientos.find((movimiento) => movimiento.entidad === 'reverso_cobro');
    expect(original?.reversado).toBe(true);
    expect(original?.monto).toBe(50);
    expect(reverso?.signo).toBe(-1);
    expect(reverso?.monto).toBe(50);
    expect(datos.movimientos.reduce((suma, movimiento) => suma + movimiento.signo * movimiento.monto, 0)).toBe(0);
  });

  it('un gasto USD en cuenta MXN usa el TC; una cuenta distinta se omite', () => {
    const datos = calcularSaldosTesoreria(entrada({
      gastos: [
        {
          id: 'gasto-usd', cuentaId: CUENTA.id, referencia: 'GTO-USD', fecha: '2026-10-03',
          monto: 10, moneda: 'USD', tipoCambio: 18.5,
        },
        {
          id: 'gasto-otra', cuentaId: 'cuenta-inexistente', referencia: 'GTO-X', fecha: '2026-10-03',
          monto: 999, moneda: 'MXN', tipoCambio: 1,
        },
      ],
    }));

    expect(datos.cuentas[0]?.saldoActual).toBe(-85);
    expect(datos.movimientos).toHaveLength(1);
  });

  it('el par de transferencia mueve saldos pero no suma al total', () => {
    const caja = { ...CUENTA, id: 'caja-1', etiqueta: 'Caja · … · MXN', tipo: 'efectivo' as const, saldoInicial: 0 };
    const datos = calcularSaldosTesoreria(entrada({
      cuentas: [CUENTA, caja],
      transferencias: [
        {
          id: 'salida', cuentaId: CUENTA.id, referencia: 'Transferencia a Caja',
          fecha: '2026-10-01', monto: 200, moneda: 'MXN', signo: -1,
        },
        {
          id: 'entrada', cuentaId: caja.id, referencia: 'Transferencia de Banco',
          fecha: '2026-10-01', monto: 200, moneda: 'MXN', signo: 1,
        },
      ],
    }));

    expect(datos.cuentas.find((cuenta) => cuenta.id === CUENTA.id)?.saldoActual).toBe(-100);
    expect(datos.cuentas.find((cuenta) => cuenta.id === caja.id)?.saldoActual).toBe(200);
    expect(datos.movimientos.reduce((suma, movimiento) => suma + movimiento.signo * movimiento.monto, 0)).toBe(0);
  });
});

type ConsultaFalsa = {
  select: () => ConsultaFalsa;
  order: () => ConsultaFalsa;
  not: () => ConsultaFalsa;
  eq: () => ConsultaFalsa;
  in: () => ConsultaFalsa;
  then: <T>(
    onfulfilled: (valor: { data: unknown[]; error: null }) => T | PromiseLike<T>,
  ) => Promise<T>;
};

function consulta(data: unknown[]): ConsultaFalsa {
  const q: ConsultaFalsa = {
    select: () => q,
    order: () => q,
    not: () => q,
    eq: () => q,
    in: () => q,
    then: (onfulfilled) => Promise.resolve({ data, error: null }).then(onfulfilled),
  };
  return q;
}

describe('wiring de Tesorería con reversos (C10.3/F-14)', () => {
  it('lee reversos_pago_ar y no infla el saldo con un cobro reversado', async () => {
    const tablas: Record<string, unknown[]> = {
      cuentas_bancarias: [{
        id: CUENTA.id, banco: 'Banco', numero_cuenta: '0000000001', moneda: 'MXN',
        activa: true, tipo: 'banco',
      }],
      saldos_iniciales_tesoreria: [],
      pagos_ar: [{
        id: 'cobro-1', cuenta_bancaria_id: CUENTA.id, folio_recibo: 'REC-000001',
        monto_pagado: 500, moneda_pago: 'MXN', creado_en: '2026-10-01T10:00:00Z',
      }],
      reversos_pago_ar: [{
        id: 'reverso-1', pago_id: 'cobro-1', creado_en: '2026-10-04T10:00:00Z',
      }],
      pagos_compra: [],
      gastos: [],
      movimientos_tesoreria: [],
      conciliaciones_tesoreria: [],
    };
    const cliente = {
      from: (tabla: string) => consulta(tablas[tabla] ?? []),
    } as unknown as SupabaseClient<Database>;

    const datos = await obtenerTesoreria(cliente);

    expect(datos.cuentas[0]?.saldoActual).toBe(0);
    expect(datos.movimientos).toHaveLength(2);
    expect(datos.movimientos.find((movimiento) => movimiento.entidad === 'cobro')?.reversado).toBe(true);
    expect(datos.movimientos.find((movimiento) => movimiento.entidad === 'reverso_cobro')?.signo).toBe(-1);
  });
});
