'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import {
  CLAVE_ACTIVIDAD_BIENVENIDA,
  CLAVE_SESION_BIENVENIDA,
  DURACION_BIENVENIDA_MS,
  EVENTO_ACCESO_PERMITIDO,
  EVENTO_FIN_SESION,
  EVENTO_FIN_VALIDACION,
  EVENTO_INICIO_SESION,
  INACTIVIDAD_BIENVENIDA_MS,
} from '@/compartido/constantes/bienvenida';
import { DESCRIPCION_EMPRESA, LOGO_EMPRESA_RUTA, NOMBRE_EMPRESA } from '@/compartido/constantes/marca';
import { cn } from '@/compartido/utilidades/cn';

const MENSAJES = [
  'Preparando tu espacio de trabajo',
  'Sincronizando el taller',
  'Cargando órdenes y propuestas',
  'Bienvenido a CC Manufacturing Group',
] as const;

function esDocs(ruta: string): boolean {
  return /^\/(?:[a-z]{2}\/)?docs(?:\/|$)/u.test(ruta);
}

function esAcceso(ruta: string): boolean {
  return ruta === '/' || ruta === '/iniciar-sesion' || ruta === '/operador';
}

/**
 * Splash de inicio de sesión.
 *
 * No se muestra al abrir la página de login: aparece en cuanto empieza la
 * validación (admin u operador) y se mantiene hasta que termina, con un mínimo
 * de 2 segundos. También aparece al recargar una pantalla autenticada tras un
 * periodo de inactividad.
 */
