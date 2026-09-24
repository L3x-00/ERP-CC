'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import {
  ErrorProduccion, mensajeErrorSesion, reanudarSesionTrabajoServicio,
} from '@/modulos/produccion/servicios/indice';
import { esquemaReanudarSesion } from '@/modulos/produccion/validaciones/indice';

export async function reanudarSesionOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<Awaited<ReturnType<typeof reanudarSesionTrabajoServicio>>>> {
  const analisis = esquemaReanudarSesion.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) return { exito: false, error: 'Sesión de operador no válida' };
  try {
    const sesion = await reanudarSesionTrabajoServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data, operadorId: operador.id,
    });
    await registrarLog(operador, 'reanudar_sesion_trabajo', 'produccion', sesion.id, {
      ordenId: sesion.ordenId, partidaId: sesion.partidaId, programacionId: sesion.programacionId,
    });
    return { exito: true, datos: sesion };
  } catch (error) {
    const codigo = error instanceof ErrorProduccion ? error.codigo : 'desconocido';
    console.error('[PRODUCCION] Falló reanudación de sesión:', error);
    await registrarLog(operador, 'reanudacion_rechazada', 'produccion', analisis.data.programacionId, { codigo });
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
