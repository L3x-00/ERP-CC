'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  autorizarHorasExtraServicio,
  type AutorizacionHorasExtraRegistrada,
} from '@/modulos/produccion/servicios/corridas-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import { esquemaAutorizarHorasExtra } from '@/modulos/produccion/validaciones/corridas';

import { obtenerActorProduccion } from './utilidades-acciones';

/**
 * SII-B6.2: registra una autorización de horas extra (Management/Admin) que el
 * cierre de sesión consume cuando se excede la jornada configurada del turno.
 */
export async function autorizarHorasExtraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AutorizacionHorasExtraRegistrada>> {
  const resultado = esquemaAutorizarHorasExtra.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para autorizar horas extra' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const autorizacion = await autorizarHorasExtraServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
      correlationId,
    });
    await registrarLog(actor, 'autorizar_horas_extra', 'produccion', autorizacion.id, {
      ordenId: autorizacion.ordenId,
      horas: autorizacion.horasAutorizadas,
    }, correlationId);
    return { exito: true, datos: autorizacion };
  } catch (error) {
    console.error('[PRODUCCION] Error al autorizar horas extra:', error);
    await registrarLog(actor, 'autorizar_horas_extra_rechazado', 'produccion', resultado.data.ordenId, {
      codigo: error instanceof Error ? error.message.slice(0, 120) : 'desconocido',
    }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
