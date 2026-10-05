'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import type { DatosUsuariosAdmin } from '../tipos/indice';

/**
 * Lista los usuarios del sistema para la pestaña administrativa.
 * Solo admin activo; incluye el id del solicitante para proteger su propia fila.
 */
export async function obtenerUsuariosAccion(): Promise<RespuestaAccion<DatosUsuariosAdmin>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede ver los usuarios' };
  }

  const clienteAdmin = crearClienteSupabaseAdmin();
  const { data, error } = await clienteAdmin
    .from('usuarios')
    .select('id, email, nombre_completo, rol, activo, ultimo_login_at')
    .order('nombre_completo');

  if (error || !data) {
    console.error('[USUARIOS] No se pudo cargar la lista:', error?.message);
    return { exito: false, error: 'No se pudo cargar la lista de usuarios' };
  }

  return {
    exito: true,
    datos: {
      usuarioActualId: usuario.id,
      usuarios: data.map((fila) => ({
        id: fila.id,
        email: fila.email,
        nombreCompleto: fila.nombre_completo,
        rol: fila.rol as RolUsuario,
        activo: fila.activo,
        ultimoLoginEn: fila.ultimo_login_at,
      })),
    },
  };
}
