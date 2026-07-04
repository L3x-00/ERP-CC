import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Genera el siguiente folio OP-XXXX de forma atómica.
 *
 * Delega en la función SQL `generar_folio_op` (SECURITY DEFINER), que usa una
 * SEQUENCE de Postgres — nunca produce duplicados, ni bajo concurrencia. El
 * cliente se recibe por parámetro (inyección) para poder probar la atomicidad
 * con un cliente service-role en pruebas de integración.
 *
 * @param cliente Cliente Supabase (servidor o admin).
 * @returns Folio con formato `OP-0001`.
 * @throws Error si la RPC falla.
 */
export async function generarFolioOp(cliente: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await cliente.rpc('generar_folio_op');
  if (error || !data) {
    throw new Error('No se pudo generar el folio OP');
  }
  return data;
}
