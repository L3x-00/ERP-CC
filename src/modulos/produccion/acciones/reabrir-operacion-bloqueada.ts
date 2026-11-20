'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  reabrirOperacionBloqueadaServicio,
  type ReaperturaOperacion,
} from '@/modulos/produccion/servicios/indice';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

const esquemaReabrirOperacion = z
  .object({
    programacionId: z.uuid('ID de programación inválido'),
    correlationId: z.uuid('ID de petición inválido').optional(),
  })
  .strict();

/** C31/A2: devuelve al pool una operación bloqueada que no tiene sesión. */
export async function reabrirOperacionBloqueadaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ReaperturaOperacion>> {
  const analisis = esquemaReabrirOperacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'reabrir_operacion_bloqueada',
    analisis.data.programacionId,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'gestionar_planeacion'))) {
    return { exito: false, error: 'No tienes permiso para reabrir operaciones bloqueadas. Pide a Planeación que lo haga.' };
  }

  const correlationId = analisis.data.correlationId ?? nuevoCorrelationId();
  try {
    const reapertura = await reabrirOperacionBloqueadaServicio(crearClienteSupabaseAdmin(), {
      programacionId: analisis.data.programacionId,
      actorId: actor.id,
      correlationId,
    });
    if (!reapertura.yaAplicado) {
      await registrarLog(actor, 'reabrir_operacion_bloqueada', 'produccion', reapertura.programacionId, {
        partidaId: reapertura.partidaId,
        reclamosLiberados: reapertura.reclamosLiberados,
      }, correlationId);
    }
    return { exito: true, datos: reapertura };
  } catch (error) {
    console.error('[PRODUCCION] Error al reabrir operación bloqueada:', error);
    await registrarLog(actor, 'reapertura_operacion_rechazada', 'produccion', analisis.data.programacionId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
