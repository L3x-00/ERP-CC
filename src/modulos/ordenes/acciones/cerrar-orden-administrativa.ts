'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  cerrarOrdenAdministrativaServicio,
  codigoErrorOrdenSii,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiCerrada } from '@/modulos/ordenes/tipos/orden-sii';
import { esquemaCerrarOrdenAdministrativa } from '@/modulos/ordenes/validaciones/orden-sii';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  sin_permiso_orden: 'No tienes permiso para el cierre administrativo.',
  orden_inexistente: 'La orden ya no existe.',
  orden_desactualizada: 'La orden cambió; recarga antes de cerrar.',
  orden_ya_cerrada: 'La orden ya está cerrada.',
  transicion_invalida: 'Solo se cierra una orden con producción completada.',
  orden_sin_partidas: 'La orden no tiene partidas.',
  orden_no_entregada_completa: 'Se requiere el 100 % de las cantidades entregadas.',
};

export async function cerrarOrdenAdministrativaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenSiiCerrada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCerrarOrdenAdministrativa.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_cerrar_admin'))) {
    return { exito: false, error: 'Sin permiso para el cierre administrativo' };
  }

  try {
    const orden = await cerrarOrdenAdministrativaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(usuario, 'cerrar_orden_administrativa', 'ordenes', orden.id, {
      estadoSii: orden.estadoSii,
    }, correlationId);
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.error('[ORDENES] Error al cerrar orden administrativamente:', error);
    await registrarLog(usuario, 'cerrar_orden_administrativa_rechazada', 'ordenes', analisis.data.ordenId, {
      codigo,
    }, correlationId);
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo cerrar la orden' };
  }
}
