'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  mensajeErrorSesion,
  resolverSolicitudHorasExtraServicio,
  type AutorizacionHorasExtraRegistrada,
} from '@/modulos/produccion/servicios/indice';
import { esquemaResolverHorasExtra } from '@/modulos/produccion/validaciones/indice';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

/**
 * C12: Admin/Management resuelve una solicitud de horas extra pendiente con un
 * solo botón; no captura horas ni motivo porque la solicitud ya los resume.
 */
export async function resolverSolicitudHorasExtraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AutorizacionHorasExtraRegistrada>> {
  const resultado = esquemaResolverHorasExtra.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    resultado.data.aprobar ? 'aprobar_horas_extra' : 'rechazar_horas_extra',
    resultado.data.id,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };
  if (!(await can(actor, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para resolver horas extra' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const solicitud = await resolverSolicitudHorasExtraServicio(crearClienteSupabaseAdmin(), {
      id: resultado.data.id,
      aprobar: resultado.data.aprobar,
      autorizadorId: actor.id,
    });
    await registrarLog(
      actor,
      resultado.data.aprobar ? 'aprobar_horas_extra' : 'rechazar_horas_extra',
      'produccion',
      solicitud.id,
      { estado: solicitud.estado, horas: solicitud.horasAutorizadas },
      correlationId,
    );
    return { exito: true, datos: solicitud };
  } catch (error) {
    console.error('[PRODUCCION] Error al resolver horas extra:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
