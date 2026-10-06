'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrdenSii,
  codigoErrorOrdenSii,
  liberarOrdenServicio,
} from '@/modulos/ordenes/servicios/orden-sii-servicio';
import type { OrdenSiiEstadoActualizado } from '@/modulos/ordenes/tipos/orden-sii';
import { esquemaLiberarOrden } from '@/modulos/ordenes/validaciones/orden-sii';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  sin_permiso_orden: 'No tienes permiso para liberar órdenes.',
  orden_inexistente: 'La orden ya no existe.',
  orden_desactualizada: 'La orden cambió; recarga antes de liberar.',
  transicion_invalida: 'Solo se libera una orden planificada.',
  orden_no_lista_para_liberar: 'Faltan programación, ruteo o archivos vivos para liberar.',
};

export async function liberarOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenSiiEstadoActualizado>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaLiberarOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_liberar'))) {
    return { exito: false, error: 'Sin permiso para liberar órdenes' };
  }

  try {
    const orden = await liberarOrdenServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
      correlationId,
    });
    await registrarLog(usuario, 'liberar_orden', 'ordenes', orden.id, {
      estadoSii: orden.estadoSii,
    }, correlationId);
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrdenSii ? error.codigo : codigoErrorOrdenSii(String(error));
    console.error('[ORDENES] Error al liberar orden:', error);
    await registrarLog(usuario, 'liberar_orden_rechazada', 'ordenes', analisis.data.ordenId, {
      codigo,
    }, correlationId);
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo liberar la orden' };
  }
}
