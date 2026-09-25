'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  reactivarOrdenServicio,
  type OrdenReactivada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaReactivarOrden } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  orden_no_reactivable: 'Solo una orden completada puede volver a operación.',
  orden_entregada_no_reactivable:
    'La orden ya tiene entrega o cobros registrados; no se reactiva para no reabrir documentos financieros.',
  orden_desactualizada: 'La orden cambió en otra pantalla; actualiza antes de reactivar.',
  sin_permiso_reactivar_orden: 'No tienes permiso administrativo para reactivar órdenes.',
};

/**
 * PRD-15: acción administrativa que devuelve una orden «Lista» a operación sin
 * borrar sesiones previas. PostgreSQL revalida permiso, CAS y bloqueos.
 */
export async function reactivarOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenReactivada>> {
  const analisis = esquemaReactivarOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para reactivar órdenes' };
  }

  try {
    const orden = await reactivarOrdenServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'reactivar_orden', 'ordenes', orden.id, {
      estado: orden.estado,
      actualizadoEn: orden.actualizadoEn,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al reactivar orden:', error);
    await registrarLog(usuario, 'reactivar_orden_rechazado', 'ordenes', analisis.data.ordenId, {
      codigo,
    });
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo reactivar la orden' };
  }
}
