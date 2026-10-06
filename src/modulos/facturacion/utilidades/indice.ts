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
