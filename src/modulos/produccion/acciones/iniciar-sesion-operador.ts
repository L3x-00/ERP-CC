'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion,
  iniciarSesionTrabajoServicio,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/indice';
import { esquemaIniciarSesion } from '@/modulos/produccion/validaciones/indice';

export async function iniciarSesionOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Awaited<ReturnType<typeof iniciarSesionTrabajoServicio>>>> {
  const analisis = esquemaIniciarSesion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };

  try {
    const sesion = await iniciarSesionTrabajoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'iniciar_sesion_trabajo', 'produccion', sesion.id, {
      ordenId: sesion.ordenId,
      partidaId: sesion.partidaId,
      programacionId: sesion.programacionId,
    });
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Error al iniciar sesión:', error);
    await registrarLog(operador, 'inicio_sesion_trabajo_rechazado', 'produccion', analisis.data.partidaId, {
      codigo,
      programacionId: analisis.data.programacionId,
    });
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
