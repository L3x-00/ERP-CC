import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';

/** Partida tal como la necesita el saldo de entrega (R12/R13 de la tanda C8.4). */
export type PartidaSaldoEntrega = {
  cantidadSolicitada: number;
  cantidadProducida: number;
  /** Suma de `cantidad_entregada` del historial de notas de esta partida. */
  cantidadEntregada?: number | null;
};

export type SaldoEntrega = {
  solicitado: number;
  entregado: number;
  /** Partes pendientes de entrega (0 cuando el cierre está permitido). */
  faltan: number;
  /**
   * Espeja la regla SQL del cierre (`20261007120002`:201-212): para toda partida,
   * suma de `cantidad_entregada` >= `cantidad_solicitada`. Es ayuda visual; la RPC
   * `cerrar_orden_administrativa` sigue siendo la autoridad.
   */
  cierrePermitido: boolean;
  /**
   * O-01 A (scrap): se produjo menos de lo solicitado y ya está todo entregado.
   * El texto de la UI no debe pedir entregar lo imposible.
   */
  requiereDecisionFaltante: boolean;
};

/** Saldo de entrega agregado de una orden, con la misma regla del cierre SQL. */
export function calcularSaldoEntrega(partidas: PartidaSaldoEntrega[]): SaldoEntrega {
  const solicitado = partidas.reduce((suma, partida) => suma + Math.max(0, partida.cantidadSolicitada), 0);
  const entregado = partidas.reduce(
    (suma, partida) => suma + Math.max(0, partida.cantidadEntregada ?? 0),
    0,
  );
  const producido = partidas.reduce((suma, partida) => suma + Math.max(0, partida.cantidadProducida), 0);
  const faltan = Math.max(0, solicitado - entregado);
  const cierrePermitido = solicitado > 0 ? faltan === 0 : true;
  const requiereDecisionFaltante = !cierrePermitido && producido <= entregado;

  return { solicitado, entregado, faltan, cierrePermitido, requiereDecisionFaltante };
}

/**
 * Etiqueta del estado de entrega entre producción y cierre (R13, D4=A).
 * `null` cuando no aplica: sin solicitado, entrega completa (la orden ya pasó a
 * CERRADA) o estados previos al compromiso de entrega (CERRADA/CANCELADA).
 * En `EN_PRODUCCION` solo señala un parcial histórico (O-08: ya no se entrega
 * antes de producir); sin entregas la pendiente la cubre el propio estado SII.
 */
export function etiquetaEntrega(entrada: {
  estadoSii: EstadoSiiOrden;
  solicitado: number;
  entregado: number;
}): 'Pendiente de entrega' | `Entrega parcial ${number}/${number}` | null {
  const { estadoSii, solicitado, entregado } = entrada;
  if (estadoSii !== 'PRODUCCION_COMPLETADA' && estadoSii !== 'EN_PRODUCCION') return null;
  if (solicitado <= 0) return null;
  if (entregado <= 0) {
    return estadoSii === 'PRODUCCION_COMPLETADA' ? 'Pendiente de entrega' : null;
  }
  if (entregado >= solicitado) return null;
  return `Entrega parcial ${entregado}/${solicitado}`;
}
