'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  cerrarJornadaServicio,
  type ResultadoCerrarJornada,
} from '@/modulos/produccion/servicios/corridas-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import { esquemaCerrarJornada } from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

/**
 * SII-B6.2: cierra las sesiones activas del día con causa FIN_JORNADA; ninguna
 * sesión cruza de fecha. Requiere `gestionar_produccion`.
 */
export async function cerrarJornadaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoCerrarJornada>> {
  const resultado = esquemaCerrarJornada.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'cerrar_jornada',
    resultado.data.fecha,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para cerrar la jornada' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const cierre = await cerrarJornadaServicio(crearClienteSupabaseAdmin(), {
      fecha: resultado.data.fecha,
      actorId: actor.id,
      correlationId,
    });
    await registrarLog(actor, 'cerrar_jornada', 'produccion', resultado.data.fecha, {
      sesionesCerradas: cierre.sesionesCerradas,
    }, correlationId);
    return { exito: true, datos: cierre };
  } catch (error) {
    console.error('[PRODUCCION] Error al cerrar jornada:', error);
    await registrarLog(actor, 'cerrar_jornada_rechazado', 'produccion', resultado.data.fecha, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
