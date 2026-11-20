'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  reasignarPartidaServicio,
  type ReasignacionPartida,
} from '@/modulos/produccion/servicios/indice';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

const esquemaReasignar = z
  .object({
    partidaId: z.uuid('ID de partida inválido'),
    operadorNuevoId: z.uuid('ID de operador inválido'),
    correlationId: z.uuid('ID de petición inválido').optional(),
  })
  .strict();

/** C31/A4: cambia el responsable de una partida sin sesión en curso. */
export async function reasignarPartidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ReasignacionPartida>> {
  const analisis = esquemaReasignar.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'reasignar_partida_operador',
    analisis.data.partidaId,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'gestionar_produccion'))) {
    return { exito: false, error: 'No tienes permiso para reasignar responsables de partida.' };
  }

  const correlationId = analisis.data.correlationId ?? nuevoCorrelationId();
  try {
    const reasignacion = await reasignarPartidaServicio(crearClienteSupabaseAdmin(), {
      partidaId: analisis.data.partidaId,
      operadorNuevoId: analisis.data.operadorNuevoId,
      actorId: actor.id,
      correlationId,
    });
    if (!reasignacion.yaAplicado) {
      await registrarLog(actor, 'reasignar_partida_operador', 'produccion', reasignacion.partidaId, {
        operadorNuevoId: analisis.data.operadorNuevoId,
        reclamosLiberados: reasignacion.reclamosLiberados,
      }, correlationId);
    }
    return { exito: true, datos: reasignacion };
  } catch (error) {
    console.error('[PRODUCCION] Error al reasignar partida:', error);
    await registrarLog(actor, 'reasignacion_partida_rechazada', 'produccion', analisis.data.partidaId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
