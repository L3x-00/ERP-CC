'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  reclamarRecursoLiberadoServicio,
  type ReclamacionRecurso,
} from '@/modulos/produccion/servicios/corridas-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import { esquemaReclamarRecurso } from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

/**
 * SII-B6.2: reclama un recurso con sesión pausada ≥60 min por motivo
 * liberable (DUDA/MATERIAL), dejando traza `recurso_liberado`.
 */
export async function reclamarRecursoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ReclamacionRecurso>> {
  const resultado = esquemaReclamarRecurso.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'reclamar_recurso_liberado',
    resultado.data.recursoId,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };
  const autorizado =
    (await can(actor, 'gestionar_produccion')) || (await can(actor, 'gestionar_planeacion'));
  if (!autorizado) {
    return { exito: false, error: 'Sin permiso para reclamar recursos' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const reclamacion = await reclamarRecursoLiberadoServicio(crearClienteSupabaseAdmin(), {
      recursoId: resultado.data.recursoId,
      actorId: actor.id,
      correlationId,
    });
    await registrarLog(actor, 'reclamar_recurso_liberado', 'produccion', reclamacion.sesionId, {
      recursoId: reclamacion.recursoId,
      motivoPausaCodigo: reclamacion.motivoPausaCodigo,
      pausadaDesde: reclamacion.pausadaDesde,
    }, correlationId);
    return { exito: true, datos: reclamacion };
  } catch (error) {
    console.error('[PRODUCCION] Error al reclamar recurso:', error);
    await registrarLog(actor, 'reclamar_recurso_rechazado', 'produccion', resultado.data.recursoId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
