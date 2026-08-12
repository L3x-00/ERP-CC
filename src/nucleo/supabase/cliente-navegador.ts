import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

export type ClienteSupabaseNavegador = SupabaseClient<Database>;

/**
 * Una sola instancia por pestaña: cada `createBrowserClient` abre su propio
 * socket de Realtime, así que crear uno por render multiplicaría conexiones y
 * eventos duplicados.
 */
let clienteNavegador: ClienteSupabaseNavegador | null = null;

/**
 * Cliente Supabase de navegador para Client Components.
 * Usa solo la clave pública anónima: la sesión viaja en cookies vía
 * `@supabase/ssr` y toda lectura queda sujeta a RLS.
 */
export function obtenerClienteSupabaseNavegador(): ClienteSupabaseNavegador {
  if (clienteNavegador !== null) {
    return clienteNavegador;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const claveAnonima = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !claveAnonima) {
    throw new Error('Configuración pública de Supabase incompleta.');
  }

  clienteNavegador = createBrowserClient<Database>(url, claveAnonima);
  return clienteNavegador;
}
