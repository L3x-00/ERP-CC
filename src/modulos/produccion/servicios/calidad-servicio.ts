import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/compartido/tipos/supabase';
import { inspeccionDesdeJson, type InspeccionCalidad } from '@/modulos/produccion/tipos/corridas';
import type { RegistrarInspeccionInput } from '@/modulos/produccion/validaciones/corridas';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** Registra primera pieza, referencia de lote o cierre (§6.3). */
export async function registrarInspeccionServicio(
  admin: Admin,
  entrada: RegistrarInspeccionInput & { actorId: string; correlationId?: string },
): Promise<InspeccionCalidad> {
  const { data, error } = await admin.rpc('registrar_inspeccion', {
    p_orden_id: entrada.ordenId,
    p_corrida_id: entrada.corridaId ?? null,
    p_partida_id: entrada.partidaId ?? null,
    p_codigo_item: entrada.codigoItem,
    p_tipo: entrada.tipo,
    p_referencia: entrada.referencia ?? null,
    p_resultado: entrada.resultado,
    p_tolerancias: (entrada.tolerancias ?? {}) as Json,
    p_cantidad_inspeccionada: entrada.cantidadInspeccionada,
    p_cantidad_ok: entrada.cantidadOk,
    p_cantidad_nok: entrada.cantidadNok,
    p_cantidad_retrabajo: entrada.cantidadRetrabajo,
    p_material_usado: (entrada.materialUsado ?? {}) as Json,
    p_observaciones: entrada.observaciones ?? null,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const inspeccion = inspeccionDesdeJson(data);
  if (!inspeccion) throw new Error('Respuesta inválida al registrar la inspección');
  return inspeccion;
}
