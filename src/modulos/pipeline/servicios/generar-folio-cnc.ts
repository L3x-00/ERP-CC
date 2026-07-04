import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Genera el siguiente folio CNC-MMYY-XXXX de forma atómica.
 *
 * Delega en la función SQL `generar_folio_cnc` (SECURITY DEFINER), que usa una
 * tabla contador con UPSERT+RETURNING en un solo statement — atómico y con
 * reinicio por mes (MMYY). El cliente se recibe por parámetro para poder
 * probar la atomicidad con un cliente service-role en pruebas de integración.
 *
 * @param cliente Cliente Supabase (servidor o admin).
 * @returns Folio con formato `CNC-0726-0001`.
 * @throws Error si la RPC falla.
 */
export async function generarFolioCnc(cliente: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await cliente.rpc('generar_folio_cnc');
  if (error || !data) {
    throw new Error('No se pudo generar el folio CNC');
  }
  return data;
}
