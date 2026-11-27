import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';

type Admin = SupabaseClient<Database>;

async function enLotes<T>(
  ids: readonly string[],
  consulta: (lote: string[]) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (const lote of dividirEnLotes(ids)) {
    const { data, error } = await consulta(lote);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

/**
 * C3 / P10: corridas cuyo proceso exige primera pieza y las partidas que aún
 * no la tienen aprobada. Se comparte entre el espacio del operador y la
 * proyección de lotes para que el aviso no se calcule dos veces con reglas
 * distintas. Una aprobación histórica sin partida solo cubre corridas de un
 * solo ítem.
 */
export async function obtenerCorridasConPrimeraPiezaPendiente(
  cliente: Admin,
  corridaIds: readonly string[],
): Promise<Map<string, string[]>> {
  const pendientes = new Map<string, string[]>();
  if (corridaIds.length === 0) return pendientes;

  const corridas = await enLotes<{ id: string; proceso_id: string }>(
    corridaIds,
    (lote) => cliente.from('corridas').select('id, proceso_id').in('id', lote).range(0, 999),
  );
  if (corridas.length === 0) return pendientes;

  const procesos = await enLotes<{ id: string; requiere_primera_pieza: boolean }>(
    [...new Set(corridas.map((corrida) => corrida.proceso_id))],
    (lote) => cliente
      .from('catalogo_procesos')
      .select('id, requiere_primera_pieza')
      .in('id', lote)
      .range(0, 999),
  );
  const exigen = new Set(
    procesos.filter((proceso) => proceso.requiere_primera_pieza).map((proceso) => proceso.id),
  );
  const candidatas = corridas.filter((corrida) => exigen.has(corrida.proceso_id));
  if (candidatas.length === 0) return pendientes;

  const [aprobadas, items] = await Promise.all([
    enLotes<{ corrida_id: string | null; partida_id: string | null }>(
      candidatas.map((corrida) => corrida.id),
      (lote) => cliente
        .from('inspecciones_calidad')
        .select('corrida_id, partida_id')
        .eq('tipo', 'PRIMERA_PIEZA')
        .eq('resultado', 'APROBADA')
        .in('corrida_id', lote)
        .range(0, 999),
    ),
    enLotes<{ corrida_id: string; partida_id: string }>(
      candidatas.map((corrida) => corrida.id),
      (lote) => cliente
        .from('corrida_items')
        .select('corrida_id, partida_id')
        .in('corrida_id', lote)
        .range(0, 999),
    ),
  ]);

  const itemsPorCorrida = new Map<string, string[]>();
  for (const item of items) {
    const actuales = itemsPorCorrida.get(item.corrida_id) ?? [];
    actuales.push(item.partida_id);
    itemsPorCorrida.set(item.corrida_id, actuales);
  }
  const aprobadasPorCorrida = new Map<string, Set<string>>();
  for (const fila of aprobadas) {
    if (fila.corrida_id === null) continue;
    const actuales = aprobadasPorCorrida.get(fila.corrida_id) ?? new Set<string>();
    actuales.add(fila.partida_id ?? '__sin_partida__');
    aprobadasPorCorrida.set(fila.corrida_id, actuales);
  }

  for (const corrida of candidatas) {
    const ids = itemsPorCorrida.get(corrida.id) ?? [];
    const aprobadasSet = aprobadasPorCorrida.get(corrida.id) ?? new Set<string>();
    if (ids.length === 0) {
      if (!aprobadasSet.size) pendientes.set(corrida.id, []);
      continue;
    }
    const legacy = ids.length === 1 && aprobadasSet.has('__sin_partida__');
    const faltan = ids.filter((id) => !aprobadasSet.has(id) && !legacy);
    if (faltan.length > 0) pendientes.set(corrida.id, faltan);
  }
  return pendientes;
}
