import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

/**
 * Verifica si un usuario tiene un permiso granular.
 *
 * Reglas:
 * 1. Rol `admin` → siempre `true` (acceso total).
 * 2. Si el usuario ya trae permisos resueltos (`usuario.permisos` con
 *    elementos) → se responde en memoria sin tocar la base de datos.
 * 3. Fallback (lista de permisos vacía): consulta `permisos_rol` con el
 *    cliente admin. El operador de piso no tiene sesión de Supabase y RLS
 *    negaría la lectura con el cliente de cookies. Ante cualquier error → `false`.
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
    // El actor de operador de piso se autentica con cookie HMAC y no tiene
    // sesión de Supabase: con el cliente de cookies, RLS devuelve 0 filas y
    // todo permiso se negaría. La consulta es de catálogo y va con service
    // role; la autorización real sigue dependiendo del rol del actor.
    const { crearClienteSupabaseAdmin } = await import('../supabase/admin');
    const cliente = crearClienteSupabaseAdmin();

    // Un permiso desactivado en el catálogo no concede acceso aunque siga
    // asignado al rol (mismo criterio que los helpers SQL de RLS).
    const [asignacion, catalogo] = await Promise.all([
      cliente.from('permisos_rol').select('permiso').eq('rol', usuario.rol).eq('permiso', permiso).limit(1),
      cliente.from('permisos').select('codigo').eq('codigo', permiso).eq('activo', true).limit(1),
    ]);

    if (asignacion.error || catalogo.error || !asignacion.data || !catalogo.data) {
      return false;
    }

    return asignacion.data.length > 0 && catalogo.data.length > 0;
  } catch {
    return false;
  }
}
