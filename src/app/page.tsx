import { redirect } from 'next/navigation';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/**
 * Página raíz: redirige según estado de autenticación.
 * Con sesión → /tablero; sin sesión → /iniciar-sesion.
 * Server Component: sin parpadeo de carga en cliente.
 */
export default async function PaginaInicio() {
  const supabase = await crearClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/tablero');
  }

  redirect('/iniciar-sesion');
}
