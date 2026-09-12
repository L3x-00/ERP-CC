'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

const CLASE_BASE =
  'w-full rounded-md border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm text-texto-primario outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-texto-tenue focus:border-acento focus:bg-superficie focus:ring-[3px] focus:ring-acento/15 disabled:cursor-not-allowed disabled:opacity-50';

/** Input de texto/número (shadcn/ui style). */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CLASE_BASE, className)} {...props} />;
}

/** Select nativo estilado a juego con Input (chevron visible). */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CLASE_BASE, 'select-flecha', className)} {...props} />;
}

/** Textarea estilado a juego con Input; solo redimensiona en vertical. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(CLASE_BASE, 'min-h-20 resize-y', className)}
      {...props}
    />
  );
}
