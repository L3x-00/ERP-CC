'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorPlaneacion,
  mensajeErrorPlaneacion,
  programarPartidaRecursoServicio,
  type ProgramacionActualizada,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaProgramarOrden } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Programa con autorización de Planeación; PostgreSQL conserva la decisión atómica. */
export async function programarPartidaRecursoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProgramacionActualizada>> {
  const analisis = esquemaProgramarOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para programar recursos' };
  }

  try {
    const programacion = await programarPartidaRecursoServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    await registrarLog(usuario, 'programar_partida_recurso', 'planeacion', programacion.id, {
      ordenId: analisis.data.ordenId,
      partidaId: analisis.data.partidaId,
      recursoId: analisis.data.recursoId,
      fechaProgramada: analisis.data.fechaProgramada,
      turno: analisis.data.turno,
    });
    return { exito: true, datos: programacion };
  } catch (error) {
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    console.error('[PLANEACION] Error al programar partida:', error);
    await registrarLog(usuario, 'programacion_partida_rechazada', 'planeacion', analisis.data.partidaId, {
      codigo,
      recursoId: analisis.data.recursoId,
    });
    return { exito: false, error: mensajeErrorPlaneacion(error, 'programar') };
  }
}
