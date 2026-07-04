import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  sesionOperadorExpirada,
} from '@/nucleo/autenticacion/sesion';

/** Rutas públicas: sin autenticación requerida. */
const RUTAS_PUBLICAS = ['/iniciar-sesion', '/operador'];

/**
 * Middleware de autenticación:
 * - Refresca sesión Supabase (cookies) en cada request — necesario para que el
 *   token no expire silenciosamente (patrón canónico de @supabase/ssr).
 * - /produccion-piso* requiere sesión de operador (cookie firmada, timeout).
 * - Usuario autenticado en /iniciar-sesion → redirige a /tablero.
 * - Sin sesión en ruta protegida → redirige a /iniciar-sesion.
 */
export async function middleware(request: NextRequest) {
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

  // Zona de piso: sesión de operador propia (no Supabase Auth).
  if (pathname.startsWith('/produccion-piso')) {
    const valorCookie = request.cookies.get(COOKIE_SESION_OPERADOR)?.value;
    const sesionOperador = valorCookie
      ? await deserializarSesionOperador(valorCookie)
      : null;

    if (!sesionOperador || sesionOperadorExpirada(sesionOperador)) {
      const url = request.nextUrl.clone();
      url.pathname = '/operador';
      return NextResponse.redirect(url);
    }

    return response;
  }

  // Autenticado en login → directo al tablero.
  if (user && pathname.startsWith('/iniciar-sesion')) {
    const url = request.nextUrl.clone();
    url.pathname = '/tablero';
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
