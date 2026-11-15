'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerOperadorParaMutacion } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  cerrarPausaSinProducirServicio,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCerrarPausa } from '@/modulos/produccion/validaciones/indice';

/**
 * C15: el operador decide no retomar una pausa. Se finaliza sin producir piezas:
 * las horas y el motivo ya registrados se conservan y la operación vuelve al
 * pool. Es independiente del cierre de cualquier otra sesión de la orden.
 */
export async function cerrarPausaOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Awaited<ReturnType<typeof cerrarPausaSinProducirServicio>>>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCerrarPausa.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorParaMutacion(
    'cerrar_pausa_sin_producir',
    analisis.data.sesionId,
  );
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  try {
    const pausa = await cerrarPausaSinProducirServicio(crearClienteSupabaseAdmin(), {
      sesionId: analisis.data.sesionId,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'cerrar_pausa_sin_producir', 'produccion', pausa.id, {
      estadoSesion: pausa.estadoSesion,
      estadoPlaneacion: pausa.estadoPlaneacion,
    }, correlationId);
    return { exito: true, datos: pausa };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Falló el cierre de pausa:', error);
    await registrarLog(operador, 'cierre_pausa_rechazado', 'produccion',
      analisis.data.sesionId, { codigo }, correlationId);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
