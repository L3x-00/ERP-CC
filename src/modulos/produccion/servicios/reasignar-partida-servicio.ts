import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** C31/A4: resultado de reasignar el responsable de una partida. */
export interface ReasignacionPartida {
  partidaId: string;
  ordenId: string;
  operadorAsignadoId: string;
  operadorNombre: string | null;
  yaAplicado: boolean;
  reclamosLiberados: number;
  reasignadaPor: string | null;
  reasignadaPorNombre: string | null;
  reasignadaEn: string | null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function textoNulo(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

export async function reasignarPartidaServicio(
  admin: Admin,
  entrada: {
    partidaId: string;
    operadorNuevoId: string;
    actorId: string;
    correlationId?: string;
  },
): Promise<ReasignacionPartida> {
  const { data, error } = await admin.rpc('reasignar_partida_operador', {
    p_partida_id: entrada.partidaId,
    p_operador_nuevo: entrada.operadorNuevoId,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  if (!texto(fila.partida_id)) throw new Error('Respuesta inválida al reasignar la partida');
  return {
    partidaId: texto(fila.partida_id),
    ordenId: texto(fila.orden_id),
    operadorAsignadoId: texto(fila.operador_asignado_id),
    operadorNombre: textoNulo(fila.operador_nombre),
    yaAplicado: fila.ya_aplicado === true,
    reclamosLiberados: Number(fila.reclamos_liberados ?? 0),
    reasignadaPor: textoNulo(fila.reasignada_por),
    reasignadaPorNombre: textoNulo(fila.reasignada_por_nombre),
    reasignadaEn: textoNulo(fila.reasignada_en),
  };
}
