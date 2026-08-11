'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

type VarianteBoton = 'primario' | 'secundario' | 'destructivo' | 'contorno' | 'fantasma';
type TamanoBoton = 'md' | 'sm';

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-primario text-white hover:opacity-90',
  secundario: 'bg-secundario text-white hover:opacity-90',
  destructivo: 'bg-red-600 text-white hover:bg-red-700',
  contorno: 'border border-foreground/20 hover:bg-foreground/5',
  fantasma: 'hover:bg-foreground/5',
};

const TAMANOS: Record<TamanoBoton, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-2.5 py-1 text-xs',
};

type Props = ComponentProps<'button'> & {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
};

/** Botón base (shadcn/ui style) con variantes y tokens del tema. */
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
        'inline-flex items-center justify-center gap-1 rounded-base font-semibold transition-opacity',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario/40',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    />
  );
}
