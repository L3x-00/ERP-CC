import { cookies } from 'next/headers';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  sesionOperadorExpirada,
} from '@/nucleo/autenticacion/sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Recupera la identidad de piso solamente si la cookie HMAC sigue vigente y el
 * usuario continúa activo con rol operador. La cookie no basta por sí misma:
 * esta segunda verificación permite revocar acceso al desactivar la cuenta.
 */
export async function obtenerOperadorConSesionActiva(): Promise<UsuarioAutenticado | null> {
  const almacenCookies = await cookies();
  const valorCookie = almacenCookies.get(COOKIE_SESION_OPERADOR)?.value;

  if (!valorCookie) {
    return null;
  }

  const sesion = await deserializarSesionOperador(valorCookie);
  if (!sesion || sesionOperadorExpirada(sesion)) {
    return null;
  }

  const { data: operador, error } = await crearClienteSupabaseAdmin()
    .from('usuarios')
    .select('id, email, nombre_completo, activo, ultimo_login_at, creado_en, actualizado_en')
    .eq('id', sesion.usuarioId)
    .eq('rol', 'operador')
    .eq('activo', true)
    .maybeSingle();

  if (error || !operador) {
    return null;
  }

  return {
    id: operador.id,
    email: operador.email,
    nombreCompleto: operador.nombre_completo,
    rol: 'operador',
    activo: operador.activo,
    ultimoLoginEn: operador.ultimo_login_at,
    creadoEn: operador.creado_en,
    actualizadoEn: operador.actualizado_en,
    permisos: [],
  };
}
