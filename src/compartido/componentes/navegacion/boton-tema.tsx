'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

import { cn } from '@/compartido/utilidades/cn';
import { Icono } from './iconos';

const suscribirSinCambios = (): (() => void) => () => {};
const leerMontado = (): boolean => true;
const leerMontadoServidor = (): boolean => false;

/**
 * Botón suelto de claro/oscuro para pantallas sin menú de usuario (acceso y
 * operador). Usa el mismo patrón que `OpcionTemaMenu`: la etiqueta es neutral
 * hasta la hidratación para no romper el HTML del servidor.
 */
export function BotonTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useSyncExternalStore(
    suscribirSinCambios,
    leerMontado,
    leerMontadoServidor,
  );

  const esOscuro = montado && resolvedTheme === 'dark';
  const etiqueta = !montado
    ? 'Cambiar tema'
    : esOscuro
      ? 'Cambiar a tema claro'
      : 'Cambiar a tema oscuro';

  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      data-testid="alternar-tema-acceso"
      onClick={() => setTheme(esOscuro ? 'light' : 'dark')}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl border border-borde bg-superficie/90 text-texto-secundario shadow-sm backdrop-blur-sm transition-colors hover:border-acento/40 hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
        className,
      )}
    >
      <Icono nombre={esOscuro ? 'sol' : 'luna'} className="h-4 w-4" />
    </button>
  );
}
