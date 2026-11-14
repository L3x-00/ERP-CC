'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  justificarHorasExtraOperadorServicio,
  mensajeErrorSesion,
  type AutorizacionHorasExtraRegistrada,
} from '@/modulos/produccion/servicios/indice';
import { esquemaJustificarHorasExtra } from '@/modulos/produccion/validaciones/indice';

/**
 * C15: cuando la sesión ya excedió la jornada, el operador puede justificar el
 * exceso con un motivo. La autorización queda atada a esa sesión y el siguiente
 * cierre la consume; el motivo se conserva para revisión administrativa.
 */
export async function justificarHorasExtraAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AutorizacionHorasExtraRegistrada>> {
  const resultado = esquemaJustificarHorasExtra.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'justificar_horas_extra',
    resultado.data.sesionId,
  );
  if (!operador) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const justificacion = await justificarHorasExtraOperadorServicio(
      crearClienteSupabaseAdmin(),
      {
        sesionId: resultado.data.sesionId,
        operadorId: operador.id,
        motivo: resultado.data.motivo,
      },
    );
    await registrarLog(operador, 'justificar_horas_extra', 'produccion', justificacion.id, {
      sesionId: resultado.data.sesionId,
      horas: justificacion.horasAutorizadas,
      motivo: resultado.data.motivo,
    }, correlationId);
    return { exito: true, datos: justificacion };
  } catch (error) {
    console.error('[PRODUCCION] Error al justificar horas extra:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
