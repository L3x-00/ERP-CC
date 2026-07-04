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
 * - Refresca sesión Supabase (cookies) en cada request.
 * - /produccion-piso* requiere sesión de operador (cookie firmada, timeout inactividad).
 * - Resto de rutas protegidas requieren usuario Supabase → redirige a /iniciar-sesion.
 * - Usuario autenticado en /iniciar-sesion → redirige a /tablero.
 */
export async function middleware(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAEstablecer) {
          cookiesAEstablecer.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesAEstablecer.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
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

  // Zona de piso: sesión de operador propia (no Supabase Auth)
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

    return respuesta;
  }

  const esRutaPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta));

  // Autenticado en login → directo al tablero
  if (user && pathname.startsWith('/iniciar-sesion')) {
    const url = request.nextUrl.clone();
    url.pathname = '/tablero';
    return NextResponse.redirect(url);
  }

  // Sin sesión en ruta protegida → login (la raíz "/" redirige en su propio page)
  if (!user && !esRutaPublica && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/iniciar-sesion';
    return NextResponse.redirect(url);
  }

  return respuesta;
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
