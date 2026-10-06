import type {
  PartidaPendiente,
  PendienteEntregaItem,
} from '@/modulos/entregas/tipos/indice';

/**
 * Agrupa las partidas de una orden por ítem (ITxx) para preparar una entrega:
 * suma lo entregado histórico y calcula pendiente (solicitada − entregada) y
 * disponible (producida − entregada), ambos ≥ 0.
 *
 * Los renglones históricos sin `codigo_item` se agrupan por `codigo_pieza`, de
 * modo que las órdenes legacy también muestran sus pendientes.
 */
export function agruparPendientesPorItem(
  partidas: readonly PartidaPendiente[],
): PendienteEntregaItem[] {
  const grupos = new Map<string, PendienteEntregaItem>();

  for (const partida of partidas) {
    const codigo = partida.codigoItem?.trim() || partida.codigoPieza;
    const existente = grupos.get(codigo);
    const cantidadSolicitada = Number.isFinite(partida.cantidadSolicitada)
      ? partida.cantidadSolicitada
      : 0;
    const cantidadProducida = Number.isFinite(partida.cantidadProducida)
      ? partida.cantidadProducida
      : 0;
    const cantidadEntregada = Number.isFinite(partida.cantidadEntregada)
      ? partida.cantidadEntregada
      : 0;

    if (existente) {
      existente.partidaIds.push(partida.id);
      existente.cantidadSolicitada += cantidadSolicitada;
      existente.cantidadProducida += cantidadProducida;
      existente.cantidadEntregada += cantidadEntregada;
      continue;
    }

    grupos.set(codigo, {
      codigoItem: codigo,
      descripcion: partida.descripcion ?? '',
      partidaIds: [partida.id],
      cantidadSolicitada,
      cantidadProducida,
      cantidadEntregada,
      pendiente: 0,
      disponible: 0,
    });
  }

  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      pendiente: Math.max(grupo.cantidadSolicitada - grupo.cantidadEntregada, 0),
      disponible: Math.max(grupo.cantidadProducida - grupo.cantidadEntregada, 0),
    }))
    .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem));
}

/** Suma de cantidades pendientes de un conjunto de ítems. */
export function totalPendiente(items: readonly PendienteEntregaItem[]): number {
  return items.reduce((suma, item) => suma + item.pendiente, 0);
}
