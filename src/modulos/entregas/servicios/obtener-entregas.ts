import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAEntrega,
  filaARenglonEntrega,
  type Entrega,
  type PartidaPendiente,
  type PendienteEntregaItem,
  type RenglonEntrega,
} from '@/modulos/entregas/tipos/indice';
import { agruparPendientesPorItem } from '@/modulos/entregas/servicios/agrupar-pendientes';

/** Entrega con sus renglones. */
export type EntregaConRenglones = Entrega & { renglones: RenglonEntrega[] };

/** Entregas de una orden, más recientes primero. */
export async function obtenerEntregasDeOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<EntregaConRenglones[]> {
  const { data: notas, error } = await cliente
    .from('notas_entrega')
    .select('*')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });
  if (error) {
    throw new Error('No se pudieron cargar las entregas');
  }
  const entregas = (notas ?? []).map(filaAEntrega);
  if (entregas.length === 0) return [];

  const { data: renglones } = await cliente
    .from('partidas_nota_entrega')
    .select('*')
    .in(
      'nota_entrega_id',
      entregas.map((entrega) => entrega.id),
    );

  const porNota = new Map<string, RenglonEntrega[]>();
  for (const fila of renglones ?? []) {
    const renglon = filaARenglonEntrega(fila);
    const lista = porNota.get(renglon.notaEntregaId) ?? [];
    lista.push(renglon);
    porNota.set(renglon.notaEntregaId, lista);
  }

  return entregas.map((entrega) => ({
    ...entrega,
    renglones: porNota.get(entrega.id) ?? [],
  }));
}

/** Pendientes por ITxx de una orden (solicitada − entregada, producida − entregada). */
export async function obtenerPendientesDeOrden(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<PendienteEntregaItem[]> {
  const { data: partidas, error } = await cliente
    .from('partidas_orden_produccion')
    .select('id, codigo_item, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida')
    .eq('orden_id', ordenId)
    .order('codigo_pieza', { ascending: true });
  if (error) {
    throw new Error('No se pudieron cargar las partidas');
  }

  const { data: notas } = await cliente
    .from('notas_entrega')
    .select('id')
    .eq('orden_id', ordenId);
  const notaIds = (notas ?? []).map((nota) => nota.id);

  const entregadoPorPartida = new Map<string, number>();
  if (notaIds.length > 0) {
    const { data: renglones } = await cliente
      .from('partidas_nota_entrega')
      .select('partida_id, cantidad_entregada')
      .in('nota_entrega_id', notaIds);
    for (const renglon of renglones ?? []) {
      entregadoPorPartida.set(
        renglon.partida_id,
        (entregadoPorPartida.get(renglon.partida_id) ?? 0) + Number(renglon.cantidad_entregada),
      );
    }
  }

  const base: PartidaPendiente[] = (partidas ?? []).map((partida) => ({
    id: partida.id,
    codigoItem: partida.codigo_item ?? null,
    codigoPieza: partida.codigo_pieza,
    descripcion: partida.descripcion ?? null,
    cantidadSolicitada: Number(partida.cantidad_solicitada),
    cantidadProducida: Number(partida.cantidad_producida),
    cantidadEntregada: entregadoPorPartida.get(partida.id) ?? 0,
  }));

  return agruparPendientesPorItem(base);
}
