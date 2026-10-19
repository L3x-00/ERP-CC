import type { EstadoCompra } from '@/modulos/compras/tipos/indice';

export {
  ETIQUETA_RUBRO_COSTO_COMPRA,
  RUBROS_COSTO_COMPRA,
  type RubroCostoCompra,
} from '@/modulos/compras/tipos/indice';

/**
 * C10.1/F06 (F-02): qué cuenta como costo comprometido y real.
 * Confirmada = comprometido; recibida/pagada = comprometido y real.
 * Borrador y cancelada no cuentan. La tabla de casos es la misma que usará
 * C10.2 en SQL: si cambia aquí, cambia allá en la misma tanda.
 */
export function nivelDeCostoCompra(estado: EstadoCompra): { comprometido: boolean; real: boolean } {
  switch (estado) {
    case 'CONFIRMADA':
      return { comprometido: true, real: false };
    case 'RECIBIDA':
    case 'PAGADA':
      return { comprometido: true, real: true };
    case 'BORRADOR':
    case 'CANCELADA':
      return { comprometido: false, real: false };
  }
}

/** Texto corto para el panel; solo se monta cuando la compra tiene Orden. */
export function describirNivelCosto(estado: EstadoCompra): string {
  const nivel = nivelDeCostoCompra(estado);
  if (nivel.comprometido && nivel.real) return 'Cuenta como costo comprometido y real.';
  if (nivel.comprometido) return 'Cuenta como costo comprometido.';
  return 'No cuenta como costo de la Orden.';
}
