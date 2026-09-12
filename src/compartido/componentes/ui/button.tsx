'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

type VarianteBoton = 'primario' | 'secundario' | 'destructivo' | 'contorno' | 'fantasma';
type TamanoBoton = 'sm' | 'md' | 'lg' | 'piso';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-acento text-white hover:bg-acento-hover',
  secundario: 'bg-secundario text-white hover:opacity-90',
  destructivo:
    'border border-peligro/40 bg-peligro-suave text-peligro-texto hover:bg-peligro/10',
  contorno: 'border border-borde-fuerte bg-superficie text-texto-primario hover:bg-superficie-2',
  fantasma: 'text-texto-secundario hover:bg-superficie-2 hover:text-texto-primario',
};

/** Alturas fijas: 36 / 40 / 44 / 48px (piso táctil). */
const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
  piso: 'h-12 min-w-12 px-6 text-base',
};

type Props = ComponentProps<'button'> & {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
};

/**
 * Botón base (shadcn/ui style) con tokens del sistema. `piso` garantiza el
 * objetivo táctil ≥44px para tablets industriales.
 */
export function Button({
  className,
  variante = 'primario',
  tamano = 'md',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    />
  );
}
