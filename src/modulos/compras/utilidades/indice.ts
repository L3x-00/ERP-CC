import type { Compra, EstadoCompra } from '@/modulos/compras/tipos/indice';

export {
  ETIQUETA_RUBRO_COSTO_COMPRA,
  RUBROS_COSTO_COMPRA,
  type RubroCostoCompra,
} from '@/modulos/compras/tipos/indice';

/**
 * C10.1/F06 + C10.2/F-02: qué cuenta como costo comprometido y real.
 * Confirmada = comprometido; recibida = comprometido y real; pagada solo es
 * real si pasó por recepción (`recibida_en` no nulo). Borrador y cancelada no
 * cuentan. La tabla de casos es la misma que usa la conciliación en SQL.
 */
export function nivelDeCostoCompra(
  estado: EstadoCompra,
  recibidaEn: string | null = null,
): { comprometido: boolean; real: boolean } {
  switch (estado) {
    case 'CONFIRMADA':
      return { comprometido: true, real: false };
    case 'RECIBIDA':
      return { comprometido: true, real: true };
    case 'PAGADA':
      return { comprometido: true, real: recibidaEn !== null };
    case 'BORRADOR':
    case 'CANCELADA':
      return { comprometido: false, real: false };
  }
}

/** Texto corto para el panel; solo se monta cuando la compra tiene Orden. */
export function describirNivelCosto(compra: Pick<Compra, 'estado' | 'recibidaEn'>): string {
  const nivel = nivelDeCostoCompra(compra.estado, compra.recibidaEn);
  if (compra.estado === 'PAGADA' && !nivel.real) {
    return 'Cuenta como costo comprometido; no como real (sin recepción).';
  }
  if (nivel.comprometido && nivel.real) return 'Cuenta como costo comprometido y real.';
  if (nivel.comprometido) return 'Cuenta como costo comprometido.';
  return 'No cuenta como costo de la Orden.';
}
