'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaReactivarContactoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Reactiva un contacto con baja lógica (SII-B2.3). Si el contacto había sido
 * principal y ya hay otro principal activo, la RPC pide resolverlo antes.
 */
export async function reactivarContactoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const analisis = esquemaReactivarContactoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'cliente_editar'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const { id, clienteId } = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin.rpc('reactivar_contacto_cliente', {
    p_contacto_id: id,
    p_cliente_id: clienteId,
    p_actor: usuario.id,
  });

  if (error) {
    if (error.message.includes('principal_activo_existe')) {
      return {
        exito: false,
        error: 'Ya hay un contacto principal activo; desactívalo o cámbialo antes de reactivar este',
      };
    }
    if (error.message.includes('contacto_no_encontrado')) {
      return { exito: false, error: 'El contacto ya no existe' };
    }
    console.error('[CLIENTES] Error al reactivar contacto:', error.message);
    return { exito: false, error: 'No se pudo reactivar el contacto' };
  }

  await registrarLog(
    usuario,
    'reactivar_contacto_cliente',
    'clientes',
    clienteId,
    {
      contactoId: id,
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { id } };
}
