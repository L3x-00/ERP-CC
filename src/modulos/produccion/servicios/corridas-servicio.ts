import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { corridaDesdeJson, type Corrida, type EstadoCorrida } from '@/modulos/produccion/tipos/corridas';
import type {
  CrearCorridaInput,
  EstadoCorridaInput,
} from '@/modulos/produccion/validaciones/corridas';
import { lanzarErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

export type ResultadoEstadoCorrida = { id: string; estado: EstadoCorrida };

export type ReclamacionRecurso = {
  sesionId: string;
  recursoId: string;
  ordenId: string;
  partidaId: string;
  motivoPausaCodigo: string | null;
  pausadaDesde: string | null;
};

export type ResultadoCerrarJornada = { fecha: string; sesionesCerradas: number };

export type AutorizacionHorasExtraRegistrada = {
  id: string;
  ordenId: string;
  sesionId: string | null;
  horasAutorizadas: number;
  estado: string;
};

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function estadoCorridaDesde(valor: unknown): EstadoCorrida {
  const estados: readonly EstadoCorrida[] = [
    'PLANIFICADA', 'EN_PROCESO', 'PAUSADA', 'COMPLETADA', 'CANCELADA',
  ];
  const estado = texto(valor) as EstadoCorrida;
  return estados.includes(estado) ? estado : 'PLANIFICADA';
}

/** Crea una corrida con ítems compatibles; devuelve la corrida creada. */
export async function crearCorridaServicio(
  admin: Admin,
  entrada: CrearCorridaInput & { actorId: string },
): Promise<Corrida> {
  const { data, error } = await admin.rpc('crear_corrida', {
    p_orden_id: entrada.ordenId,
    p_proceso_id: entrada.procesoId,
    p_items: entrada.items.map((item) => ({
      partida_id: item.partidaId,
      ...(item.cantidad !== undefined ? { cantidad: item.cantidad } : {}),
    })),
    p_actor_id: entrada.actorId,
    ...(entrada.corridaOrigenId ? { p_corrida_origen_id: entrada.corridaOrigenId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const corrida = corridaDesdeJson(data);
  if (!corrida) throw new Error('Respuesta inválida al crear la corrida');
  return corrida;
}

/** Cambia el estado de la corrida con la acción indicada (iniciar/completar/cancelar). */
export async function cambiarEstadoCorridaServicio(
  admin: Admin,
  entrada: EstadoCorridaInput & { actorId: string; correlationId?: string },
): Promise<ResultadoEstadoCorrida> {
  const args = {
    p_corrida_id: entrada.corridaId,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  };

  const respuesta = entrada.accion === 'iniciar'
    ? await admin.rpc('iniciar_corrida', { ...args, p_verificacion: entrada.verificacion! })
    : entrada.accion === 'completar'
      ? await admin.rpc('completar_corrida', args)
      : await admin.rpc('cancelar_corrida', { ...args, p_motivo: entrada.motivo! });

  if (respuesta.error) lanzarErrorProduccion(respuesta.error.message);
  const fila = (respuesta.data ?? {}) as Record<string, unknown>;
  return { id: texto(fila.id) || entrada.corridaId, estado: estadoCorridaDesde(fila.estado) };
}

/** Marca `recurso_liberado` en la sesión pausada ≥60 min con motivo liberable. */
export async function reclamarRecursoLiberadoServicio(
  admin: Admin,
  entrada: { recursoId: string; actorId: string; correlationId?: string },
): Promise<ReclamacionRecurso> {
  const { data, error } = await admin.rpc('reclamar_recurso_liberado', {
    p_recurso_id: entrada.recursoId,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  if (!texto(fila.sesion_id)) throw new Error('Respuesta inválida al reclamar el recurso');
  return {
    sesionId: texto(fila.sesion_id),
    recursoId: texto(fila.recurso_id),
    ordenId: texto(fila.orden_id),
    partidaId: texto(fila.partida_id),
    motivoPausaCodigo: typeof fila.motivo_pausa_codigo === 'string' ? fila.motivo_pausa_codigo : null,
    pausadaDesde: typeof fila.pausada_desde === 'string' ? fila.pausada_desde : null,
  };
}

/** Cierra las sesiones activas del día con FIN_JORNADA (sin cruzar de fecha). */
export async function cerrarJornadaServicio(
  admin: Admin,
  entrada: { fecha: string; actorId: string; correlationId?: string },
): Promise<ResultadoCerrarJornada> {
  const { data, error } = await admin.rpc('cerrar_jornada', {
    p_fecha: entrada.fecha,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  return {
    fecha: texto(fila.fecha) || entrada.fecha,
    sesionesCerradas: numero(fila.sesiones_cerradas),
  };
}

/** Registra una autorización VIGENTE de horas extra (Management/Admin). */
export async function autorizarHorasExtraServicio(
  admin: Admin,
  entrada: {
    ordenId: string;
    sesionId?: string | null;
    horas: number;
    motivo: string;
    actorId: string;
    correlationId?: string;
  },
): Promise<AutorizacionHorasExtraRegistrada> {
  const { data, error } = await admin.rpc('autorizar_horas_extra', {
    p_orden_id: entrada.ordenId,
    p_sesion_id: entrada.sesionId ?? null,
    p_horas: entrada.horas,
    p_motivo: entrada.motivo,
    p_actor_id: entrada.actorId,
    ...(entrada.correlationId ? { p_correlation_id: entrada.correlationId } : {}),
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = (data ?? {}) as Record<string, unknown>;
  if (!texto(fila.id)) throw new Error('Respuesta inválida al autorizar horas extra');
  return {
    id: texto(fila.id),
    ordenId: texto(fila.orden_id),
    sesionId: typeof fila.sesion_id === 'string' ? fila.sesion_id : null,
    horasAutorizadas: numero(fila.horas_autorizadas),
    estado: texto(fila.estado) || 'VIGENTE',
  };
}
