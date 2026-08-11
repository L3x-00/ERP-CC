'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

const CLASE_BASE =
  'w-full rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:border-primario focus:ring-2 focus:ring-primario/30 disabled:opacity-50';

/** Input de texto/número (shadcn/ui style). */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CLASE_BASE, className)} {...props} />;
}

/** Select nativo estilado a juego con Input. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CLASE_BASE, className)} {...props} />;
}

/** Textarea estilado a juego con Input. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CLASE_BASE, 'min-h-20', className)} {...props} />;
}
