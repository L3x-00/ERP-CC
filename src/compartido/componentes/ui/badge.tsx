'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

type VarianteBadge = 'neutro' | 'alerta' | 'exito' | 'info';

const VARIANTES: Record<VarianteBadge, string> = {
  neutro: 'bg-foreground/10 text-foreground/80',
  alerta: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  exito: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

type Props = ComponentProps<'span'> & { variante?: VarianteBadge };

/** Badge/etiqueta visual (shadcn/ui style). */
export function Badge({ className, variante = 'neutro', ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-base px-2 py-0.5 text-xs font-semibold',
        VARIANTES[variante],
        className,
      )}
      {...props}
    />
  );
}
