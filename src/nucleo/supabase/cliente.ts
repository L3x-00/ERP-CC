import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Crea cliente Supabase para navegador (SSR).
 * Usado en Client Components y hooks.
 */
export function crearClienteSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
