'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  crearOrdenHistoricaServicio,
  type OrdenHistoricaCreada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaCrearOrdenHistorica } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const MENSAJES: Readonly<Record<string, string>> = {
  id_historico_duplicado: 'Ese ID previo ya está registrado en otra orden.',
  cliente_no_activo: 'El cliente seleccionado no está activo.',
  orden_historica_invalida: 'Revisa los montos, fechas y partidas del trabajo heredado.',
  sin_permiso_orden_historica: 'No tienes permiso para capturar trabajo heredado.',
};

/**
 * ORD-06: alta administrativa de un trabajo histórico (excepción D-01/OBS-15).
 * La RPC revalida permisos y datos en PostgreSQL; la acción solo comprueba el
 * permiso de aplicación y audita el resultado.
 */
export async function crearOrdenHeredadaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenHistoricaCreada>> {
  const analisis = esquemaCrearOrdenHistorica.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para capturar trabajo heredado' };
  }

  try {
    const orden = await crearOrdenHistoricaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'crear_orden_historica', 'ordenes', orden.id, {
      folio: orden.folio,
      idHistorico: analisis.data.idHistorico,
      cuentaId: orden.cuentaId,
    });
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al crear orden heredada:', error);
    await registrarLog(usuario, 'orden_historica_rechazada', 'ordenes', analisis.data.clienteId, {
      codigo,
      idHistorico: analisis.data.idHistorico,
    });
    return { exito: false, error: MENSAJES[codigo] ?? 'No se pudo crear la orden heredada' };
  }
}
