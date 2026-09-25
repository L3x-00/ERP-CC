'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  repetirOrdenServicio,
  type RepeticionCreada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaRepetirOrden } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  orden_no_repetible: 'Solo se puede repetir una orden completada o heredada, y nunca una cancelada.',
  orden_sin_partidas: 'La orden de origen no tiene partidas que repetir.',
  orden_inexistente: 'La orden de origen ya no existe.',
  sin_permiso_repetir_orden: 'No tienes permiso para repetir trabajos.',
};

/**
 * CLI-08: repite un trabajo desde su orden de origen. La RPC revalida el estado
 * de origen, el permiso y la fecha; la ejecución anterior no se copia.
 */
export async function repetirOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<RepeticionCreada>> {
  const analisis = esquemaRepetirOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para repetir trabajos' };
  }

  try {
    const orden = await repetirOrdenServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'repetir_orden', 'ordenes', orden.id, {
      folio: orden.folio,
      ordenOrigenId: analisis.data.ordenOrigenId,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al repetir orden:', error);
    await registrarLog(usuario, 'repetir_orden_rechazado', 'ordenes', analisis.data.ordenOrigenId, {
      codigo,
    });
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo repetir el trabajo' };
  }
}
