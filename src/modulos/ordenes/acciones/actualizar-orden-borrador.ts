'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  actualizarOrdenBorradorServicio,
  mensajeErrorOrden,
  type OrdenEditada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaActualizarOrdenBorrador } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * ORD-05: edita una OP en borrador con compare-and-set. La RPC revalida estado
 * y token de versión; la acción audita folio, prioridad y número de partidas.
 */
export async function actualizarOrdenBorradorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenEditada>> {
  const analisis = esquemaActualizarOrdenBorrador.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para editar órdenes' };
  }

  try {
    const orden = await actualizarOrdenBorradorServicio(crearClienteSupabaseAdmin(), analisis.data);
    await registrarLog(usuario, 'actualizar_orden_borrador', 'ordenes', orden.id, {
      folio: orden.folio,
      prioridad: orden.prioridad,
      partidas: analisis.data.partidas.length,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al editar orden:', error);
    await registrarLog(usuario, 'edicion_orden_rechazada', 'ordenes', analisis.data.ordenId, {
      codigo,
    });
    return { exito: false, error: mensajeErrorOrden(error, 'actualizar') };
  }
}
