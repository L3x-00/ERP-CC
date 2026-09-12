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
 * @returns La oportunidad con sus líneas ordenadas, o `null` si no existe, RLS
 * la oculta o la consulta falla (el detalle queda en el log interno).
 */
export async function obtenerOportunidadPorId(
  cliente: SupabaseClient<Database>,
  id: string,
): Promise<OportunidadConLineas | null> {
  try {
    const { data: fila, error } = await cliente
      .from('pipeline')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new Error(`Error al cargar la oportunidad: ${error.message}`);
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
      throw new Error(`Error al cargar líneas de cotización: ${errorLineas.message}`);
    }

    return {
      oportunidad: filaAOportunidad(fila),
      lineas: (filasLineas ?? []).map(filaALineaCotizacion),
    };
  } catch (error) {
    console.error('[PIPELINE] Fallo al cargar oportunidad por id:', error);
    return null;
  }
}
