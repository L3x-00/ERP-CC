'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  cambiarEstadoOrdenServicio,
  type OrdenConEstadoActualizado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esTransicionOrdenValida } from '@/modulos/ordenes/servicios/reglas-transicion';
import { esquemaCambiarEstadoOrden } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Cambia el estado con compare-and-set. Las transiciones ordinarias requieren
 * aprobación; cancelar una orden ya en proceso exige su permiso específico y
 * el motivo validado en Zod y Postgres.
 */
export async function cambiarEstadoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenConEstadoActualizado>> {
  const analisis = esquemaCambiarEstadoOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  if (!esTransicionOrdenValida(datos.estadoActual, datos.estado)) {
    return { exito: false, error: 'La transición de estado no está permitida' };
  }
  const esCancelacionEnProceso =
    datos.estadoActual === 'en_proceso' &&
    datos.estado === 'cancelada';
  const permisoRequerido = esCancelacionEnProceso
    ? 'cancelar_ordenes_en_proceso'
    : 'aprobar_ordenes';

  if (!(await can(usuario, permisoRequerido))) {
    if (esCancelacionEnProceso) {
      return { exito: false, error: 'Sin permiso para cancelar una orden en proceso' };
    }
    return { exito: false, error: 'Sin permiso para actualizar órdenes' };
  }

  try {
    const orden = await cambiarEstadoOrdenServicio(crearClienteSupabaseAdmin(), datos);
    await registrarLog(usuario, 'cambiar_estado_orden', 'ordenes', orden.id, {
      estadoAnterior: datos.estadoActual,
      estadoNuevo: orden.estado,
      ...(datos.motivoCancelacion ? { motivoCancelacion: datos.motivoCancelacion } : {}),
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al cambiar estado:', error);
    await registrarLog(usuario, 'cambio_estado_orden_rechazado', 'ordenes', datos.ordenId, {
      codigo,
      estadoAnterior: datos.estadoActual,
      estadoNuevo: datos.estado,
    });
    return { exito: false, error: 'No se pudo actualizar la orden' };
  }
}
