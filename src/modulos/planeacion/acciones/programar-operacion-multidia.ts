'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorPlaneacion,
  codigoErrorPlaneacion,
  mensajeErrorPlaneacion,
  programarOperacionMultidiaServicio,
  type ProgramacionActualizada,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaProgramarMultidia } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * C16: programa una operación que no cabe en una jornada repartiendo sus horas
 * en varios días. Cada día se valida contra la capacidad real del recurso.
 */
export async function programarOperacionMultidiaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProgramacionActualizada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaProgramarMultidia.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para programar recursos' };
  }

  try {
    const programacion = await programarOperacionMultidiaServicio(
      crearClienteSupabaseAdmin(),
      { ...analisis.data, actorId: usuario.id, correlationId },
    );
    await registrarLog(usuario, 'programar_operacion_multidia', 'planeacion', programacion.id, {
      ordenId: analisis.data.ordenId,
      partidaId: analisis.data.partidaId,
      recursoId: analisis.data.recursoId,
      metaProcesoId: analisis.data.metaProcesoId,
      turno: analisis.data.turno,
      horasTotales: analisis.data.horasTotales,
      dias: analisis.data.dias,
    }, correlationId);
    return { exito: true, datos: programacion };
  } catch (error) {
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    console.error('[PLANEACION] Error al programar operación en varios días:', error);
    await registrarLog(usuario, 'programacion_multidia_rechazada', 'planeacion',
      analisis.data.partidaId, {
        codigo,
        recursoId: analisis.data.recursoId,
        dias: analisis.data.dias,
      }, correlationId);
    return {
      exito: false,
      error: mensajeErrorPlaneacion(error, 'programar'),
      codigo: codigoErrorPlaneacion(error),
    };
  }
}
