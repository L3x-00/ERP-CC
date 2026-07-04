import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaALineaCotizacion,
  filaAOportunidad,
} from '@/modulos/pipeline/tipos/indice';
import type { LineaCotizacion, Oportunidad } from '@/modulos/pipeline/tipos/indice';

/** Oportunidad junto con sus líneas de cotización asociadas. */
export type OportunidadConLineas = {
  oportunidad: Oportunidad;
  lineas: LineaCotizacion[];
};

/**
 * Carga una oportunidad por id con sus líneas de cotización.
 *
 * Devuelve `null` tanto si la oportunidad no existe como si RLS la oculta al
 * usuario actual (indistinguibles a propósito: no se filtra su existencia).
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param id Identificador de la oportunidad.
 * @returns La oportunidad con sus líneas ordenadas, o `null`.
 * @throws Error si la consulta falla por un motivo distinto a "no encontrada".
 */
export async function obtenerOportunidadPorId(
  cliente: SupabaseClient<Database>,
  id: string,
): Promise<OportunidadConLineas | null> {
  const { data: fila, error } = await cliente
    .from('pipeline')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error('No se pudo cargar la oportunidad');
  }
  if (!fila) {
    return null;
  }

  const { data: filasLineas, error: errorLineas } = await cliente
    .from('cotizacion_lineas')
    .select('*')
    .eq('pipeline_id', id)
    .order('orden', { ascending: true });
  if (errorLineas) {
    throw new Error('No se pudieron cargar las líneas de la cotización');
  }

  return {
    oportunidad: filaAOportunidad(fila),
    lineas: (filasLineas ?? []).map(filaALineaCotizacion),
  };
}
