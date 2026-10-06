import { describe, expect, it } from 'vitest';

import type { FacturaCola } from '@/modulos/facturacion/servicios/obtener-facturas';
import {
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
    subtotal: extra.subtotal === undefined ? 100 : extra.subtotal,
    iva: extra.iva === undefined ? 16 : extra.iva,
    total: extra.total === undefined ? 116 : extra.total,
    folioFiscal: extra.folioFiscal ?? null,
    rfcReceptor: extra.rfcReceptor ?? null,
    uuidFiscal: extra.uuidFiscal ?? null,
    emitidaEn: extra.emitidaEn ?? null,
    canceladaEn: extra.canceladaEn ?? null,
    motivoCancelacion: extra.motivoCancelacion ?? null,
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
