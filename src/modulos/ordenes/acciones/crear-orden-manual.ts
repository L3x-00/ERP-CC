'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  crearOrdenManualServicio,
  mensajeErrorOrden,
  type OrdenCreada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaCrearOrdenManual } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Crea una orden manual con folio OP atómico y sus partidas en una única RPC. */
export async function crearOrdenManualAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenCreada>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearOrdenManual.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para crear órdenes' };
  }

  try {
    const orden = await crearOrdenManualServicio(crearClienteSupabaseAdmin(), analisis.data);
    await registrarLog(usuario, 'crear_orden_manual', 'ordenes', orden.id, {
      folio: orden.folio,
      clienteId: analisis.data.clienteId,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    return { exito: false, error: mensajeErrorOrden(error, 'crear') };
  }
}
