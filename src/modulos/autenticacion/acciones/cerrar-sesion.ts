'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  filaAUsuario,
  type FilaUsuario,
  type SesionOperador,
  type UsuarioAutenticado,
} from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import { deserializarSesionOperador } from '@/nucleo/autenticacion/sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/**
 * Server Action de cierre de sesión.
 *
 * Cierra la sesión de Supabase Auth, borra la cookie de sesión de operador,
 * registra el evento en auditoría si había un usuario identificado (admin/
 * ventas/gerente vía Supabase, u operador vía cookie firmada) y redirige a
 * la página de inicio de sesión.
 *
 * @returns Nunca retorna: siempre termina en `redirect('/iniciar-sesion')`.
 */
export async function cerrarSesionAccion(): Promise<never> {
  try {
    const usuario = await obtenerUsuarioServidor().catch(() => null);

    const almacenCookies = await cookies();
    const valorCookieOperador = almacenCookies.get(COOKIE_SESION_OPERADOR)?.value;
    let sesionOperador: SesionOperador | null = null;
    if (valorCookieOperador) {
      sesionOperador = await deserializarSesionOperador(valorCookieOperador);
    }

    const supabase = await crearClienteSupabaseServidor();
    await supabase.auth.signOut();
    almacenCookies.delete(COOKIE_SESION_OPERADOR);

    if (usuario) {
      await registrarLog(usuario, 'cerrar_sesion', 'autenticacion', usuario.id);
    } else if (sesionOperador) {
      const admin = crearClienteSupabaseAdmin();
      const { data: fila } = await admin
        .from('usuarios')
        .select('*')
        .eq('id', sesionOperador.usuarioId)
        .single();

      if (fila) {
        const operador: UsuarioAutenticado = {
          ...filaAUsuario(fila as FilaUsuario),
          permisos: [],
        };
        await registrarLog(operador, 'cerrar_sesion', 'autenticacion', operador.id);
      }
    }
  } catch (error) {
    // Nunca bloquear el cierre de sesión por errores secundarios.
    console.error('[AUTENTICACION] Error al cerrar sesión:', error);
  }

  redirect('/iniciar-sesion');
}
