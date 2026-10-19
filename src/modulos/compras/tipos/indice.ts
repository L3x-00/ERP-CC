import type { Tables } from '@/compartido/tipos/supabase';

/** Estados del ciclo de vida de una compra (CxP). */
export const ESTADOS_COMPRA = ['BORRADOR', 'CONFIRMADA', 'RECIBIDA', 'PAGADA', 'CANCELADA'] as const;

export type EstadoCompra = (typeof ESTADOS_COMPRA)[number];

/** C10.1/F06: rubros con los que una compra alimenta el costo de la Orden. */
export const RUBROS_COSTO_COMPRA = ['material', 'subcontratacion', 'gastos_directos'] as const;

export type RubroCostoCompra = (typeof RUBROS_COSTO_COMPRA)[number];

export const ETIQUETA_RUBRO_COSTO_COMPRA: Record<RubroCostoCompra, string> = {
  material: 'Material',
  subcontratacion: 'Subcontratación',
  gastos_directos: 'Gastos directos',
};

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
  /** C10.2/F-02: momento de recepción; null si se pagó sin recibir. */
  recibidaEn: string | null;
  /** C10.1/F06: null en históricas aún sin clasificar. */
  rubroCosto: RubroCostoCompra | null;
  /** C10.1/F08: detalle mínimo de material, nullable. */
  concepto: string | null;
  materialId: string | null;
  cantidad: number | null;
  unidad: string | null;
  costoUnitario: number | null;
};

/** Compra de la cola con proveedor/orden legibles. */
export type CompraCola = Compra & {
  proveedorNombre: string;
  ordenFolio: string | null;
};

export type ProveedorOpcion = { id: string; nombre: string };
export type OrdenOpcion = { id: string; folio: string; folioSii: string | null };
/** C10.1/F08: opción del catálogo para el detalle de material. */
export type MaterialOpcion = { id: string; codigo: string; nombre: string };
/** C10.1/F08: último costo unitario capturado en compras (referencia de lectura). */
export type UltimoCostoMaterial = { costo: number; moneda: 'MXN' | 'USD' };

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
    recibidaEn: fila.recibida_en ?? null,
    rubroCosto: (fila.rubro_costo as RubroCostoCompra | null) ?? null,
    concepto: fila.concepto ?? null,
    materialId: fila.material_id ?? null,
    cantidad: fila.cantidad === null ? null : Number(fila.cantidad),
    unidad: fila.unidad ?? null,
    costoUnitario: fila.costo_unitario === null ? null : Number(fila.costo_unitario),
  };
}
