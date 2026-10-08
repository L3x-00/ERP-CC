import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

export type CausaVersionRfq = 'CABECERA' | 'ITEM';

/**
 * C2.1/DC-04: registra el snapshot append-only de cabecera + ítems después de
 * un guardado. Nunca rompe la acción: el guardado ya ocurrió y un fallo aquí
 * solo deja ese cambio sin versión, así que se reporta en el log del servidor.
 */
export async function registrarVersionRfq(
  admin: SupabaseClient<Database>,
  entrada: { rfqId: string; causa: CausaVersionRfq; actorId: string; correlationId: string },
): Promise<void> {
  const { error } = await admin.rpc('registrar_version_rfq', {
    p_rfq_id: entrada.rfqId,
    p_causa: entrada.causa,
    p_actor_id: entrada.actorId,
    p_correlation_id: entrada.correlationId,
  });
  if (error) {
    console.error('[RFQ] No se pudo registrar la versión del RFQ:', error.message);
  }
}
