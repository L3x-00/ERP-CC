'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import { DESCRIPCION_EMPRESA, LOGO_EMPRESA_RUTA, NOMBRE_EMPRESA } from '@/compartido/constantes/marca';
import { cn } from '@/compartido/utilidades/cn';

const CLAVE_SESION = 'orca-bienvenida-visual-v1';

/** Duración visual obligatoria, independiente de lo que tarde el servidor. */
const DURACION_BIENVENIDA_MS = 2000;

const MENSAJES = [
  'Preparando tu espacio de trabajo',
  'Sincronizando el taller',
  'Cargando órdenes y propuestas',
  'Bienvenido a CC Manufacturing Group',
] as const;

/**
 * Pantalla de bienvenida decorativa al entrar al sistema.
 *
 * - Se muestra una sola vez por sesión de navegador (`sessionStorage`).
 * - Permanece 2 segundos completos aunque la navegación termine antes.
 * - Nunca bloquea la interacción (`pointer-events-none`) ni hace peticiones.
 * - Respeta `prefers-reduced-motion` y se desmonta sola.
 */
export function PantallaBienvenida() {
  const pathname = usePathname();
  // El manual se sirve bajo /{idioma}/docs (p. ej. /es/docs), no bajo /docs.
  const enDocs = /^\/(?:[a-z]{2}\/)?docs(?:\/|$)/u.test(pathname);
  // Arranca oculto: sessionStorage solo se puede leer en el cliente. Así una
  // recarga dentro de la misma sesión no pinta el splash antes de ocultarlo.
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (enDocs) return;

    let yaVisto = false;
    try {
      yaVisto = window.sessionStorage.getItem(CLAVE_SESION) === '1';
      if (!yaVisto) window.sessionStorage.setItem(CLAVE_SESION, '1');
    } catch {
      // Navegación privada estricta: se muestra igual y no se persiste.
    }

    if (yaVisto) return;

    // Diferir un tick evita el setState sincrónico en el effect y mantiene el
    // primer paint oculto: una sesión ya vista nunca ve el splash parpadear.
    const mostrar = window.setTimeout(() => setVisible(true), 0);
    const intervaloMensajes = window.setInterval(
      () => setIndice((actual) => (actual + 1) % MENSAJES.length),
      500,
    );
    const temporizadorSalida = window.setTimeout(
      () => setSaliendo(true),
      Math.max(DURACION_BIENVENIDA_MS - 500, 0),
    );
    const temporizadorFin = window.setTimeout(
      () => setVisible(false),
      DURACION_BIENVENIDA_MS,
    );

    return () => {
      window.clearTimeout(mostrar);
      window.clearInterval(intervaloMensajes);
      window.clearTimeout(temporizadorSalida);
      window.clearTimeout(temporizadorFin);
    };
  }, [enDocs]);

  if (!visible || enDocs) return null;

  return (
    <div
      data-testid="pantalla-bienvenida"
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed inset-0 z-[120] grid place-items-center overflow-hidden transition-all duration-500 ease-suave',
        saliendo ? 'scale-[1.015] opacity-0' : 'scale-100 opacity-100',
      )}
      style={{
        backgroundImage:
          'radial-gradient(60% 52% at 50% 38%, rgba(16,151,72,0.24), transparent 70%), linear-gradient(180deg, #070d18 0%, #0b1424 58%, #070d18 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(circle at 50% 45%, black, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black, transparent 72%)',
        }}
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-[28px] bg-[#109748]/25 blur-2xl motion-safe:animate-pulse" />
          <span className="relative flex h-24 w-24 items-center justify-center rounded-[26px] bg-white/95 p-3 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/30">
            <Image
              src={LOGO_EMPRESA_RUTA}
              alt=""
              width={80}
              height={80}
              priority
              className="h-full w-full object-contain"
            />
          </span>
        </div>

        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
          Orca MFG ERP
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {NOMBRE_EMPRESA}
        </h1>
        <p className="mt-1.5 max-w-sm text-sm text-white/55">{DESCRIPCION_EMPRESA}</p>

        <p
          key={indice}
          className="animar-aparecer mt-8 min-h-6 text-sm font-medium text-[#7ee2a8]"
        >
          {MENSAJES[indice]}
        </p>

        <span className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-white/10">
          <span className="animar-progreso block h-full rounded-full bg-[#109748]" />
        </span>
      </div>
    </div>
  );
}
