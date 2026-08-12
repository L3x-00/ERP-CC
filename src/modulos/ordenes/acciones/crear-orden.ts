'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  crearOrdenManualServicio,
  type OrdenCreada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaCrearOrden } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Crea una OP manual con folio generado únicamente por la RPC de Postgres. Una
 * OP proveniente de Pipeline debe seguir el flujo transaccional de aprobación,
 * por lo que no admite una cotización asignada desde esta acción.
 */
export async function crearOrdenAccion(entrada: unknown): Promise<RespuestaAccion<OrdenCreada>> {
  const analisis = esquemaCrearOrden.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  if (analisis.data.cotizacionId) {
    return {
      exito: false,
      error: 'Las órdenes de una cotización se crean al aprobar la oportunidad',
    };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para crear órdenes' };
  }

  const datosManual = {
    clienteId: analisis.data.clienteId,
    prioridad: analisis.data.prioridad,
    fechaCompromiso: analisis.data.fechaCompromiso,
    partidas: analisis.data.partidas,
  };

  try {
    const orden = await crearOrdenManualServicio(crearClienteSupabaseAdmin(), datosManual);
    await registrarLog(usuario, 'crear_orden_manual', 'ordenes', orden.id, {
      folio: orden.folio,
      clienteId: datosManual.clienteId,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al crear orden:', error);
    await registrarLog(usuario, 'crear_orden_rechazada', 'ordenes', datosManual.clienteId, { codigo });
    return { exito: false, error: 'No se pudo crear la orden' };
  }
}
