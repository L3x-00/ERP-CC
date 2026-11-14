'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  mensajeErrorSesion,
  pausarSesionesJornadaExcedidaServicio,
} from '@/modulos/produccion/servicios/indice';
import { esquemaPausarSesionJornada } from '@/modulos/produccion/validaciones/indice';

/**
 * C15: vigilante del panel del operador. Al cumplirse la jornada del turno la
 * sesión se pausa sin intervención; el operador no pierde el avance y el reloj
 * deja de acumular horas extra.
 */
export async function pausarSesionJornadaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ sesionesPausadas: number }>> {
  const resultado = esquemaPausarSesionJornada.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'pausar_sesion_jornada',
    resultado.data.sesionId,
  );
  if (!operador) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const pausadas = await pausarSesionesJornadaExcedidaServicio(
      crearClienteSupabaseAdmin(),
      { operadorId: operador.id },
    );
    if (pausadas.length > 0) {
      await registrarLog(operador, 'pausa_automatica_jornada', 'produccion',
        resultado.data.sesionId, {
          sesiones: pausadas.map((sesion) => sesion.sesionId),
          horasNetas: pausadas.map((sesion) => sesion.horasNetas),
        }, correlationId);
    }
    return { exito: true, datos: { sesionesPausadas: pausadas.length } };
  } catch (error) {
    console.error('[PRODUCCION] Error al pausar por jornada:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
