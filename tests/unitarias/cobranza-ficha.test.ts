import { describe, expect, it } from 'vitest';
import {
  etiquetaCondicionCuenta,
  reconciliarCuenta,
} from '@/modulos/cobranza/servicios/ficha-cuenta-servicio';
import type { CuentaHistorial } from '@/modulos/cobranza/tipos/historial';

function cuenta(parcial: Partial<CuentaHistorial> = {}): CuentaHistorial {
  return {
    id: 'cuenta-1',
    referenciaInterna: 'INVCNC-0000001',
    ordenId: 'orden-1',
    clienteId: 'cliente-1',
    clienteNombre: 'Cliente',
    folioOrden: 'OP-001001',
    folioFacturaRemision: null,
    moneda: 'MXN',
    montoTotal: 1160,
    saldoPendiente: 1160,
    estado: 'pendiente',
    fechaEmision: '2026-09-20T00:00:00.000Z',
    fechaVencimiento: null,
    montoSubtotal: 1000,
    montoIva: 160,
    cobrableDesde: null,
    condicionesPago: 'credito',
    ...parcial,
  };
}

describe('AR-01: ficha integral de la cuenta', () => {
  it('reconcilia base, IVA, abonado y saldo sin duplicar importes', () => {
    const r = reconciliarCuenta(cuenta({ saldoPendiente: 580 }));
    expect(r.base).toBe(1000);
    expect(r.iva).toBe(160);
    expect(r.total).toBe(1160);
    expect(r.abonado).toBe(580);
    expect(r.saldo).toBe(580);
    expect(r.desgloseCuadra).toBe(true);
    expect(r.saldoCuadra).toBe(true);
    expect(r.cobrable).toBe(false);
  });

  it('declara no cobrable una cuenta sin fecha de cobrabilidad', () => {
    expect(reconciliarCuenta(cuenta()).cobrable).toBe(false);
    expect(reconciliarCuenta(cuenta({
      cobrableDesde: '2026-10-01T00:00:00.000Z',
      fechaVencimiento: '2026-10-31T00:00:00.000Z',
    })).cobrable).toBe(true);
  });

  it('detecta un desglose que no cuadra con el total', () => {
    expect(reconciliarCuenta(cuenta({ montoSubtotal: 900, montoIva: 100 })).desgloseCuadra).toBe(false);
  });

  it('trata el desglose histórico sin capturar como no verificable, no como error', () => {
    const r = reconciliarCuenta(cuenta({ montoSubtotal: null, montoIva: null }));
    expect(r.base).toBeNull();
    expect(r.desgloseCuadra).toBe(true);
  });

  it('etiqueta condiciones conocidas y declara las no capturadas', () => {
    expect(etiquetaCondicionCuenta('15_dias')).toBe('15 días');
    expect(etiquetaCondicionCuenta('otra_cosa')).toBe('otra cosa');
    expect(etiquetaCondicionCuenta(null)).toBe('Por definir');
  });
});
