import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

/**
 * Verifica si un usuario tiene un permiso granular.
 *
 * Reglas:
 * 1. Rol `admin` → siempre `true` (acceso total).
 * 2. Si el usuario ya trae permisos resueltos (`usuario.permisos` con
 *    elementos) → se responde en memoria sin tocar la base de datos.
 * 3. Fallback (lista de permisos vacía): consulta la tabla `permisos_rol`
 *    usando import dinámico del cliente servidor, para que las pruebas en
 *    Node no carguen `next/headers`. Ante cualquier error → `false`.
 *
 * @param usuario Usuario autenticado (con permisos resueltos o no).
 * @param permiso Permiso a verificar (ej. 'ver_clientes').
 * @returns `true` si el usuario cuenta con el permiso.
 */
export async function can(usuario: UsuarioAutenticado, permiso: string): Promise<boolean> {
  // Defensa en profundidad: coherente con public.es_admin() en RLS, que
  // exige rol='admin' AND activo=true. Un usuario desactivado nunca pasa,
  // sin importar de dónde venga el objeto UsuarioAutenticado.
  if (!usuario.activo) {
    return false;
  }

  if (usuario.rol === 'admin') {
    return true;
  }

  if (usuario.permisos.length > 0) {
    return usuario.permisos.includes(permiso);
  }

  try {
    const { crearClienteSupabaseServidor } = await import('../supabase/servidor');
    const cliente = await crearClienteSupabaseServidor();

    const { data, error } = await cliente
      .from('permisos_rol')
      .select('permiso')
      .eq('rol', usuario.rol)
      .eq('permiso', permiso)
      .limit(1);

    if (error || !data) {
      return false;
    }

    return data.length > 0;
  } catch {
    return false;
  }
}
