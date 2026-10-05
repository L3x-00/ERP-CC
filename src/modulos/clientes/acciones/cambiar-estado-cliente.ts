'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { esquemaCambiarEstadoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Cambia el estado del cliente por acción controlada (SII-B2.5).
 *
 * Toda la regla vive en la RPC `cambiar_estado_cliente`: transiciones válidas,
 * CAS sobre `actualizadoEn` y motivo obligatorio para inactivar. No existe
 * acción de borrado: los clientes históricos se conservan.
 */
export async function cambiarEstadoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ estado: 'prospecto' | 'activo' | 'inactivo' }>> {
  const analisis = esquemaCambiarEstadoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'cliente_editar'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const { clienteId, nuevoEstado, motivo, actualizadoEn } = analisis.data;
  if (nuevoEstado === 'inactivo' && !motivo) {
    return { exito: false, error: 'Indica el motivo para inactivar al cliente' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin.rpc('cambiar_estado_cliente', {
    p_cliente_id: clienteId,
    p_nuevo_estado: nuevoEstado,
    p_motivo: motivo ?? '',
    p_actor: usuario.id,
    p_actualizado_en: actualizadoEn,
  });

  if (error) {
    if (error.message.includes('cliente_desactualizado')) {
      return {
        exito: false,
        error: 'El cliente cambió desde que lo cargaste; actualiza la ficha e inténtalo de nuevo',
      };
    }
    if (error.message.includes('motivo_requerido')) {
      return { exito: false, error: 'Indica el motivo para inactivar al cliente' };
    }
    if (error.message.includes('estado_invalido')) {
      return { exito: false, error: 'Ese cambio de estado no está permitido' };
    }
    if (error.message.includes('cliente_no_encontrado')) {
      return { exito: false, error: 'Cliente no encontrado' };
    }
    if (error.message.includes('sin_permiso')) {
      return { exito: false, error: 'Sin permiso para editar clientes' };
    }
    console.error('[CLIENTES] Cambio de estado rechazado:', error.message);
    return { exito: false, error: 'No se pudo cambiar el estado del cliente' };
  }

  await registrarLog(
    usuario,
    'cambiar_estado_cliente',
    'clientes',
    clienteId,
    {
      estado: nuevoEstado,
      motivo: motivo ?? null,
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { estado: nuevoEstado } };
}
