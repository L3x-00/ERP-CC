import type { Tables } from '@/compartido/tipos/supabase';

/** Estados del ciclo de vida de una compra (CxP). */
export const ESTADOS_COMPRA = ['BORRADOR', 'CONFIRMADA', 'RECIBIDA', 'PAGADA', 'CANCELADA'] as const;

export type EstadoCompra = (typeof ESTADOS_COMPRA)[number];

/** Compra/orden de compra con folio CG y saldo por pagar. */
export type Compra = {
  id: string;
  folioSii: string;
  proveedorId: string;
  ordenId: string | null;
  estado: EstadoCompra;
  montoSubtotal: number;
  montoIva: number;
  montoTotal: number;
  moneda: string;
  tipoCambio: number;
  saldoPendiente: number;
  fechaCompra: string;
  fechaVencimiento: string | null;
  notas: string | null;
  motivoCancelacion: string | null;
  actualizadoEn: string;
};

/** Compra de la cola con proveedor/orden legibles. */
export type CompraCola = Compra & {
  proveedorNombre: string;
  ordenFolio: string | null;
};

export type ProveedorOpcion = { id: string; nombre: string };
export type OrdenOpcion = { id: string; folio: string; folioSii: string | null };

export const ETIQUETA_ESTADO_COMPRA: Record<EstadoCompra, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  RECIBIDA: 'Recibida',
  PAGADA: 'Pagada',
  CANCELADA: 'Cancelada',
};

/** Convierte una fila de `compras` (snake_case) a `Compra`. */
export function filaACompra(fila: Tables<'compras'>): Compra {
  return {
    id: fila.id,
    folioSii: fila.folio_sii,
    proveedorId: fila.proveedor_id,
    ordenId: fila.orden_id ?? null,
    estado: fila.estado as EstadoCompra,
    montoSubtotal: Number(fila.monto_subtotal),
    montoIva: Number(fila.monto_iva),
    montoTotal: Number(fila.monto_total),
    moneda: fila.moneda,
    tipoCambio: Number(fila.tipo_cambio),
    saldoPendiente: Number(fila.saldo_pendiente),
    fechaCompra: fila.fecha_compra,
    fechaVencimiento: fila.fecha_vencimiento ?? null,
    notas: fila.notas ?? null,
    motivoCancelacion: fila.motivo_cancelacion ?? null,
    actualizadoEn: fila.actualizado_en,
  };
}
