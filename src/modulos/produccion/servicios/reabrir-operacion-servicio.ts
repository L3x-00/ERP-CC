import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** C31/A2: resultado de reabrir una operación bloqueada sin sesión. */
export interface ReaperturaOperacion {
  programacionId: string;
  ordenId: string;
  partidaId: string;
  estadoPlaneacion: string;
  yaAplicado: boolean;
  reclamosLiberados: number;
  reabiertaPor: string | null;
  reabiertaPorNombre: string | null;
  reabiertaEn: string | null;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function textoNulo(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

export async function reabrirOperacionBloqueadaServicio(
  admin: Admin,
  entrada: {
    programacionId: string;
    actorId: string;
    correlationId?: string;
  },
): Promise<ReaperturaOperacion> {
  const { data, error } = await admin.rpc('reabrir_operacion_bloqueada', {
    p_programacion_id: entrada.programacionId,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  if (!texto(fila.programacion_id)) throw new Error('Respuesta inválida al reabrir la operación');
  return {
    programacionId: texto(fila.programacion_id),
    ordenId: texto(fila.orden_id),
    partidaId: texto(fila.partida_id),
    estadoPlaneacion: texto(fila.estado_planeacion),
    yaAplicado: fila.ya_aplicado === true,
    reclamosLiberados: Number(fila.reclamos_liberados ?? 0),
    reabiertaPor: textoNulo(fila.reabierta_por),
    reabiertaPorNombre: textoNulo(fila.reabierta_por_nombre),
    reabiertaEn: textoNulo(fila.reabierta_en),
  };
}
