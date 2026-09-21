'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaEliminarContactoCliente } from '@/modulos/clientes/validaciones/cliente-schema';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Baja de un contacto adicional (OBS-02); la pertenencia se valida contra el cliente. */
export async function eliminarContactoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion> {
  const analisis = esquemaEliminarContactoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para editar clientes' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin
    .from('contactos_cliente')
    .delete()
    .eq('id', analisis.data.id)
    .eq('cliente_id', analisis.data.clienteId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[CLIENTES] Error al eliminar contacto:', error);
    return { exito: false, error: 'No se pudo eliminar el contacto' };
  }
  if (!data) return { exito: false, error: 'El contacto ya no existe' };

  await registrarLog(usuario, 'eliminar_contacto_cliente', 'clientes', analisis.data.clienteId, {
    contactoId: analisis.data.id,
  });

  return { exito: true };
}
