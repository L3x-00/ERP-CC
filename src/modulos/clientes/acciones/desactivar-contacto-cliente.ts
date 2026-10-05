'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaDesactivarContactoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Baja lógica de un contacto (SII-B2.3): exige motivo, CAS sobre
 * `actualizadoEn` y conserva la fila completa para el historial. No hay
 * borrado duro de contactos desde la UI.
 */
export async function desactivarContactoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const analisis = esquemaDesactivarContactoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'cliente_editar'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const { id, clienteId, motivo, actualizadoEn } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin.rpc('desactivar_contacto_cliente', {
    p_contacto_id: id,
    p_cliente_id: clienteId,
    p_motivo: motivo,
    p_actor: usuario.id,
    p_actualizado_en: actualizadoEn,
  });

  if (error) {
    if (error.message.includes('contacto_desactualizado')) {
      return {
        exito: false,
        error: 'El contacto cambió desde que lo cargaste; actualiza la lista e inténtalo de nuevo',
      };
    }
    if (error.message.includes('contacto_ya_inactivo')) {
      return { exito: false, error: 'El contacto ya estaba inactivo' };
    }
    if (error.message.includes('contacto_no_encontrado')) {
      return { exito: false, error: 'El contacto ya no existe' };
    }
    console.error('[CLIENTES] Error al desactivar contacto:', error.message);
    return { exito: false, error: 'No se pudo desactivar el contacto' };
  }

  await registrarLog(
    usuario,
    'desactivar_contacto_cliente',
    'clientes',
    clienteId,
    {
      contactoId: id,
      motivo,
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { id } };
}