export function PantallaBienvenida() {
  const pathname = usePathname();
  // Se consulta la ruta en el evento/montaje, pero no se pone en las
  // dependencias del effect: cambiar de ruta con el splash visible no debe
  // cancelar su temporizador.
  const rutaRef = useRef(pathname);
  // El manual se sirve bajo /{idioma}/docs (p. ej. /es/docs), no bajo /docs.
  const enDocs = esDocs(pathname);

  // Arranca oculto para que el primer paint nunca muestre el splash.
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [indice, setIndice] = useState(0);
  const [accesoPermitido, setAccesoPermitido] = useState(false);
  const temporizadores = useRef<number[]>([]);
  const esperandoFinRef = useRef(false);

  const limpiarTemporizadores = useCallback(() => {
    for (const id of temporizadores.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    temporizadores.current = [];
  }, []);

  const ocultar = useCallback(() => {
    limpiarTemporizadores();
    esperandoFinRef.current = false;
    setSaliendo(true);
    temporizadores.current = [
      window.setTimeout(() => {
        setVisible(false);
        setSaliendo(false);
      }, 500),
    ];
  }, [limpiarTemporizadores]);

  const mostrar = useCallback((esperarFin = false) => {
    if (esDocs(rutaRef.current)) return;
    limpiarTemporizadores();
    esperandoFinRef.current = esperarFin;
    setIndice(0);
    setSaliendo(false);
    setAccesoPermitido(false);
    setVisible(true);
    const nuevos: number[] = [
      window.setInterval(
        () => setIndice((actual) => (actual + 1) % MENSAJES.length),
        500,
      ),
    ];
    if (esperarFin) {
      // La validación avisa cuándo terminó. Red de seguridad por si no avisa.
      nuevos.push(window.setTimeout(ocultar, 60_000));
    } else {
      nuevos.push(
        window.setTimeout(
          () => setSaliendo(true),
          Math.max(DURACION_BIENVENIDA_MS - 500, 0),
        ),
        window.setTimeout(() => setVisible(false), DURACION_BIENVENIDA_MS),
      );
    }
    temporizadores.current = nuevos;
  }, [limpiarTemporizadores, ocultar]);

  useEffect(() => {
    rutaRef.current = pathname;
  }, [pathname]);

  // Un login administrativo no avisa el fin: se mantiene tapado hasta que la
  // navegación a /dashboard ya ocurrió. Así no reaparece el formulario.
  useEffect(() => {
    if (!esperandoFinRef.current) return;
    if (esAcceso(pathname) || esDocs(pathname)) return;
    const temporizador = window.setTimeout(ocultar, 0);
    return () => window.clearTimeout(temporizador);
  }, [ocultar, pathname]);

  useEffect(() => {
    if (esDocs(rutaRef.current)) return;

    let ultimoRegistro = 0;
    const registrarActividad = (): void => {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < 5000) return;
      ultimoRegistro = ahora;
      try {
        window.sessionStorage.setItem(CLAVE_ACTIVIDAD_BIENVENIDA, String(ahora));
      } catch {
        // Navegación privada estricta: el splash sigue funcionando en memoria.
      }
    };

    const alIniciarSesion = (): void => {
      try {
        window.sessionStorage.setItem(CLAVE_SESION_BIENVENIDA, '1');
        window.sessionStorage.setItem(CLAVE_ACTIVIDAD_BIENVENIDA, String(Date.now()));
      } catch {
        // Sin sessionStorage no hay rastro entre recargas, pero se muestra igual.
      }
      // Se abre al empezar a validar y se cierra con EVENTO_FIN_VALIDACION.
      mostrar(true);
    };

    const alFinValidacion = (): void => {
      if (!esperandoFinRef.current) return;
      registrarActividad();
      ocultar();
    };

    const alAccesoPermitido = (): void => {
      if (!esperandoFinRef.current) return;
      // El check se muestra aquí dentro del splash: nunca se descubre el
      // formulario con el mensaje de éxito antes de navegar.
      setAccesoPermitido(true);
    };

    const alFinalizarSesion = (): void => {
      try {
        window.sessionStorage.removeItem(CLAVE_SESION_BIENVENIDA);
      } catch {
        // Nada que limpiar.
      }
    };

    window.addEventListener(EVENTO_INICIO_SESION, alIniciarSesion);
    window.addEventListener(EVENTO_FIN_VALIDACION, alFinValidacion);
    window.addEventListener(EVENTO_ACCESO_PERMITIDO, alAccesoPermitido);
    window.addEventListener(EVENTO_FIN_SESION, alFinalizarSesion);
    window.addEventListener('pointerdown', registrarActividad, { passive: true });
    window.addEventListener('keydown', registrarActividad);

    // Recarga de una sesión activa tras un rato sin usar el sistema.
    try {
      if (!esAcceso(rutaRef.current) && window.sessionStorage.getItem(CLAVE_SESION_BIENVENIDA) === '1') {
        const ultima = Number(
          window.sessionStorage.getItem(CLAVE_ACTIVIDAD_BIENVENIDA) ?? Date.now(),
        );
        if (Date.now() - ultima >= INACTIVIDAD_BIENVENIDA_MS) {
          window.sessionStorage.setItem(CLAVE_ACTIVIDAD_BIENVENIDA, String(Date.now()));
          temporizadores.current.push(window.setTimeout(mostrar, 0));
        } else {
          registrarActividad();
        }
      }
    } catch {
      // sessionStorage no disponible: no hay recarga tras inactividad.
    }

    return () => {
      window.removeEventListener(EVENTO_INICIO_SESION, alIniciarSesion);
      window.removeEventListener(EVENTO_FIN_VALIDACION, alFinValidacion);
      window.removeEventListener(EVENTO_ACCESO_PERMITIDO, alAccesoPermitido);
      window.removeEventListener(EVENTO_FIN_SESION, alFinalizarSesion);
      window.removeEventListener('pointerdown', registrarActividad);
      window.removeEventListener('keydown', registrarActividad);
      limpiarTemporizadores();
    };
  }, [limpiarTemporizadores, mostrar, ocultar]);

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

        {accesoPermitido ? (
          <div
            className="animar-resultado-pin mt-8 flex flex-col items-center gap-2"
            data-testid="splash-acceso-permitido"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-exito bg-exito/20 text-exito-texto">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
              </svg>
            </span>
            <p className="text-base font-bold text-exito-texto">Acceso permitido</p>
          </div>
        ) : (
          <>
            <p
              key={indice}
              className="animar-aparecer mt-8 min-h-6 text-sm font-medium text-[#7ee2a8]"
            >
              {MENSAJES[indice]}
            </p>

            <span className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-white/10">
              <span className="animar-progreso block h-full rounded-full bg-[#109748]" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}
