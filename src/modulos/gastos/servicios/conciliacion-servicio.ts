import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { ErrorGastos } from '@/modulos/gastos/servicios/gastos-servicio';
import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/conciliacion';
import { esquemaConciliacionCostosOrden } from '@/modulos/gastos/validaciones/conciliacion';

/**
 * C10.2: lee la conciliación Estimado/Comprometido/Real de una Orden.
 * El contrato se valida aquí; si la migración no está aplicada o cambia de
 * forma, la UI recibe un error y no ceros silenciosos.
 */
export async function obtenerConciliacionCostosOrdenServicio(
  admin: SupabaseClient<Database>,
  ordenId: string,
): Promise<ConciliacionCostosOrden> {
  const { data, error } = await admin.rpc('obtener_conciliacion_costos_orden', {
    p_orden_id: ordenId,
  });
  if (error) {
    if (error.message.includes('orden_inexistente')) throw new ErrorGastos('orden_inexistente');
    throw new ErrorGastos('desconocido', error.message);
  }

  const analisis = esquemaConciliacionCostosOrden.safeParse(data);
  if (!analisis.success) {
    console.error('[GASTOS] Conciliación con contrato inválido:', analisis.error.issues);
    throw new ErrorGastos('conciliacion_invalida');
  }
  return analisis.data;
}
