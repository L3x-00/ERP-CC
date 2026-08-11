import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Crédito usado por el cliente = suma de cuentas por cobrar (AR) pendientes.
 *
 * HOOK PARA FASE 8 (Cobranza/AR): la cobranza real todavía no existe, así que
 * hoy devuelve 0. Cuando exista la tabla de AR, esta función suma los saldos
 * pendientes del `clienteId`. La firma es la definitiva: `verificar-credito`
 * consume el número y no necesitará cambiar.
 *
 * @param _cliente Cliente Supabase (servidor).
 * @param _clienteId Cliente a evaluar.
 * @returns Crédito usado en MXN (por ahora 0).
 */
export async function obtenerCreditoUsado(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<number> {
  // Se referencian para conservar la firma definitiva de Fase 8 sin marcarlos
  // como parámetros sin uso; hoy no hay AR que sumar.
  void cliente;
  void clienteId;
  return 0;
}
