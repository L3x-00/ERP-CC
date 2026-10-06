import type { Tables } from '@/compartido/tipos/supabase';

/** Estados del ciclo de vida de una factura administrativa. */
export const ESTADOS_FACTURA = ['BORRADOR', 'EMITIDA', 'CANCELADA'] as const;

export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

/** Factura administrativa ligada a una entrega y a la AR de su orden. */
export type Factura = {
  id: string;
  estado: EstadoFactura;
  clienteId: string;
  ordenId: string;
  entregaId: string;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  folioFiscal: string | null;
  rfcReceptor: string | null;
  uuidFiscal: string | null;
  emitidaEn: string | null;
  canceladaEn: string | null;
  motivoCancelacion: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type FilaFactura = Tables<'facturas'>;

/** Convierte una fila de `facturas` (snake_case) a `Factura`. */
export function filaAFactura(fila: FilaFactura): Factura {
  return {
    id: fila.id,
    estado: fila.estado as EstadoFactura,
    clienteId: fila.cliente_id,
    ordenId: fila.orden_id,
    entregaId: fila.entrega_id,
    subtotal: fila.subtotal === null ? null : Number(fila.subtotal),
    iva: fila.iva === null ? null : Number(fila.iva),
    total: fila.total === null ? null : Number(fila.total),
    folioFiscal: fila.folio_fiscal ?? null,
    rfcReceptor: fila.rfc_receptor ?? null,
    uuidFiscal: fila.uuid_fiscal ?? null,
    emitidaEn: fila.emitida_en ?? null,
    canceladaEn: fila.cancelada_en ?? null,
    motivoCancelacion: fila.motivo_cancelacion ?? null,
    creadoPor: fila.creado_por ?? null,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
