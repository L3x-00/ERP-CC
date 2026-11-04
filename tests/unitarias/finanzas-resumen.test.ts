import { describe, expect, it } from 'vitest';

import type { ColaCompras } from '@/modulos/compras/servicios/obtener-compras';
import type { CompraCola } from '@/modulos/compras/tipos/indice';
import type { ResumenCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import {
  aMxn,
  calcularResumenCobros,
  calcularResumenEgresos,
} from '@/modulos/finanzas/utilidades/resumen-financiero';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

function gasto(parcial: Partial<Gasto>): Gasto {
  return {
    id: 'g-1',
    folio: 'G-1',
    folioSii: null,
    ordenId: null,
    ordenFolio: null,
    proveedorId: null,
    proveedorNombre: null,
    cuentaBancariaId: null,
    tipoGasto: 'variable',
    categoria: 'consumibles',
    descripcion: 'Gasto',
    montoSubtotal: 100,
    montoIva: 16,
    montoTotal: 116,
    moneda: 'MXN',
    tipoCambio: 1,
    estadoPago: 'pendiente',
    fechaGasto: '2026-11-01',
    fechaVencimiento: null,
    comprobanteUrl: null,
    comprobanteRuta: null,
    folioComprobante: null,
    metodoPago: null,
    datosOcrJson: null,
    notas: null,
    creadoPor: 'u-1',
    creadoEn: '2026-11-01T10:00:00.000Z',
    actualizadoEn: '2026-11-01T10:00:00.000Z',
    ...parcial,
  };
}

function compra(parcial: Partial<CompraCola>): CompraCola {
  return {
    id: 'c-1',
    folioSii: 'CG-1',
    proveedorId: 'p-1',
    ordenId: null,
    estado: 'CONFIRMADA',
    montoSubtotal: 1000,
    montoIva: 160,
    montoTotal: 1160,
    moneda: 'MXN',
    tipoCambio: 1,
    saldoPendiente: 1160,
    fechaCompra: '2026-11-01',
    fechaVencimiento: null,
    notas: null,
    motivoCancelacion: null,
    actualizadoEn: '2026-11-01T10:00:00.000Z',
    recibidaEn: null,
    rubroCosto: null,
    concepto: null,
    materialId: null,
    cantidad: null,
    unidad: null,
    costoUnitario: null,
    proveedorNombre: 'Proveedor',
    ordenFolio: null,
    ...parcial,
  };
}

function cola(compras: CompraCola[]): ColaCompras {
  return { compras, proveedores: [], ordenes: [], materiales: [], ultimosCostos: {} };
}

describe('resumen unificado de egresos', () => {
  it('suma compras con saldo y gastos pendientes, ignorando cancelados', () => {
    const resumen = calcularResumenEgresos(
      [
        gasto({ moneda: 'MXN', montoTotal: 116, estadoPago: 'pendiente' }),
        gasto({ id: 'g-2', moneda: 'USD', montoTotal: 100, tipoCambio: 18, estadoPago: 'pendiente' }),
        gasto({ id: 'g-3', montoTotal: 500, estadoPago: 'pagado' }),
        gasto({ id: 'g-4', montoTotal: 900, estadoPago: 'cancelado' }),
      ],
      cola([
        compra({ saldoPendiente: 1160, montoTotal: 1160 }),
        compra({ id: 'c-2', estado: 'PAGADA', saldoPendiente: 0, montoTotal: 500 }),
        compra({ id: 'c-3', estado: 'CANCELADA', saldoPendiente: 800, montoTotal: 800 }),
      ]),
    );

    // 116 + (100 × 18) de gastos pendientes + 1160 de compra con saldo.
    expect(resumen.porPagarMxn).toBe(3076);
    expect(resumen.comprasTotalMxn).toBe(1660);
    expect(resumen.gastosTotalMxn).toBe(2416);
    expect(resumen.comprasPendientes).toBe(1);
    expect(resumen.gastosPendientes).toBe(2);
  });

  it('convierte USD con el tipo de cambio congelado y protege tipos inválidos', () => {
    expect(aMxn(100, 'USD', 18)).toBe(1800);
    expect(aMxn(100, 'MXN', 18)).toBe(100);
    expect(aMxn(Number.NaN, 'MXN', 1)).toBe(0);
  });
});

describe('resumen unificado de cobros', () => {
  it('suma cartera y saldo de cuentas en MXN', () => {
    const cartera = {
      cuentas: [
        { estado: 'pendiente' },
        { estado: 'parcial' },
        { estado: 'pagado' },
      ],
      agingPorCliente: [],
      totalPendienteMxn: 4500,
    } as unknown as ResumenCartera;
    const tesoreria: DatosTesoreria = {
      cuentas: [
        {
          id: 'cta-1', etiqueta: 'BBVA', tipo: 'banco', moneda: 'MXN', activa: true,
          saldoInicial: 0, saldoActual: 2500, conciliados: 0, movimientos: 0,
        },
        {
          id: 'cta-2', etiqueta: 'USD', tipo: 'banco', moneda: 'USD', activa: true,
          saldoInicial: 0, saldoActual: 900, conciliados: 0, movimientos: 0,
        },
      ],
      movimientos: [],
    };

    const resumen = calcularResumenCobros(cartera, tesoreria);
    expect(resumen.carteraMxn).toBe(4500);
    expect(resumen.cuentasAbiertas).toBe(2);
    expect(resumen.saldoCuentasMxn).toBe(2500);
    expect(resumen.cuentasBancarias).toBe(2);
  });
});
