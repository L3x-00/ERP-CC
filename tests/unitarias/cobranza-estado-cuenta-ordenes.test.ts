import { describe, expect, it } from 'vitest';
import {
  diasAtrasoMaximo,
  resumirOrdenesEstadoCuenta,
  totalCotizadoSinIva,
  type OrdenCrudaEstadoCuenta,
} from '@/modulos/cobranza/servicios/estado-cuenta-servicio';

const HOY = new Date('2026-09-19T12:00:00Z');

const ORDEN_BASE: OrdenCrudaEstadoCuenta = {
  id: '11111111-1111-4111-8111-111111111111',
  folio: 'OP-001001',
  estado: 'en_proceso',
  fechaCompromiso: '2026-10-01T12:00:00.000Z',
  esInterna: false,
  archivadaEn: null,
  cotizacionId: '22222222-2222-4222-8222-222222222222',
  cotizacionFolio: 'CNC-0926-0001',
  cotizacionMoneda: 'MXN',
  partidas: [
    { cantidadSolicitada: 10, cantidadProducida: 5 },
    { cantidadSolicitada: 10, cantidadProducida: 0 },
  ],
};

describe('totalCotizadoSinIva', () => {
  it('suma líneas y resta las de descuento', () => {
    expect(
      totalCotizadoSinIva([
        { cantidad: 2, precioUnitario: 1_000, esDescuento: false },
        { cantidad: 1, precioUnitario: 200, esDescuento: true },
      ]),
    ).toBe(1_800);
    expect(totalCotizadoSinIva([])).toBeNull();
    expect(totalCotizadoSinIva(undefined)).toBeNull();
  });
});

describe('resumirOrdenesEstadoCuenta', () => {
  it('marca las órdenes en proceso sin AR como no exigibles con su avance', () => {
    const filas = resumirOrdenesEstadoCuenta([ORDEN_BASE], [], new Map(), HOY);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.avancePorcentaje).toBe(25);
    expect(filas[0]?.situacion).toBe('no_exigible');
    expect(filas[0]?.saldo).toBe(0);
    expect(filas[0]?.abierta).toBe(true);
    expect(filas[0]?.cotizacionFolio).toBe('CNC-0926-0001');
  });

  it('las órdenes archivadas (entregadas) no se consideran abiertas', () => {
    const filas = resumirOrdenesEstadoCuenta(
      [
        { ...ORDEN_BASE, archivadaEn: '2026-09-18T12:00:00.000Z' },
        { ...ORDEN_BASE, id: '33333333-3333-4333-8333-333333333333', estado: 'cancelada' },
      ],
      [],
      new Map(),
      HOY,
    );
    expect(filas[0]?.abierta).toBe(false);
    expect(filas[1]?.abierta).toBe(false);
  });

  it('resume abonado y saldo por orden y detecta vencimiento', () => {
    const filas = resumirOrdenesEstadoCuenta(
      [ORDEN_BASE],
      [
        {
          ordenId: ORDEN_BASE.id,
          montoTotal: 10_000,
          saldoPendiente: 4_000,
          estado: 'parcial',
          fechaVencimiento: '2026-09-01T12:00:00.000Z',
          cobrableDesde: '2026-09-01T12:00:00.000Z',
          moneda: 'MXN',
        },
      ],
      new Map(),
      HOY,
    );
    expect(filas[0]?.totalAr).toBe(10_000);
    expect(filas[0]?.abonado).toBe(6_000);
    expect(filas[0]?.saldo).toBe(4_000);
    expect(filas[0]?.situacion).toBe('vencido');
  });

  it('una AR aún no cobrable (D-04) se informa como por cobrar al entregar', () => {
    const filas = resumirOrdenesEstadoCuenta(
      [ORDEN_BASE],
      [
        {
          ordenId: ORDEN_BASE.id,
          montoTotal: 10_000,
          saldoPendiente: 10_000,
          estado: 'pendiente',
          fechaVencimiento: null,
          cobrableDesde: null,
          moneda: 'MXN',
        },
      ],
      new Map(),
      HOY,
    );
    expect(filas[0]?.situacion).toBe('por_entregar');
    expect(filas[0]?.saldo).toBe(10_000);
  });

  it('considera pagada la orden cuando todas sus AR están liquidadas y conserva TI', () => {
    const filas = resumirOrdenesEstadoCuenta(
      [{ ...ORDEN_BASE, estado: 'completada', esInterna: true, cotizacionMoneda: 'USD' }],
      [
        {
          ordenId: ORDEN_BASE.id,
          montoTotal: 5_000,
          saldoPendiente: 0,
          estado: 'pagado',
          fechaVencimiento: '2026-09-01T12:00:00.000Z',
          cobrableDesde: '2026-09-01T12:00:00.000Z',
          moneda: 'USD',
        },
      ],
      new Map([[ORDEN_BASE.cotizacionId as string, [{ cantidad: 1, precioUnitario: 100, esDescuento: false }]]]),
      HOY,
    );
    expect(filas[0]?.situacion).toBe('pagado');
    expect(filas[0]?.esInterna).toBe(true);
    expect(filas[0]?.moneda).toBe('USD');
    expect(filas[0]?.cotizadoSinIva).toBe(100);
  });
});

describe('diasAtrasoMaximo', () => {
  const cuenta = (parcial: Partial<Parameters<typeof diasAtrasoMaximo>[0][number]>) => ({
    ordenId: ORDEN_BASE.id,
    montoTotal: 1_000,
    saldoPendiente: 1_000,
    estado: 'pendiente',
    fechaVencimiento: '2026-09-01T12:00:00.000Z',
    moneda: 'MXN',
    ...parcial,
  });

  it('reporta el atraso de la AR vencida con saldo más antigua', () => {
    expect(diasAtrasoMaximo([cuenta({ fechaVencimiento: '2026-09-10T12:00:00.000Z' })], HOY)).toBe(9);
    expect(
      diasAtrasoMaximo(
        [
          cuenta({ fechaVencimiento: '2026-09-10T12:00:00.000Z' }),
          cuenta({ fechaVencimiento: '2026-09-01T12:00:00.000Z' }),
        ],
        HOY,
      ),
    ).toBe(18);
  });

  it('ignora AR pagadas, canceladas o sin saldo', () => {
    expect(diasAtrasoMaximo([cuenta({ estado: 'pagado', saldoPendiente: 0 })], HOY)).toBe(0);
    expect(diasAtrasoMaximo([cuenta({ estado: 'cancelado' })], HOY)).toBe(0);
    expect(diasAtrasoMaximo([cuenta({ saldoPendiente: 0 })], HOY)).toBe(0);
    expect(diasAtrasoMaximo([cuenta({ fechaVencimiento: '2026-10-01T12:00:00.000Z' })], HOY)).toBe(0);
  });
});
