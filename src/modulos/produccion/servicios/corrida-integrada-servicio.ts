import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';
import type {
  ItemCorrida,
  TiempoItemIntegrado,
} from '@/modulos/produccion/tipos/corrida-integrada';

type Admin = SupabaseClient<Database>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function numeroONull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

/** C13.4: ítems de la corrida con avance y disponibilidad. */
export async function obtenerItemsCorridaServicio(
  admin: Admin,
  entrada: { corridaId: string; actorId: string },
): Promise<ItemCorrida[]> {
  const { data, error } = await admin.rpc('obtener_items_corrida', {
    p_corrida_id: entrada.corridaId,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    partidaId: texto(fila.partida_id),
    codigoPieza: texto(fila.codigo_pieza),
    metaProcesoId: typeof fila.meta_proceso_id === 'string' ? fila.meta_proceso_id : null,
    cantidadSolicitada: numero(fila.cantidad_solicitada),
    cantidadProducida: numero(fila.cantidad_producida),
    disponible: numeroONull(fila.disponible),
  }));
}

/** C13.4: sesiones con más de un ítem y sus tiempos por ítem. */
export async function obtenerTiemposIntegradosOrdenServicio(
  admin: Admin,
  entrada: { ordenId: string; actorId: string },
): Promise<TiempoItemIntegrado[]> {
  const { data, error } = await admin.rpc('obtener_tiempos_integrados_orden', {
    p_orden_id: entrada.ordenId,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorProduccion(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((fila) => ({
    sesionId: texto(fila.sesion_id),
    fechaInicio: texto(fila.fecha_inicio),
    operadorNombre: texto(fila.operador_nombre),
    partidaId: texto(fila.partida_id),
    codigoPieza: texto(fila.codigo_pieza),
    piezas: numero(fila.piezas),
    minutos: numero(fila.minutos),
  }));
}
