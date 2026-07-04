import type { Session } from '@supabase/supabase-js';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';

/**
 * Obtiene la sesión Supabase actual desde el navegador.
 *
 * Versión para Client Components y hooks: usa el cliente Supabase de
 * navegador y `auth.getSession()`. Útil para leer el JWT y su expiración;
 * para datos del usuario con permisos usar `obtenerUsuario()`.
 *
 * @returns La sesión activa, o `null` si no hay sesión o hubo error.
 */
export async function obtenerSesion(): Promise<Session | null> {
  const cliente = crearClienteSupabase();

  const { data, error } = await cliente.auth.getSession();
  if (error) {
    return null;
  }

  return data.session;
}
