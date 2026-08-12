'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  ErrorOrden,
  registrarAvancePartidaServicio,
  type AvancePartidaRegistrado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaRegistrarAvancePartida } from '@/modulos/ordenes/validaciones/ordenes';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Registra avance de fabricación desde una sesión PIN vigente. La identidad
 * del operador no viaja desde el navegador: se toma de la cookie HMAC
 * contrastada contra la cuenta activa antes de invocar la RPC.
 */
export async function registrarAvancePartidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AvancePartidaRegistrado>> {
  const analisis = esquemaRegistrarAvancePartida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) {
    return { exito: false, error: 'Sesión de operador no válida' };
  }

  try {
    const avance = await registrarAvancePartidaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      operadorId: operador.id,
    });
    await registrarLog(operador, 'registrar_avance_partida', 'ordenes', avance.partidaId, {
      cantidadProducida: analisis.data.cantidadProducida,
      cantidadScrap: analisis.data.cantidadScrap,
    });
    return { exito: true, datos: avance };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al registrar avance de partida:', error);
    await registrarLog(operador, 'avance_partida_rechazado', 'ordenes', analisis.data.partidaId, {
      codigo,
    });
    return { exito: false, error: 'No se pudo registrar el avance de la partida' };
  }
}
