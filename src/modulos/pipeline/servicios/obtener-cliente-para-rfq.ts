import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { CondicionesPago } from '@/modulos/pipeline/tipos/indice';

/** Datos del cliente que la RFQ necesita del servidor al ligarlo (RFQ-02/03). */
export type ClienteParaRfq = {
  id: string;
  condicionesPago: CondicionesPago | null;
};

const CONDICIONES: readonly CondicionesPago[] = ['contado', '15_dias', '30_dias', 'credito'];

/**
 * Carga, BAJO RLS, el cliente al que se quiere ligar una RFQ.
 *
 * Es a la vez la verificación de autorización (si el usuario no puede ver
 * clientes, RLS devuelve vacío y esto es `null`) y la fuente de las condiciones
 * de pago que hereda la oportunidad. Nunca usar el cliente admin aquí: ligar una
 * RFQ no puede ser un oráculo de clientes que el vendedor no ve.
 *
 * @param cliente Cliente Supabase del servidor (con la sesión del usuario).
 * @param clienteId Identificador del cliente.
 * @returns El cliente reducido, o `null` si no existe o RLS lo oculta.
 */
export async function obtenerClienteParaRfq(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<ClienteParaRfq | null> {
  const { data, error } = await cliente
    .from('clientes')
    .select('id, condiciones_pago')
    .eq('id', clienteId)
    .maybeSingle();

  if (error) {
    console.error('[PIPELINE] Fallo al verificar el cliente de la RFQ:', error.message);
    return null;
  }
  if (!data) {
    return null;
  }

  const condiciones = data.condiciones_pago;
  return {
    id: data.id,
    condicionesPago:
      condiciones !== null && (CONDICIONES as readonly string[]).includes(condiciones)
        ? (condiciones as CondicionesPago)
        : null,
  };
}
