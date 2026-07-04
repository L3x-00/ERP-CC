import { createBrowserClient } from '@supabase/ssr';

/**
 * Crea cliente Supabase para navegador (SSR).
 * Usado en Client Components y hooks.
 */
export function crearClienteSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
