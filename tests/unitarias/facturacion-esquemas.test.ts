import { describe, expect, it } from 'vitest';

import type { FacturaCola } from '@/modulos/facturacion/servicios/obtener-facturas';
import { traducirErrorFactura } from '@/modulos/facturacion/servicios/errores-factura';
import {
  calcularDisponibleFactura,
  filtrarFacturas,
  totalFacturado,
} from '@/modulos/facturacion/utilidades/indice';
import {
  esquemaCancelarFactura,
  esquemaCrearFactura,
  esquemaEmitirFactura,
} from '@/modulos/facturacion/validaciones/esquemas-facturacion';

function factura(extra: Partial<FacturaCola> & { id: string }): FacturaCola {
  return {
    id: extra.id,
    estado: extra.estado ?? 'BORRADOR',
    clienteId: 'cliente-1',
    ordenId: 'orden-1',
    entregaId: 'entrega-1',
    cuentaId: extra.cuentaId ?? null,
    subtotal: extra.subtotal === undefined ? 100 : extra.subtotal,
    iva: extra.iva === undefined ? 16 : extra.iva,
    total: extra.total === undefined ? 116 : extra.total,
    folioFiscal: extra.folioFiscal ?? null,
    rfcReceptor: extra.rfcReceptor ?? null,
    uuidFiscal: extra.uuidFiscal ?? null,
    emitidaEn: extra.emitidaEn ?? null,
    canceladaEn: extra.canceladaEn ?? null,
    motivoCancelacion: extra.motivoCancelacion ?? null,
    fechaVencimiento: extra.fechaVencimiento ?? null,
    creadoPor: 'usuario-1',
    creadoEn: '2026-10-06T10:00:00.000Z',
    actualizadoEn: '2026-10-06T10:00:00.000Z',
    clienteNombre: extra.clienteNombre ?? 'Cliente Uno',
    ordenFolio: extra.ordenFolio ?? 'OP-000001',
    ordenFolioSii: extra.ordenFolioSii ?? 'O-2610_01',
    entregaFolio: extra.entregaFolio ?? 'NE-000001',
    entregaFolioSii: extra.entregaFolioSii ?? 'NE-2610_01-01',
  };
}

describe('esquemas de facturación (SII-B8 F2)', () => {
  it('acepta montos nulos o no negativos y rechaza negativos y llaves extra', () => {
    expect(esquemaCrearFactura.safeParse({
      entregaId: '00000000-0000-4000-8000-000000000001', subtotal: null, iva: 16, total: 116,
    }).success).toBe(true);
    expect(esquemaCrearFactura.safeParse({
      entregaId: '00000000-0000-4000-8000-000000000001', total: -1,
    }).success).toBe(false);
    expect(esquemaCrearFactura.safeParse({
      entregaId: '00000000-0000-4000-8000-000000000001', extra: 1,
    }).success).toBe(false);
  });

  it('la emisión exige folio fiscal y respeta longitudes', () => {
    const base = {
      facturaId: '00000000-0000-4000-8000-000000000002',
      actualizadoEn: '2026-10-06T10:00:00.000Z',
    };
    expect(esquemaEmitirFactura.safeParse({ ...base, folioFiscal: 'FAC-1' }).success).toBe(true);
    expect(esquemaEmitirFactura.safeParse({ ...base, folioFiscal: '' }).success).toBe(false);
    expect(esquemaEmitirFactura.safeParse({ ...base, folioFiscal: 'x'.repeat(61) }).success).toBe(false);
  });

  it('la cancelación exige un motivo de al menos 3 caracteres', () => {
    const base = {
      facturaId: '00000000-0000-4000-8000-000000000003',
      actualizadoEn: '2026-10-06T10:00:00.000Z',
    };
    expect(esquemaCancelarFactura.safeParse({ ...base, motivo: 'Error' }).success).toBe(true);
    expect(esquemaCancelarFactura.safeParse({ ...base, motivo: 'ab' }).success).toBe(false);
  });
});

describe('cola de facturas (SII-B8 F2)', () => {
  it('filtra por estado y texto libre', () => {
    const cola = [
      factura({ id: 'a', estado: 'BORRADOR' }),
      factura({ id: 'b', estado: 'EMITIDA', folioFiscal: 'FAC-0001', clienteNombre: 'Aceros del Norte' }),
      factura({ id: 'c', estado: 'CANCELADA', motivoCancelacion: 'Error PAC' }),
    ];
    expect(filtrarFacturas(cola, { estado: 'todas', texto: '' })).toHaveLength(3);
    expect(filtrarFacturas(cola, { estado: 'EMITIDA', texto: '' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarFacturas(cola, { estado: 'todas', texto: 'fac-0001' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarFacturas(cola, { estado: 'todas', texto: 'aceros' }).map((f) => f.id)).toEqual(['b']);
    expect(filtrarFacturas(cola, { estado: 'CANCELADA', texto: 'ne-2610_01' }).map((f) => f.id)).toEqual(['c']);
  });

  it('suma solo los montos vigentes (excluye canceladas)', () => {
    const cola = [
      factura({ id: 'a', total: 100 }),
      factura({ id: 'b', estado: 'EMITIDA', total: 200 }),
      factura({ id: 'c', estado: 'CANCELADA', total: 999 }),
    ];
    expect(totalFacturado(cola)).toBe(300);
  });
});

describe('disponible por facturar (C10.2b)', () => {
  it('descuenta las facturas activas y reparte subtotal/IVA de la CxC', () => {
    const cuenta = { monto_total: 116, monto_subtotal: 100, monto_iva: 16 };
    expect(calcularDisponibleFactura(cuenta, 0)).toEqual({
      facturado: 0, total: 116, subtotal: 100, iva: 16,
    });
    expect(calcularDisponibleFactura(cuenta, 58)).toEqual({
      facturado: 58, total: 58, subtotal: 50, iva: 8,
    });
    expect(calcularDisponibleFactura(cuenta, 116)).toEqual({
      facturado: 116, total: 0, subtotal: 0, iva: 0,
    });
  });

  it('no baja de cero y sin CxC devuelve cero', () => {
    expect(calcularDisponibleFactura({
      monto_total: 100, monto_subtotal: 86.21, monto_iva: 13.79,
    }, 150)).toEqual({ facturado: 150, total: 0, subtotal: 0, iva: 0 });
    expect(calcularDisponibleFactura(null, 0)).toEqual({
      facturado: 0, total: 0, subtotal: null, iva: null,
    });
  });

  it('traduce el bloqueo de F-12 (cobros aplicados)', () => {
    expect(traducirErrorFactura('factura_con_cobros')).toContain('cobros aplicados');
  });
});
