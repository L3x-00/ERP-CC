'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  asignarOperadorPartidaServicio,
  type PartidaConOperadorAsignado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaAsignarOperadorPartida } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Vincula una partida con el operador que podrá registrar tiempo, avance y
 * consumo desde piso. La asignación se verifica de nuevo en cada RPC de taller.
 */
export async function asignarOperadorPartidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PartidaConOperadorAsignado>> {
  const analisis = esquemaAsignarOperadorPartida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para asignar operadores de producción' };
  }

  try {
    const asignacion = await asignarOperadorPartidaServicio(
      crearClienteSupabaseAdmin(),
      analisis.data,
    );
    await registrarLog(usuario, 'asignar_operador_partida', 'ordenes', asignacion.partidaId, {
      operadorAsignadoId: asignacion.operadorAsignadoId,
    });
    return { exito: true, datos: asignacion };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al asignar operador a partida:', error);
    await registrarLog(usuario, 'asignacion_operador_rechazada', 'ordenes', analisis.data.partidaId, {
      operadorId: analisis.data.operadorId,
      codigo,
    });
    return { exito: false, error: 'No se pudo asignar el operador a la partida' };
  }
}
