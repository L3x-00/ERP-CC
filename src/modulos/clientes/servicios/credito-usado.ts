import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Crédito usado por el cliente = suma de cuentas AR pendientes en MXN.
 * `tipo_cambio_origen` significa MXN por unidad de la moneda de cada cuenta.
 */
export async function obtenerCreditoUsado(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<number> {
  const { data, error } = await cliente
    .from('cuentas_por_cobrar')
    .select('saldo_pendiente, tipo_cambio_origen')
    .eq('cliente_id', clienteId)
    .in('estado', ['pendiente', 'parcial']);

  if (error) {
    throw new Error('No se pudo calcular el crédito usado');
  }

  const total = (data ?? []).reduce((acumulado, cuenta) => {
    const saldo = Number(cuenta.saldo_pendiente);
    const tipoCambio = Number(cuenta.tipo_cambio_origen);
    if (!Number.isFinite(saldo) || saldo < 0 || !Number.isFinite(tipoCambio) || tipoCambio <= 0) {
      return acumulado;
    }
    return acumulado + saldo * tipoCambio;
  }, 0);

  return Number.isFinite(total) ? Number(total.toFixed(4)) : 0;
}
