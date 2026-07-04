import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Crea cliente Supabase para Server Actions y Server Components.
 * Acceso respetando RLS con la sesión del usuario actual.
 */
export async function crearClienteSupabaseServidor() {
  const almacenCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacenCookies.getAll();
        },
        setAll(cookiesAEstablecer) {
          try {
            cookiesAEstablecer.forEach(({ name, value, options }) =>
              almacenCookies.set(name, value, options),
            );
          } catch {
            // Ignorar en Server Components (cookies de solo lectura);
            // el middleware se encarga de refrescar la sesión.
          }
        },
      },
    },
  );
}
