import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { KpisSii } from '@/modulos/kpis/tipos/indice';

/** SII-B9: diccionario de KPIs §9.3 para el rango indicado (actor con permiso). */
export async function obtenerKpisSiiServicio(
  admin: SupabaseClient<Database>,
  entrada: { inicio: string; fin: string; actorId: string },
): Promise<KpisSii | null> {
  const { data, error } = await admin.rpc('obtener_kpis_sii', {
    p_inicio: entrada.inicio,
    p_fin: entrada.fin,
    p_actor_id: entrada.actorId,
  });
  if (error || !data) return null;
  return data as unknown as KpisSii;
}
