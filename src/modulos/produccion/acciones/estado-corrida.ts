'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  cambiarEstadoCorridaServicio,
  type ResultadoEstadoCorrida,
} from '@/modulos/produccion/servicios/corridas-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import { esquemaEstadoCorrida } from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccion } from './utilidades-acciones';

async function ejecutarCambio(
  accion: 'iniciar' | 'completar' | 'cancelar',
  entradas: unknown,
): Promise<RespuestaAccion<ResultadoEstadoCorrida>> {
  const resultado = esquemaEstadoCorrida.safeParse({ ...(entradas as object), accion });
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  const permiso = accion === 'cancelar' ? 'gestionar_produccion' : 'produccion_operar';
  const autorizado = accion === 'cancelar'
    ? await can(actor, permiso)
    : (await can(actor, permiso)) || (await can(actor, 'gestionar_produccion'));
  if (!autorizado) {
    return { exito: false, error: 'Sin permiso para operar corridas' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const estado = await cambiarEstadoCorridaServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
      correlationId,
    });
    await registrarLog(actor, `${accion}_corrida`, 'produccion', estado.id, {
      estado: estado.estado,
      ...(resultado.data.motivo ? { motivo: resultado.data.motivo } : {}),
    }, correlationId);
    return { exito: true, datos: estado };
  } catch (error) {
    console.error(`[PRODUCCION] Error al ${accion} corrida:`, error);
    await registrarLog(actor, `${accion}_corrida_rechazado`, 'produccion', resultado.data.corridaId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}

/** Inicia la corrida con checklist completo de eventos críticos. */
export async function iniciarCorridaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEstadoCorrida>> {
  return ejecutarCambio('iniciar', entrada);
}

/** Completa la corrida cuando todas las metas de sus ítems cerraron. */
export async function completarCorridaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEstadoCorrida>> {
  return ejecutarCambio('completar', entrada);
}

/** Cancela la corrida (motivo obligatorio, sin producción finalizada). */
export async function cancelarCorridaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoEstadoCorrida>> {
  return ejecutarCambio('cancelar', entrada);
}
