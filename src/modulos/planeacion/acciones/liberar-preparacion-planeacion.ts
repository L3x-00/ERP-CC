'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorPlaneacion,
  codigoErrorPlaneacion,
  liberarPreparacionPlaneacionServicio,
  mensajeErrorPlaneacion,
  type ProgramacionActualizada,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaActivarModoPreparacion } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Devuelve a "programada" una operación que quedó en preparación sin sesión.
 * No libera máquinas con trabajo activo: PostgreSQL verifica sesiones y CAS.
 */
export async function liberarPreparacionPlaneacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProgramacionActualizada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaActivarModoPreparacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para liberar preparaciones' };
  }

  try {
    const programacion = await liberarPreparacionPlaneacionServicio(
      crearClienteSupabaseAdmin(),
      {
        ...analisis.data,
        actorId: usuario.id,
        correlationId,
      },
    );
    await registrarLog(usuario, 'liberar_preparacion_planeacion', 'planeacion', programacion.id, {
      marcaEsperada: analisis.data.actualizadoEnEsperado,
    }, correlationId);
    return { exito: true, datos: programacion };
  } catch (error) {
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    console.error('[PLANEACION] Error al liberar preparación:', error);
    await registrarLog(usuario, 'liberacion_preparacion_rechazada', 'planeacion', analisis.data.programacionId, {
      codigo,
    }, correlationId);
    return {
      exito: false,
      error: mensajeErrorPlaneacion(error, 'preparar'),
      codigo: codigoErrorPlaneacion(error),
    };
  }
}
