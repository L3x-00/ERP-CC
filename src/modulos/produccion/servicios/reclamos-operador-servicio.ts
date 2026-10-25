import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaAReclamoProceso,
  type ReclamoProcesoOperador,
} from '@/modulos/produccion/tipos/espacio-operador';
import {
  ErrorProduccion,
  lanzarErrorProduccion,
  sesionIniciadaDesdeRpc,
  type SesionIniciada,
} from '@/modulos/produccion/servicios/sesiones-servicio';
import type {
  IniciarProcesoReclamadoInput,
  MoverReclamoInput,
  ReclamarProcesoInput,
} from '@/modulos/produccion/validaciones/indice';

type Admin = SupabaseClient<Database>;

/**
 * C10: un reclamo reserva una operación (partida × proceso) para un día de la
 * jornada del operador. Las RPC son la única fuente de verdad: capacidad de
 * 8 h, área habilitada y exclusividad se validan en PostgreSQL.
 */

function reclamoDesdeRpc(fila: {
  id: string;
  orden_id: string;
  partida_id: string;
  meta_proceso_id: string | null;
  programacion_id: string | null;
  operador_id: string;
  fecha: string;
  turno: string;
  horas_estimadas: number;
  estado: string;
  creado_en: string;
  actualizado_en: string;
} | null): ReclamoProcesoOperador {
  if (!fila?.id) throw new ErrorProduccion('desconocido', 'No se pudo registrar el reclamo');
  return filaAReclamoProceso({
    id: fila.id,
    orden_id: fila.orden_id,
    partida_id: fila.partida_id,
    meta_proceso_id: fila.meta_proceso_id,
    programacion_id: fila.programacion_id,
    operador_id: fila.operador_id,
    fecha: fila.fecha,
    turno: fila.turno,
    horas_estimadas: fila.horas_estimadas,
    estado: fila.estado,
    creado_en: fila.creado_en,
    actualizado_en: fila.actualizado_en,
  });
}

export async function reclamarProcesoOperadorServicio(
  admin: Admin,
  entrada: ReclamarProcesoInput & { operadorId: string },
): Promise<ReclamoProcesoOperador> {
  const { data, error } = await admin.rpc('reclamar_proceso_operador', {
    p_orden_id: entrada.ordenId,
    p_partida_id: entrada.partidaId,
    p_meta_proceso_id: entrada.metaProcesoId,
    p_operador_id: entrada.operadorId,
    p_fecha: entrada.fecha,
    p_turno: entrada.turno,
  });
  if (error) lanzarErrorProduccion(error.message);
  return reclamoDesdeRpc(data?.[0] ?? null);
}

export async function moverReclamoOperadorServicio(
  admin: Admin,
  entrada: MoverReclamoInput & { operadorId: string },
): Promise<ReclamoProcesoOperador> {
  const { data, error } = await admin.rpc('mover_reclamo_operador', {
    p_reclamo_id: entrada.reclamoId,
    p_operador_id: entrada.operadorId,
    p_fecha: entrada.fecha,
    p_turno: entrada.turno,
  });
  if (error) lanzarErrorProduccion(error.message);
  return reclamoDesdeRpc(data?.[0] ?? null);
}

export async function liberarReclamoOperadorServicio(
  admin: Admin,
  entrada: { reclamoId: string; operadorId: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc('liberar_reclamo_operador', {
    p_reclamo_id: entrada.reclamoId,
    p_operador_id: entrada.operadorId,
  });
  if (error) lanzarErrorProduccion(error.message);
  return data === true;
}

/**
 * Prepara el recurso y arranca la sesión en una sola transacción: si el inicio
 * falla, la preparación se revierte y ningún recurso queda apartado.
 */
export async function iniciarProcesoReclamadoServicio(
  admin: Admin,
  entrada: IniciarProcesoReclamadoInput & { operadorId: string },
): Promise<SesionIniciada> {
  const { data, error } = await admin.rpc('iniciar_proceso_reclamado_operador', {
    p_reclamo_id: entrada.reclamoId,
    p_operador_id: entrada.operadorId,
    ...(entrada.verificacion ? { p_verificacion: entrada.verificacion } : {}),
    ...(entrada.corridaId ? { p_corrida_id: entrada.corridaId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);
  return sesionIniciadaDesdeRpc(data?.[0] ?? null);
}
