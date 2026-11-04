'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  mensajeErrorSesion,
  solicitarHorasExtraOperadorServicio,
  type AutorizacionHorasExtraRegistrada,
} from '@/modulos/produccion/servicios/indice';
import { esquemaSolicitarHorasExtra } from '@/modulos/produccion/validaciones/indice';

/**
 * C12: el operador no llena solicitudes. Al fallar el cierre por exceder la
 * jornada, el sistema deja la solicitud pendiente y aquí solo se registra ese
 * hecho para que Admin/Management la apruebe o rechace.
 */
export async function solicitarHorasExtraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AutorizacionHorasExtraRegistrada>> {
  const resultado = esquemaSolicitarHorasExtra.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'solicitar_horas_extra',
    resultado.data.sesionId,
  );
  if (!operador) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const solicitud = await solicitarHorasExtraOperadorServicio(crearClienteSupabaseAdmin(), {
      sesionId: resultado.data.sesionId,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'solicitar_horas_extra', 'produccion', solicitud.id, {
      sesionId: resultado.data.sesionId,
      horas: solicitud.horasAutorizadas,
    }, correlationId);
    return { exito: true, datos: solicitud };
  } catch (error) {
    console.error('[PRODUCCION] Error al solicitar horas extra:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
