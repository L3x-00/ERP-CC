'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  activarModoPreparacionServicio,
  ErrorPlaneacion,
  mensajeErrorPlaneacion,
  type ProgramacionActualizada,
} from '@/modulos/planeacion/servicios/indice';
import { esquemaActivarModoPreparacion } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Activa preparación sin aceptar identidad de actor ni estado controlado por el navegador. */
export async function activarModoPreparacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProgramacionActualizada>> {
  const analisis = esquemaActivarModoPreparacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para iniciar preparación' };
  }

  try {
    const programacion = await activarModoPreparacionServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    await registrarLog(usuario, 'activar_modo_preparacion', 'planeacion', programacion.id, {
      marcaEsperada: analisis.data.actualizadoEnEsperado,
    });
    return { exito: true, datos: programacion };
  } catch (error) {
    const codigo = error instanceof ErrorPlaneacion ? error.codigo : 'desconocido';
    console.error('[PLANEACION] Error al activar preparación:', error);
    await registrarLog(usuario, 'preparacion_rechazada', 'planeacion', analisis.data.programacionId, {
      codigo,
    });
    return { exito: false, error: mensajeErrorPlaneacion(error, 'preparar') };
  }
}
