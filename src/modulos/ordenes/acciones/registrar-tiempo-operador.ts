'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { registrarTiempoOperadorServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import type { RegistroTiempo } from '@/modulos/ordenes/tipos/ordenes';
import { esquemaRegistrarTiempoOperador } from '@/modulos/ordenes/validaciones/ordenes';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Registra inicio, pausa o fin de un operador de piso. La autorización se basa
 * en una sesión PIN firmada, vigente y contrastada con una cuenta activa; el
 * `operadorId` entregado por el cliente debe coincidir con esa sesión.
 */
export async function registrarTiempoOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RegistroTiempo>> {
  const analisis = esquemaRegistrarTiempoOperador.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const operador = await obtenerOperadorConSesionActiva();
  if (!operador || analisis.data.operadorId !== operador.id) {
    return { exito: false, error: 'Sesión de operador no válida' };
  }

  try {
    const registro = await registrarTiempoOperadorServicio(
      crearClienteSupabaseAdmin(),
      {
        partidaId: analisis.data.partidaId,
        operadorId: operador.id,
        accion: analisis.data.accion,
        ...(analisis.data.notas ? { notas: analisis.data.notas } : {}),
      },
    );
    await registrarLog(operador, 'registrar_tiempo_operador', 'ordenes', registro.id, {
      partidaId: registro.partidaId,
      accion: registro.accion,
      fechaRegistro: registro.fechaRegistro,
    });
    return { exito: true, datos: registro };
  } catch (error) {
    console.error('[ORDENES] Error al registrar tiempo de operador:', error);
    await registrarLog(operador, 'tiempo_operador_rechazado', 'ordenes', analisis.data.partidaId, {
      accion: analisis.data.accion,
    });
    return { exito: false, error: 'No se pudo registrar el tiempo de operador' };
  }
}
