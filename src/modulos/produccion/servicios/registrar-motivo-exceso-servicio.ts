import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** C31/A12: motivo de la demora sobre el tiempo estimado de la operación. */
export interface MotivoExcesoRegistrado {
  sesionId: string;
  motivoExceso: 'OLVIDE_CERRAR' | 'OTRO';
  detalle: string;
  yaAplicado: boolean;
}

export async function registrarMotivoExcesoSesionServicio(
  admin: Admin,
  entrada: {
    sesionId: string;
    operadorId: string;
    motivoExceso: 'OLVIDE_CERRAR' | 'OTRO';
    detalleExceso: string;
  },
): Promise<MotivoExcesoRegistrado> {
  const { data, error } = await admin.rpc('registrar_motivo_exceso_sesion', {
    p_sesion_id: entrada.sesionId,
    p_operador_id: entrada.operadorId,
    p_motivo: entrada.motivoExceso,
    p_detalle: entrada.detalleExceso,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  if (typeof fila.sesion_id !== 'string') throw new Error('Respuesta inválida al registrar el motivo de la demora');
  return {
    sesionId: fila.sesion_id,
    motivoExceso: fila.motivo_exceso === 'OTRO' ? 'OTRO' : 'OLVIDE_CERRAR',
    detalle: String(fila.motivo_exceso_detalle ?? ''),
    yaAplicado: fila.ya_aplicado === true,
  };
}
