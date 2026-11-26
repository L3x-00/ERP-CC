import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import type { CorridaItem, EstadoCorrida, LoteTablero } from '@/modulos/produccion/tipos/indice';

type Admin = SupabaseClient<Database>;

/** Lotes terminados o cancelados ya no son trabajo en curso del tablero. */
const ESTADOS_LOTE_VISIBLE = ['PLANIFICADA', 'EN_PROCESO', 'PAUSADA'] as const;

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
 * Lotes en curso de las órdenes visibles. Los tableros antes solo proyectaban
 * órdenes y sesiones, así que una corrida recién creada no generaba tarjeta.
 */
export async function obtenerLotesTableroServicio(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<LoteTablero[]> {
  if (ordenIds.length === 0) return [];

  const [corridas, ordenes] = await Promise.all([
    enLotes<{
      id: string;
      codigo: string;
      estado: string;
      orden_id: string;
      proceso_id: string;
      cantidad_planificada: string | number;
      creado_en: string;
    }>(ordenIds, (lote) =>
      cliente
        .from('corridas')
        .select('id, codigo, estado, orden_id, proceso_id, cantidad_planificada, creado_en')
        .in('orden_id', lote)
        .in('estado', [...ESTADOS_LOTE_VISIBLE])
        .order('creado_en', { ascending: false })
        .order('id')),
    enLotes<{ id: string; folio: string; folio_sii: string | null; cliente_id: string }>(
      ordenIds,
      (lote) => cliente.from('ordenes_produccion').select('id, folio, folio_sii, cliente_id').in('id', lote),
    ),
  ]);
  if (corridas.length === 0) return [];

  const corridaIds = corridas.map((corrida) => corrida.id);
  const [items, procesos, clientes] = await Promise.all([
    enLotes<{ corrida_id: string; partida_id: string; codigo_item: string; cantidad: string | number }>(
      corridaIds,
      (lote) => cliente
        .from('corrida_items')
        .select('corrida_id, partida_id, codigo_item, cantidad')
        .in('corrida_id', lote),
    ),
    enLotes<{ id: string; nombre: string }>(
      [...new Set(corridas.map((corrida) => corrida.proceso_id))],
      (lote) => cliente.from('catalogo_procesos').select('id, nombre').in('id', lote),
    ),
    enLotes<{ id: string; razon_social: string; nombre_comercial: string | null }>(
      [...new Set(ordenes.map((orden) => orden.cliente_id))],
      (lote) => cliente.from('clientes').select('id, razon_social, nombre_comercial').in('id', lote),
    ),
  ]);
  const partidas = await enLotes<{ id: string; area_trabajo_codigo: string | null }>(
    [...new Set(items.map((item) => item.partida_id))],
    (lote) => cliente.from('partidas_orden_produccion').select('id, area_trabajo_codigo').in('id', lote),
  );

  const itemsPorCorrida = new Map<string, CorridaItem[]>();
  for (const item of items) {
    const actuales = itemsPorCorrida.get(item.corrida_id) ?? [];
    actuales.push({
      id: null,
      partidaId: item.partida_id,
      codigoItem: item.codigo_item,
      cantidad: Number(item.cantidad),
    });
    itemsPorCorrida.set(item.corrida_id, actuales);
  }
  const procesosPorId = new Map(procesos.map((proceso) => [proceso.id, proceso.nombre] as const));
  const clientesPorId = new Map(ordenes.map((orden) => [orden.id, orden] as const));
  const nombresClientes = new Map(
    clientes.map((cliente) => [cliente.id, cliente.nombre_comercial || cliente.razon_social] as const),
  );
  const areasPorPartida = new Map(
    partidas.map((partida) => [partida.id, partida.area_trabajo_codigo] as const),
  );

  return corridas.map((corrida): LoteTablero => {
    const orden = clientesPorId.get(corrida.orden_id);
    const corridaItems = itemsPorCorrida.get(corrida.id) ?? [];
    const areaCodigos = [...new Set(corridaItems
      .map((item) => areasPorPartida.get(item.partidaId))
      .filter((codigo): codigo is string => codigo !== null))];
    return {
      id: corrida.id,
      codigo: corrida.codigo,
      estado: corrida.estado as EstadoCorrida,
      ordenId: corrida.orden_id,
      folioOrden: orden?.folio_sii || orden?.folio || 'Orden',
      clienteNombre: orden ? nombresClientes.get(orden.cliente_id) ?? 'Cliente' : 'Cliente',
      procesoNombre: procesosPorId.get(corrida.proceso_id) ?? 'Proceso',
      areaCodigo: areaCodigos[0] ?? null,
      areaCodigos,
      cantidadPlanificada: Number(corrida.cantidad_planificada),
      items: corridaItems,
      creadoEn: corrida.creado_en,
    };
  });
}

/** Clave estable para saber si una operación ya pertenece a un lote en curso. */
export function claveLotePartida(partidaId: string, procesoNombre: string): string {
  return `${partidaId}:${procesoNombre.trim().toLowerCase()}`;
}

export function mapaLotesPorOperacion(
  lotes: readonly LoteTablero[],
): Map<string, LoteTablero> {
  const mapa = new Map<string, LoteTablero>();
  // Los lotes llegan del más reciente al más antiguo: si quedaron lotes
  // duplicados de antes de esta regla, la operación se asocia al último creado.
  for (const lote of lotes) {
    for (const item of lote.items) {
      const clave = claveLotePartida(item.partidaId, lote.procesoNombre);
      if (!mapa.has(clave)) mapa.set(clave, lote);
    }
  }
  return mapa;
}
