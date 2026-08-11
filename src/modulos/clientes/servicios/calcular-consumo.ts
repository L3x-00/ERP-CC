import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Consumo acumulado del cliente en MXN de los últimos 3 meses (facturación).
 *
 * HOOK PARA FASE 8 (Cobranza/AR): la facturación real todavía no existe, así que
 * hoy devuelve 0 (todos los clientes caen a Bronce salvo tier manual). Cuando
 * exista la tabla de facturas/AR, esta función suma los montos facturados del
 * `clienteId` en la ventana [ahora − 3 meses, ahora]. La firma ya es la
 * definitiva para no tocar los consumidores (calcular-tier) al implementarla.
 *
 * @param _cliente Cliente Supabase (servidor).
 * @param _clienteId Cliente a evaluar.
 * @returns Consumo en MXN (por ahora 0).
 */
export async function calcularConsumoUltimos3Meses(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<number> {
  // Se referencian para conservar la firma definitiva de Fase 8 sin marcarlos
  // como parámetros sin uso; hoy no hay facturación que consultar.
  void cliente;
  void clienteId;
  return 0;
}
