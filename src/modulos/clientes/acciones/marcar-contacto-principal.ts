'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaMarcarContactoPrincipal } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Marca un contacto activo como principal (SII-B2.3). La RPC retira al
 * anterior y promueve al nuevo dentro de una transacción con lock del cliente:
 * nunca conviven dos principales activos.
 */
export async function marcarContactoPrincipalAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const analisis = esquemaMarcarContactoPrincipal.safeParse(entrada);
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
  const { error } = await admin.rpc('marcar_contacto_principal', {
    p_contacto_id: id,
    p_cliente_id: clienteId,
    p_actor: usuario.id,
  });

  if (error) {
    if (error.message.includes('contacto_inactivo')) {
      return { exito: false, error: 'Reactiva el contacto antes de marcarlo como principal' };
    }
    if (error.message.includes('contacto_no_encontrado')) {
      return { exito: false, error: 'El contacto ya no existe' };
    }
    console.error('[CLIENTES] Error al marcar principal:', error.message);
    return { exito: false, error: 'No se pudo marcar el contacto como principal' };
  }

  await registrarLog(
    usuario,
    'marcar_contacto_principal',
    'clientes',
    clienteId,
    {
      contactoId: id,
    },
    nuevoCorrelationId(),
  );

  return { exito: true, datos: { id } };
}
