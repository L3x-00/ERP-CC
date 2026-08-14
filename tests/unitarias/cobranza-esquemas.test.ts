import { describe, expect, it } from 'vitest';
import {
  filaACuentaPorCobrar,
  filaAMovimientoSaldoFavor,
  filaAPagoAR,
  type FilaCuentaPorCobrar,
  type FilaMovimientoSaldoFavor,
  type FilaPagoAR,
} from '@/modulos/cobranza/tipos/indice';
import {
  esquemaAplicarSaldoFavor,
  esquemaConsultarCartera,
  esquemaCrearCuentaPorCobrar,
  esquemaRegistrarPago,
} from '@/modulos/cobranza/validaciones/indice';

const uuidOrden = '11111111-1111-4111-8111-111111111111';
const uuidCliente = '22222222-2222-4222-8222-222222222222';
const uuidCuenta = '33333333-3333-4333-8333-333333333333';
const uuidPago = '44444444-4444-4444-8444-444444444444';
const uuidUsuario = '55555555-5555-4555-8555-555555555555';
const uuidSolicitud = '66666666-6666-4666-8666-666666666666';
const uuidMovimiento = '77777777-7777-4777-8777-777777777777';

const fecha = '2026-08-14T12:00:00.000Z';

describe('esquemaCrearCuentaPorCobrar', () => {
  const base = {
    ordenId: uuidOrden,
    montoTotal: 1500.25,
    moneda: 'USD' as const,
    tipoCambioOrigen: 18.5,
    fechaVencimiento: fecha,
  };

  it('acepta una cuenta válida con y sin folio', () => {
    expect(esquemaCrearCuentaPorCobrar.safeParse(base).success).toBe(true);
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, folioFacturaRemision: 'F-001' }).success,
    ).toBe(true);
  });

  it('rechaza UUID, moneda y fecha inválidos', () => {
    expect(esquemaCrearCuentaPorCobrar.safeParse({ ...base, ordenId: 'x' }).success).toBe(false);
    expect(esquemaCrearCuentaPorCobrar.safeParse({ ...base, moneda: 'EUR' }).success).toBe(false);
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, fechaVencimiento: '2026-08-14' }).success,
    ).toBe(false);
  });

  it('rechaza montos no positivos, con más de 4 decimales o no finitos', () => {
    expect(esquemaCrearCuentaPorCobrar.safeParse({ ...base, montoTotal: 0 }).success).toBe(false);
    expect(esquemaCrearCuentaPorCobrar.safeParse({ ...base, montoTotal: -5 }).success).toBe(false);
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, montoTotal: 1.23456 }).success,
    ).toBe(false);
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, montoTotal: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, tipoCambioOrigen: 0 }).success,
    ).toBe(false);
  });

  it('rechaza claves inesperadas', () => {
    expect(
      esquemaCrearCuentaPorCobrar.safeParse({ ...base, extra: true }).success,
    ).toBe(false);
  });
});

describe('esquemaRegistrarPago', () => {
  const base = {
    arId: uuidCuenta,
    montoPagado: 500,
    monedaPago: 'MXN' as const,
    tipoCambioPago: 1,
    metodoPago: 'transferencia' as const,
    solicitudId: uuidSolicitud,
  };

  it('acepta un pago externo válido', () => {
    expect(esquemaRegistrarPago.safeParse(base).success).toBe(true);
  });

  it('exige solicitudId UUID para idempotencia', () => {
    const sinSolicitud = {
      arId: base.arId,
      montoPagado: base.montoPagado,
      monedaPago: base.monedaPago,
      tipoCambioPago: base.tipoCambioPago,
      metodoPago: base.metodoPago,
    };
    expect(esquemaRegistrarPago.safeParse(sinSolicitud).success).toBe(false);
    expect(esquemaRegistrarPago.safeParse({ ...base, solicitudId: 'no-uuid' }).success).toBe(false);
  });

  it('rechaza el método interno saldo_a_favor y métodos desconocidos', () => {
    expect(esquemaRegistrarPago.safeParse({ ...base, metodoPago: 'saldo_a_favor' }).success).toBe(false);
    expect(esquemaRegistrarPago.safeParse({ ...base, metodoPago: 'bitcoin' }).success).toBe(false);
  });

  it('rechaza monto cero/negativo y claves inesperadas', () => {
    expect(esquemaRegistrarPago.safeParse({ ...base, montoPagado: 0 }).success).toBe(false);
    expect(esquemaRegistrarPago.safeParse({ ...base, montoPagado: -1 }).success).toBe(false);
    expect(esquemaRegistrarPago.safeParse({ ...base, foo: 1 }).success).toBe(false);
  });
});

