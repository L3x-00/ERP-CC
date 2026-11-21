import Link from 'next/link';

import { LogotipoEmpresa } from '@/compartido/componentes/diseno/logotipo-empresa';
import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/**
 * Página de acceso de operadores de piso mediante PIN numérico.
 * Fondo oscuro fijo (independiente del tema del sistema), pensado para uso
 * en planta de producción. La validación del PIN ocurre en `TecladoPin` vía
 * la Server Action `validarPinAccion`. Si hay una sesión de administrador,
 * se ofrece el atajo al piso en solo lectura: ese rol no usa PIN.
 */
export default async function PaginaOperador() {
  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin' && usuario.activo;

  return (
    <main className="dark relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#0b1220] p-3 text-texto-primario sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(60% 50% at 78% 18%, rgba(16,151,72,0.22), transparent 65%), radial-gradient(50% 50% at 8% 90%, rgba(59,130,246,0.16), transparent 60%), linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 44px 44px, 44px 44px',
        }}
      />

      <div className="animar-aparecer relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-[0_30px_90px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm md:grid-cols-[1fr_auto]">
        <aside className="relative flex flex-col justify-between gap-8 border-b border-white/10 p-6 md:border-b-0 md:border-r md:p-9">
          <div>
            <LogotipoEmpresa tamano="lg" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#7ee2a8]">
              Terminal de piso
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Acceso de operador</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-texto-secundario">
              Identifícate con tu PIN de 6 dígitos para entrar a tu espacio de trabajo y registrar la
              producción del día.
            </p>
          </div>

          {esAdmin ? (
            <div
              data-testid="acceso-admin-piso"
              className="rounded-2xl border border-acento/30 bg-acento-suave/40 p-4 text-left"
            >
              <p className="text-sm font-semibold text-texto-primario">
                Sesión de administrador detectada
              </p>
              <p className="mt-1 text-xs leading-relaxed text-texto-secundario">
                Tu rol no requiere PIN: puedes ver el piso completo en solo lectura.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/produccion-piso"
                  className="rounded-lg bg-acento px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-acento-hover"
                >
                  Ver piso (solo lectura)
                </Link>
                <Link
                  href="/produccion"
                  className="rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm font-medium text-texto-primario transition-colors hover:bg-superficie-2"
                >
                  Panel de producción
                </Link>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-texto-tenue">
            ¿Eres administrador?{' '}
            <Link href="/iniciar-sesion" className="font-medium text-acento-texto hover:underline">
              Ingresa con tu correo
            </Link>
          </p>
        </aside>

        <section className="flex items-center justify-center p-5 sm:p-8">
          <TecladoPin />
        </section>
      </div>
    </main>
  );
}
