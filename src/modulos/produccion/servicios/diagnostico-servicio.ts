import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorProduccion,
  lanzarErrorProduccion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** C23: una inconsistencia accionable detectada en una orden de producción. */
export interface DiagnosticoOrdenItem {
  codigo: string;
  severidad: 'alta' | 'media' | 'baja';
  partidaId: string | null;
  sesionId: string | null;
  programacionId: string | null;
  detalle: string;
  valorActual: number | null;
  valorEsperado: number | null;
}

function severidadDesdeBase(valor: string): DiagnosticoOrdenItem['severidad'] {
  if (valor === 'alta' || valor === 'media' || valor === 'baja') return valor;
  return 'media';
}

/**
 * C23: lectura de consistencia de una orden. No modifica datos; el
 * administrador decide qué corregir a partir de las filas devueltas.
 */
export async function obtenerDiagnosticoOrdenServicio(
  admin: Admin,
  ordenId: string,
): Promise<DiagnosticoOrdenItem[]> {
  const { data, error } = await admin.rpc('diagnostico_consistencia_orden', {
    p_orden_id: ordenId,
  });
  if (error) lanzarErrorProduccion(error.message);
  return (data ?? []).map((fila) => ({
    codigo: fila.codigo,
    severidad: severidadDesdeBase(fila.severidad),
    partidaId: fila.partida_id,
    sesionId: fila.sesion_id,
    programacionId: fila.programacion_id,
    detalle: fila.detalle,
    valorActual: fila.valor_actual === null ? null : Number(fila.valor_actual),
    valorEsperado: fila.valor_esperado === null ? null : Number(fila.valor_esperado),
  }));
}

export interface PausaHuerfanaCerrada {
  id: string;
  estadoSesion: string;
  horasNetas: number;
  estadoPlaneacion: string;
  tiempoRealMinutos: number;
  actualizadoEn: string;
}

/**
 * C23: cierra una pausa atrapada en una orden ya terminada. El administrador
 * decide si conserva el tiempo (y puede declarar horas reales) o lo descarta;
 * la RPC no modifica piezas y deja evento de auditoría.
 */
export async function cerrarPausaHuerfanaServicio(
  admin: Admin,
  entrada: {
    sesionId: string;
    actorId: string;
    conservarTiempo: boolean;
    horasReales?: number | null;
    motivo?: string | null;
    correlationId?: string | null;
  },
): Promise<PausaHuerfanaCerrada> {
  const { data, error } = await admin.rpc('cerrar_pausa_huerfana_administrativa', {
    p_sesion_id: entrada.sesionId,
    p_actor_id: entrada.actorId,
    p_conservar_tiempo: entrada.conservarTiempo,
    p_horas_reales: entrada.horasReales ?? undefined,
    p_motivo: entrada.motivo ?? undefined,
    p_correlation_id: entrada.correlationId ?? undefined,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = data?.[0];
  if (!fila?.id || !fila.actualizado_en) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    estadoSesion: fila.estado_sesion,
    horasNetas: Number(fila.horas_netas),
    estadoPlaneacion: fila.estado_planeacion,
    tiempoRealMinutos: Number(fila.tiempo_real_minutos),
    actualizadoEn: fila.actualizado_en,
  };
}