describe('esquemaAplicarSaldoFavor', () => {
  const base = {
    clienteId: uuidCliente,
    arId: uuidCuenta,
    montoAAplicar: 250.5,
    solicitudId: uuidSolicitud,
  };

  it('acepta una aplicación válida', () => {
    expect(esquemaAplicarSaldoFavor.safeParse(base).success).toBe(true);
  });

  it('rechaza monto no positivo, precisión excesiva y solicitud inválida', () => {
    expect(esquemaAplicarSaldoFavor.safeParse({ ...base, montoAAplicar: 0 }).success).toBe(false);
    expect(esquemaAplicarSaldoFavor.safeParse({ ...base, montoAAplicar: 1.00001 }).success).toBe(false);
    expect(esquemaAplicarSaldoFavor.safeParse({ ...base, solicitudId: 'x' }).success).toBe(false);
  });
});

describe('esquemaConsultarCartera', () => {
  it('acepta filtros vacíos y filtros válidos', () => {
    expect(esquemaConsultarCartera.safeParse({}).success).toBe(true);
    expect(
      esquemaConsultarCartera.safeParse({
        clienteId: uuidCliente,
        estados: ['pendiente', 'parcial'],
        moneda: 'USD',
        fechaReferencia: fecha,
        soloVencidas: true,
      }).success,
    ).toBe(true);
  });

  it('rechaza estados fuera del contrato y claves inesperadas', () => {
    expect(esquemaConsultarCartera.safeParse({ estados: ['moroso'] }).success).toBe(false);
    expect(esquemaConsultarCartera.safeParse({ estados: [] }).success).toBe(false);
    expect(esquemaConsultarCartera.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe('mappers de filas generadas', () => {
  const filaCuenta: FilaCuentaPorCobrar = {
    id: uuidCuenta,
    orden_id: uuidOrden,
    cliente_id: uuidCliente,
    folio_factura_remision: null,
    monto_total: 1000,
    saldo_pendiente: 400,
    moneda: 'USD',
    tipo_cambio_origen: 18.5,
    estado: 'parcial',
    fecha_emision: fecha,
    fecha_vencimiento: fecha,
    creado_en: fecha,
    actualizado_en: fecha,
  };

  it('mapea una cuenta uno a uno a camelCase con numeric convertido', () => {
    const cuenta = filaACuentaPorCobrar({ ...filaCuenta, monto_total: '1000' as unknown as number });
    expect(cuenta).toMatchObject({
      id: uuidCuenta,
      ordenId: uuidOrden,
      clienteId: uuidCliente,
      folioFacturaRemision: null,
      montoTotal: 1000,
      saldoPendiente: 400,
      moneda: 'USD',
      tipoCambioOrigen: 18.5,
      estado: 'parcial',
      creadoEn: fecha,
      actualizadoEn: fecha,
    });
    expect(typeof cuenta.montoTotal).toBe('number');
  });

  it('rompe el mapeo ante un estado o moneda fuera del contrato', () => {
    expect(() => filaACuentaPorCobrar({ ...filaCuenta, estado: 'moroso' })).toThrow();
    expect(() => filaACuentaPorCobrar({ ...filaCuenta, moneda: 'EUR' })).toThrow();
  });

  it('mapea un pago conservando distribución y método', () => {
    const filaPago: FilaPagoAR = {
      id: uuidPago,
      ar_id: uuidCuenta,
      folio_recibo: 'REC-001001',
      solicitud_id: uuidSolicitud,
      monto_pagado: 500,
      moneda_pago: 'MXN',
      tipo_cambio_pago: 1,
      monto_aplicado_ar: 480,
      monto_sobrepago_ar: 20,
      metodo_pago: 'transferencia',
      referencia_bancaria: null,
      cuenta_bancaria_id: null,
      notas: null,
      creado_por: uuidUsuario,
      creado_en: fecha,
    };
    expect(filaAPagoAR(filaPago)).toMatchObject({
      folioRecibo: 'REC-001001',
      solicitudId: uuidSolicitud,
      montoAplicadoAr: 480,
      montoSobrepagoAr: 20,
      metodoPago: 'transferencia',
    });
    expect(() => filaAPagoAR({ ...filaPago, metodo_pago: 'otro' })).toThrow();
  });

  it('mapea un movimiento MXN y rechaza otra moneda', () => {
    const filaMov: FilaMovimientoSaldoFavor = {
      id: uuidMovimiento,
      cliente_id: uuidCliente,
      ar_id_origen: uuidCuenta,
      pago_ar_id: uuidPago,
      monto: 20,
      moneda: 'MXN',
      tipo: 'credito_sobrepago',
      descripcion: 'Crédito por sobrepago del recibo REC-001001',
      creado_por: uuidUsuario,
      creado_en: fecha,
    };
    expect(filaAMovimientoSaldoFavor(filaMov)).toMatchObject({
      clienteId: uuidCliente,
      monto: 20,
      moneda: 'MXN',
      tipo: 'credito_sobrepago',
    });
    expect(() => filaAMovimientoSaldoFavor({ ...filaMov, moneda: 'USD' })).toThrow();
    expect(() => filaAMovimientoSaldoFavor({ ...filaMov, tipo: 'inventado' })).toThrow();
  });
});
