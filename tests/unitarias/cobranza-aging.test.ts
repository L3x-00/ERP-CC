import { describe, expect, it } from 'vitest';
import type { CuentaPorCobrar } from '@/modulos/cobranza/tipos/indice';
import {
  calcularAgingCliente,
  calcularAgingPorCliente,
  calcularDiasVencidos,
  clasificarBucketAging,
  convertirAMxn,
  convertirPagoAMonedaCuenta,
} from '@/modulos/cobranza/servicios/indice';

const CLIENTE = '22222222-2222-4222-8222-222222222222';
const OTRO_CLIENTE = '33333333-3333-4333-8333-333333333333';
const REFERENCIA = '2026-08-14T00:00:00.000Z';

let contador = 0;

function cuenta(parcial: Partial<CuentaPorCobrar>): CuentaPorCobrar {
  contador += 1;
  return {
    id: `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    ordenId: '11111111-1111-4111-8111-111111111111',
    clienteId: CLIENTE,
    folioFacturaRemision: null,
    montoTotal: 1000,
    saldoPendiente: 1000,
    moneda: 'MXN',
    tipoCambioOrigen: 1,
    estado: 'pendiente',
    fechaEmision: '2026-01-01T00:00:00.000Z',
    fechaVencimiento: REFERENCIA,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
    ...parcial,
  };
}

describe('convertirPagoAMonedaCuenta', () => {
  it('convierte un pago MXN a una cuenta USD de forma determinista', () => {
    // 100 MXN (tc 1) contra una cuenta en USD a 18.50 → 5.4054 USD.
    expect(
      convertirPagoAMonedaCuenta({ montoPago: 100, tipoCambioPago: 1, tipoCambioOrigen: 18.5 }),
    ).toBe(5.4054);
  });

  it('convierte un pago USD a una cuenta MXN', () => {
    // 10 USD (tc 18.50) contra cuenta MXN (tc 1) → 185 MXN.
    expect(
      convertirPagoAMonedaCuenta({ montoPago: 10, tipoCambioPago: 18.5, tipoCambioOrigen: 1 }),
    ).toBe(185);
  });

  it('devuelve null ante entradas no positivas, no finitas o divisor cero', () => {
    expect(convertirPagoAMonedaCuenta({ montoPago: 0, tipoCambioPago: 1, tipoCambioOrigen: 1 })).toBeNull();
    expect(convertirPagoAMonedaCuenta({ montoPago: -5, tipoCambioPago: 1, tipoCambioOrigen: 1 })).toBeNull();
    expect(convertirPagoAMonedaCuenta({ montoPago: Number.NaN, tipoCambioPago: 1, tipoCambioOrigen: 1 })).toBeNull();
    expect(convertirPagoAMonedaCuenta({ montoPago: 100, tipoCambioPago: 1, tipoCambioOrigen: 0 })).toBeNull();
    expect(
      convertirPagoAMonedaCuenta({ montoPago: 100, tipoCambioPago: Number.POSITIVE_INFINITY, tipoCambioOrigen: 1 }),
    ).toBeNull();
  });
});

describe('convertirAMxn', () => {
  it('convierte importe por tipo de cambio', () => {
    expect(convertirAMxn(100, 18.5)).toBe(1850);
    expect(convertirAMxn(0, 18.5)).toBe(0);
  });

  it('devuelve null ante importe negativo o tipo de cambio no positivo', () => {
    expect(convertirAMxn(-1, 18.5)).toBeNull();
    expect(convertirAMxn(100, 0)).toBeNull();
    expect(convertirAMxn(Number.NaN, 18.5)).toBeNull();
  });
});

describe('calcularDiasVencidos y clasificarBucketAging', () => {
  it('devuelve null si alguna fecha es inválida', () => {
    expect(calcularDiasVencidos('no-es-fecha', REFERENCIA)).toBeNull();
    expect(calcularDiasVencidos(REFERENCIA, 'x')).toBeNull();
  });

  it('clasifica cada rango en su bucket', () => {
    expect(clasificarBucketAging(0)).toBe('alCorriente');
    expect(clasificarBucketAging(-5)).toBe('alCorriente');
    expect(clasificarBucketAging(1)).toBe('de1A30Dias');
    expect(clasificarBucketAging(30)).toBe('de1A30Dias');
    expect(clasificarBucketAging(31)).toBe('de31A60Dias');
    expect(clasificarBucketAging(60)).toBe('de31A60Dias');
    expect(clasificarBucketAging(61)).toBe('de61A90Dias');
    expect(clasificarBucketAging(90)).toBe('de61A90Dias');
    expect(clasificarBucketAging(91)).toBe('masDe90Dias');
  });
});

describe('calcularAgingCliente', () => {
  it('distribuye cuentas MXN en todos los buckets', () => {
    const cuentas = [
      cuenta({ saldoPendiente: 100, fechaVencimiento: '2026-08-20T00:00:00.000Z' }), // futuro → alCorriente
      cuenta({ saldoPendiente: 200, fechaVencimiento: '2026-08-01T00:00:00.000Z' }), // 13 días
      cuenta({ saldoPendiente: 300, fechaVencimiento: '2026-07-01T00:00:00.000Z' }), // 44 días
      cuenta({ saldoPendiente: 400, fechaVencimiento: '2026-06-01T00:00:00.000Z' }), // 74 días
      cuenta({ saldoPendiente: 500, fechaVencimiento: '2026-04-01T00:00:00.000Z' }), // 135 días
    ];

    const resumen = calcularAgingCliente(CLIENTE, cuentas, REFERENCIA);

    expect(resumen).toMatchObject({
      clienteId: CLIENTE,
      moneda: 'MXN',
      alCorriente: 100,
      de1A30Dias: 200,
      de31A60Dias: 300,
      de61A90Dias: 400,
      masDe90Dias: 500,
      totalPendiente: 1500,
      cuentasConsideradas: 5,
    });
  });

  it('excluye cuentas pagadas y canceladas', () => {
    const cuentas = [
      cuenta({ saldoPendiente: 100, estado: 'pendiente', fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
      cuenta({ saldoPendiente: 0, estado: 'pagado', fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
      cuenta({ saldoPendiente: 999, estado: 'cancelado', fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
    ];

    const resumen = calcularAgingCliente(CLIENTE, cuentas, REFERENCIA);

    expect(resumen.de1A30Dias).toBe(100);
    expect(resumen.totalPendiente).toBe(100);
    expect(resumen.cuentasConsideradas).toBe(1);
  });

  it('convierte cuentas USD a MXN con el tipo de cambio de origen', () => {
    const cuentas = [
      cuenta({
        saldoPendiente: 100,
        moneda: 'USD',
        tipoCambioOrigen: 18.5,
        fechaVencimiento: '2026-08-01T00:00:00.000Z',
      }),
    ];

    const resumen = calcularAgingCliente(CLIENTE, cuentas, REFERENCIA);

    expect(resumen.de1A30Dias).toBe(1850);
    expect(resumen.totalPendiente).toBe(1850);
  });

  it('ignora fechas inválidas y tipos de cambio no convertibles sin producir NaN/Infinity', () => {
    const cuentas = [
      cuenta({ saldoPendiente: 100, fechaVencimiento: 'fecha-basura' }),
      cuenta({ saldoPendiente: 100, moneda: 'USD', tipoCambioOrigen: 0, fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
      cuenta({ saldoPendiente: 50, fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
    ];

    const resumen = calcularAgingCliente(CLIENTE, cuentas, REFERENCIA);

    for (const valor of [
      resumen.alCorriente,
      resumen.de1A30Dias,
      resumen.de31A60Dias,
      resumen.de61A90Dias,
      resumen.masDe90Dias,
      resumen.totalPendiente,
    ]) {
      expect(Number.isFinite(valor)).toBe(true);
    }
    expect(resumen.de1A30Dias).toBe(50);
    expect(resumen.cuentasConsideradas).toBe(1);
  });

  it('solo considera cuentas del cliente solicitado', () => {
    const cuentas = [
      cuenta({ saldoPendiente: 100, fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
      cuenta({ clienteId: OTRO_CLIENTE, saldoPendiente: 999, fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
    ];

    expect(calcularAgingCliente(CLIENTE, cuentas, REFERENCIA).totalPendiente).toBe(100);
  });
});

describe('calcularAgingPorCliente', () => {
  it('devuelve un resumen por cliente en orden estable', () => {
    const cuentas = [
      cuenta({ clienteId: CLIENTE, saldoPendiente: 100, fechaVencimiento: '2026-08-01T00:00:00.000Z' }),
      cuenta({ clienteId: OTRO_CLIENTE, saldoPendiente: 200, fechaVencimiento: '2026-07-01T00:00:00.000Z' }),
      cuenta({ clienteId: CLIENTE, saldoPendiente: 300, fechaVencimiento: '2026-04-01T00:00:00.000Z' }),
    ];

    const resumenes = calcularAgingPorCliente(cuentas, REFERENCIA);

    expect(resumenes.map((r) => r.clienteId)).toEqual([CLIENTE, OTRO_CLIENTE]);
    expect(resumenes[0]).toMatchObject({ de1A30Dias: 100, masDe90Dias: 300, totalPendiente: 400 });
    expect(resumenes[1]).toMatchObject({ de31A60Dias: 200, totalPendiente: 200 });
  });
});
