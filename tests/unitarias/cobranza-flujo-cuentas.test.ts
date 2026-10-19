import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import {
  calcularFlujoPorCuenta,
  obtenerFlujoCuentasServicio,
  type MovimientoCuenta,
} from '@/modulos/tesoreria/servicios/flujo-cuentas-servicio';

const CUENTA_A = '11111111-1111-4111-8111-111111111111';
const CUENTA_B = '22222222-2222-4222-8222-222222222222';

const cuentas = [
  { id: CUENTA_A, etiqueta: 'Banco A · …0001 · MXN' },
  { id: CUENTA_B, etiqueta: 'Banco B · …0002 · MXN' },
];

function movimiento(parcial: Partial<MovimientoCuenta>): MovimientoCuenta {
  return {
    cuentaId: CUENTA_A,
    moneda: 'MXN',
    monto: 100,
    tipoCambio: 1,
    tipo: 'ingreso',
    ...parcial,
  };
}

describe('calcularFlujoPorCuenta (OBS-24)', () => {
  it('ingreso 1000 y egreso 300 en A dejan neto +700; B queda en 0', () => {
    const filas = calcularFlujoPorCuenta(
      [
        movimiento({ cuentaId: CUENTA_A, monto: 1000, tipo: 'ingreso' }),
        movimiento({ cuentaId: CUENTA_A, monto: 300, tipo: 'egreso' }),
      ],
      cuentas,
    );

    const a = filas.find((fila) => fila.cuentaId === CUENTA_A);
    const b = filas.find((fila) => fila.cuentaId === CUENTA_B);
    expect(a).toMatchObject({ ingresoMxn: 1000, egresoMxn: 300, netoMxn: 700 });
    expect(b).toMatchObject({ ingresoMxn: 0, egresoMxn: 0, netoMxn: 0 });
  });

  it('convierte USD con su TC (100 USD a 17.50 = 1750 MXN)', () => {
    const filas = calcularFlujoPorCuenta(
      [movimiento({ monto: 100, moneda: 'USD', tipoCambio: 17.5, tipo: 'ingreso' })],
      cuentas,
    );

    expect(filas[0]).toMatchObject({ ingresoMxn: 1750, netoMxn: 1750 });
  });

  it('agrupa los movimientos sin cuenta en una fila propia y al final', () => {
    const filas = calcularFlujoPorCuenta(
      [
        movimiento({ cuentaId: null, monto: 50, tipo: 'egreso' }),
        movimiento({ cuentaId: CUENTA_A, monto: 10, tipo: 'ingreso' }),
      ],
      cuentas,
    );

    expect(filas.at(-1)).toMatchObject({
      cuentaId: null,
      etiqueta: 'Sin cuenta asignada',
      egresoMxn: 50,
      netoMxn: -50,
    });
  });
});

type ConsultaFalsa = {
  select: () => ConsultaFalsa;
  order: () => ConsultaFalsa;
  neq: () => ConsultaFalsa;
  then: <T>(
    onfulfilled: (valor: { data: unknown[]; error: null }) => T | PromiseLike<T>,
  ) => Promise<T>;
};

function consulta(data: unknown[]): ConsultaFalsa {
  const q: ConsultaFalsa = {
    select: () => q,
    order: () => q,
    neq: () => q,
    then: (onfulfilled) => Promise.resolve({ data, error: null }).then(onfulfilled),
  };
  return q;
}

describe('lector del flujo por cuenta (C10.3/F-14)', () => {
  it('omite los cobros reversados y conserva el gasto', async () => {
    const tablas: Record<string, unknown[]> = {
      cuentas_bancarias: [{
        id: CUENTA_A, banco: 'Banco A', numero_cuenta: '0000000001', moneda: 'MXN', activa: true,
      }],
      pagos_ar: [
        {
          id: 'pago-1', cuenta_bancaria_id: CUENTA_A, monto_pagado: 100,
          moneda_pago: 'MXN', tipo_cambio_pago: 1,
        },
        {
          id: 'pago-2', cuenta_bancaria_id: CUENTA_A, monto_pagado: 50,
          moneda_pago: 'MXN', tipo_cambio_pago: 1,
        },
      ],
      reversos_pago_ar: [{ pago_id: 'pago-2' }],
      gastos: [{
        cuenta_bancaria_id: CUENTA_A, monto_total: 30, moneda: 'MXN',
        tipo_cambio: 1, estado_pago: 'pagado',
      }],
    };
    const cliente = {
      from: (tabla: string) => consulta(tablas[tabla] ?? []),
    } as unknown as SupabaseClient<Database>;

    const filas = await obtenerFlujoCuentasServicio(cliente);

    expect(filas[0]).toMatchObject({ ingresoMxn: 100, egresoMxn: 30, netoMxn: 70 });
  });
});
