'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  cambiarEstadoOrdenServicio,
  mensajeErrorOrden,
  type OrdenConEstadoActualizado,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esTransicionOrdenValida } from '@/modulos/ordenes/servicios/reglas-transicion';
import { esquemaCambiarEstadoOrden } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Cambia el estado con compare-and-set. Cancelar una orden ya en proceso exige
 * un permiso adicional, además del motivo validado en Zod y Postgres.
 */
export async function cambiarEstadoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenConEstadoActualizado>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCambiarEstadoOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para actualizar órdenes' };
  }
  if (!esTransicionOrdenValida(datos.estadoActual, datos.estado)) {
    return { exito: false, error: 'La transición de estado no está permitida' };
  }
  if (
    datos.estadoActual === 'en_proceso' &&
    datos.estado === 'cancelada' &&
    !(await can(usuario, 'cancelar_ordenes_en_proceso'))
  ) {
    return { exito: false, error: 'Sin permiso para cancelar una orden en proceso' };
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
    return { exito: false, error: mensajeErrorOrden(error, 'actualizar') };
  }
}
