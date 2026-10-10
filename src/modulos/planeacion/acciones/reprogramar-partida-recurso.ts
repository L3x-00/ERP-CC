'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorPlaneacion,
  mensajeErrorPlaneacion,
  reprogramarPartidaRecursoServicio,
  type ProgramacionActualizada,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaReprogramarPartidaRecurso } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Reprograma con compare-and-set para rechazar cambios realizados desde una pantalla obsoleta. */
export async function reprogramarPartidaRecursoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProgramacionActualizada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaReprogramarPartidaRecurso.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para reprogramar recursos' };
  }

  try {
    const programacion = await reprogramarPartidaRecursoServicio(
      crearClienteSupabaseAdmin(),
      {
        ...analisis.data,
        actorId: usuario.id,
        correlationId,
      },
    );
    await registrarLog(usuario, 'reprogramar_partida_recurso', 'planeacion', programacion.id, {
      recursoId: analisis.data.recursoId,
      fechaProgramada: analisis.data.fechaProgramada,
      turno: analisis.data.turno,
      motivo: analisis.data.motivo,
      marcaEsperada: analisis.data.actualizadoEnEsperado,
    }, correlationId);
    return { exito: true, datos: programacion };
  } catch (error) {
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    console.error('[PLANEACION] Error al reprogramar partida:', error);
    await registrarLog(usuario, 'reprogramacion_partida_rechazada', 'planeacion', analisis.data.programacionId, {
      codigo,
      recursoId: analisis.data.recursoId,
    }, correlationId);
    return { exito: false, error: mensajeErrorPlaneacion(error, 'reprogramar') };
  }
}
