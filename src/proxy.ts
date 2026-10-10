import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  sesionOperadorEsDelegada,
  sesionOperadorExpirada,
  sesionOperadorVencidaAbsoluta,
} from '@/nucleo/autenticacion/sesion';

/** Rutas públicas: sin autenticación requerida. */
const RUTAS_PUBLICAS = ['/iniciar-sesion', '/operador'];

/**
 * Middleware de autenticación:
 * - Refresca sesión Supabase (cookies) en cada request — necesario para que el
 *   token no expire silenciosamente (patrón canónico de @supabase/ssr).
 * - /produccion-piso* requiere sesión de operador (cookie firmada, timeout);
 *   un usuario del sistema autenticado entra en solo lectura (la página decide
 *   por rol, sin PIN).
 * - Usuario autenticado en /iniciar-sesion → redirige a /dashboard.
 * - Sin sesión en ruta protegida → redirige a /iniciar-sesion.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // `response` se reasigna UNA vez para todo el lote, no dentro del
          // forEach — recrearlo por cada cookie descartaba las ya puestas.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida el JWT contra Supabase y refresca tokens si es necesario.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaPublica = RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(ruta + '/'),
  );

  const esRutaPiso = pathname.startsWith('/produccion-piso');
  const esEntradaProduccion = pathname === '/produccion';

  // La vista delegada permanece en piso hasta que se cierre explícitamente.
  // Al vencer, se elimina su cookie para no bloquear después la operación admin.
  if (esRutaPiso || esEntradaProduccion) {
    const valorCookie = request.cookies.get(COOKIE_SESION_OPERADOR)?.value;
    const sesionOperador = valorCookie
      ? await deserializarSesionOperador(valorCookie)
      : null;
    const sesionInvalida = !sesionOperador || sesionOperadorExpirada(sesionOperador)
      || sesionOperadorVencidaAbsoluta(sesionOperador);

    if (esRutaPiso && sesionInvalida) {
      // Un administrador con sesión del sistema entra al piso en solo lectura
      // sin PIN; la terminal de operador (sin sesión) sigue exigiendo PIN.
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = '/operador';
        const redireccion = NextResponse.redirect(url);
        if (valorCookie) redireccion.cookies.delete(COOKIE_SESION_OPERADOR);
        return redireccion;
      }
      if (valorCookie) response.cookies.delete(COOKIE_SESION_OPERADOR);
      return response;
    }

    if (esEntradaProduccion && sesionOperador && sesionOperadorEsDelegada(sesionOperador)) {
      if (sesionInvalida) {
        response.cookies.delete(COOKIE_SESION_OPERADOR);
      } else {
        const url = request.nextUrl.clone();
        url.pathname = '/produccion-piso';
        return NextResponse.redirect(url);
      }
    }

    if (esRutaPiso) return response;
  }

  // Autenticado en login → directo al dashboard segmentado.
  if (user && pathname.startsWith('/iniciar-sesion')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Sin sesión en ruta protegida → login (la raíz "/" redirige en su page).
  if (!user && !esRutaPublica && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/iniciar-sesion';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas las rutas EXCEPTO:
     * - api (API routes)
     * - _next/static, _next/image (assets)
     * - favicon.ico y archivos estáticos
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
