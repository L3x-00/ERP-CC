import Link from 'next/link';

import { LogotipoEmpresa } from '@/compartido/componentes/diseno/logotipo-empresa';
import { DESCRIPCION_EMPRESA, NOMBRE_EMPRESA } from '@/compartido/constantes/marca';
import { FormularioIniciarSesion } from '@/modulos/autenticacion/componentes/formulario-iniciar-sesion';

/**
 * Acceso administrativo con correo y contraseña.
 * La identidad visual (logo, nombre y mensajes) vive aquí; la autenticación
 * se mantiene en `FormularioIniciarSesion` y en la Server Action existente.
 */
export default function PaginaIniciarSesion() {
  return (
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-fondo p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-[#109748]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-[-8rem] h-[26rem] w-[26rem] rounded-full bg-acento/10 blur-3xl"
      />

      <section className="animar-aparecer relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-borde bg-superficie shadow-elevada lg:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1220] p-10 text-white lg:flex">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(70% 60% at 20% 10%, rgba(16,151,72,0.32), transparent 65%), linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: 'auto, 48px 48px, 48px 48px',
            }}
          />

          <div className="relative">
            <LogotipoEmpresa tamano="lg" />
            <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7ee2a8]">
              Orca MFG ERP
            </p>
            <h1 className="mt-3 max-w-sm text-3xl font-bold leading-tight tracking-tight">
              Toda tu operación de manufactura, en un solo lugar.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
              Cotizaciones, órdenes, producción, entregas y finanzas conectadas en tiempo real.
            </p>
          </div>

          <ul className="relative mt-12 space-y-3 text-sm text-white/70">
            {[
              'Trazabilidad completa de cada orden',
              'Indicadores de taller y capacidad',
              'Documentos con la identidad de tu empresa',
            ].map((beneficio) => (
              <li key={beneficio} className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#109748]/20 text-[#7ee2a8]">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10.5 8 14.5 16 6" />
                  </svg>
                </span>
                {beneficio}
              </li>
            ))}
          </ul>

          <p className="relative mt-12 text-xs text-white/35">
            © {new Date().getFullYear()} {NOMBRE_EMPRESA}
          </p>
        </aside>

        <div className="flex flex-col justify-center p-6 sm:p-10">
          <div className="animar-aparecer flex flex-col items-start gap-5" style={{ animationDelay: '80ms' }}>
            <div className="lg:hidden">
              <LogotipoEmpresa conTexto tamano="md" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-acento-texto">
                Acceso al sistema
              </p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-texto-primario">
                Bienvenido de nuevo
              </h2>
              <p className="mt-1 text-sm text-texto-secundario">
                Ingresa con tu correo corporativo para continuar.
              </p>
            </div>

            <FormularioIniciarSesion />

            <div className="flex w-full items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-texto-tenue">
              <span className="h-px flex-1 bg-borde" />
              o
              <span className="h-px flex-1 bg-borde" />
            </div>

            <Link
              href="/operador"
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-borde bg-superficie-2/60 px-4 py-3 text-sm transition-all duration-200 ease-suave hover:border-acento/40 hover:bg-acento-suave/60"
            >
              <span className="flex flex-col">
                <span className="font-semibold text-texto-primario">Acceso de operador de piso</span>
                <span className="text-xs text-texto-secundario">Ingresa con tu PIN de 4 a 6 dígitos</span>
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-acento-suave text-acento-texto transition-transform duration-200 group-hover:translate-x-0.5">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </span>
            </Link>

            <p className="text-xs leading-relaxed text-texto-tenue">{DESCRIPCION_EMPRESA}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
