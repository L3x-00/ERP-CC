import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/** Ventana de consumo para el cálculo automático de tier. */
const MESES_CONSUMO = 3;

/**
 * Consumo acumulado del cliente en MXN de los últimos 3 meses: suma de las
 * cuentas por cobrar no canceladas emitidas en la ventana [ahora − 3 meses,
 * ahora], convertidas a MXN con `tipo_cambio_origen` (MXN por unidad de la
 * moneda de la cuenta).
 *
 * La consulta corre con el cliente recibido, por lo que RLS decide si el
 * consumidor puede leer las AR (permiso `ver_finanzas`). Si la lectura falla
 * no se rompe la ficha: se registra el error y se devuelve 0.
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param clienteId Cliente a evaluar.
 * @returns Consumo en MXN de la ventana, redondeado a 4 decimales (0 si no hay).
 */
export async function calcularConsumoUltimos3Meses(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<number> {
  const desde = new Date();
  desde.setUTCMonth(desde.getUTCMonth() - MESES_CONSUMO);

  const { data, error } = await cliente
    .from('cuentas_por_cobrar')
    .select('monto_total, tipo_cambio_origen')
    .eq('cliente_id', clienteId)
    .neq('estado', 'cancelado')
    .gte('creado_en', desde.toISOString());

  if (error) {
    console.error('[CLIENTES] No se pudo calcular el consumo del cliente:', error.message);
    return 0;
  }

  const total = (data ?? []).reduce((acumulado, cuenta) => {
    const monto = Number(cuenta.monto_total);
    const tipoCambio = Number(cuenta.tipo_cambio_origen);
    if (!Number.isFinite(monto) || monto < 0 || !Number.isFinite(tipoCambio) || tipoCambio <= 0) {
      return acumulado;
    }
    return acumulado + monto * tipoCambio;
  }, 0);

  return Number.isFinite(total) ? Number(total.toFixed(4)) : 0;
}
