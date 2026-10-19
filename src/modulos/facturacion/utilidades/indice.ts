import type { EstadoFactura } from '@/modulos/facturacion/tipos/indice';
import type { FacturaCola } from '@/modulos/facturacion/servicios/obtener-facturas';

/** Etiqueta legible del estado de una factura. */
export const ETIQUETA_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  CANCELADA: 'Cancelada',
};

export type FiltroEstadoFactura = 'todas' | EstadoFactura;

/** Filtra la cola de facturas por estado y texto libre. */
export function filtrarFacturas(
  facturas: readonly FacturaCola[],
  filtros: { estado: FiltroEstadoFactura; texto: string },
): FacturaCola[] {
  const texto = filtros.texto.trim().toLowerCase();
  return facturas.filter((factura) => {
    if (filtros.estado !== 'todas' && factura.estado !== filtros.estado) return false;
    if (!texto) return true;
    return [
      factura.folioFiscal ?? '',
      factura.clienteNombre ?? '',
      factura.ordenFolio,
      factura.ordenFolioSii ?? '',
      factura.entregaFolio,
      factura.entregaFolioSii ?? '',
      factura.rfcReceptor ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(texto);
  });
}

/** Suma de montos totales capturados (solo informativo para el resumen). */
export function totalFacturado(facturas: readonly FacturaCola[]): number {
  return facturas.reduce(
    (suma, factura) => suma + (factura.estado === 'CANCELADA' ? 0 : (factura.total ?? 0)),
    0,
  );
}

export type DisponibleFactura = {
  facturado: number;
  total: number;
  subtotal: number | null;
  iva: number | null;
};

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * C10.2b/F-03 A: monto que aún se puede facturar de una CxC.
 * La CxC es una por Orden; las facturas por entrega la consumen parcialmente.
 * Reparte el disponible con la proporción subtotal/IVA de la cuenta.
 */
export function calcularDisponibleFactura(
  cuenta: { monto_total: number; monto_subtotal: number | null; monto_iva: number | null } | null,
  facturado: number,
): DisponibleFactura {
  if (!cuenta) return { facturado: 0, total: 0, subtotal: null, iva: null };
  const total = redondear2(Math.max(0, cuenta.monto_total - facturado));
  if (total === 0) return { facturado, total: 0, subtotal: 0, iva: 0 };
  const factor = cuenta.monto_total > 0 ? total / cuenta.monto_total : 0;
  return {
    facturado: redondear2(facturado),
    total,
    subtotal: cuenta.monto_subtotal === null
      ? null
      : redondear2(cuenta.monto_subtotal * factor),
    iva: cuenta.monto_iva === null ? null : redondear2(cuenta.monto_iva * factor),
  };
}
