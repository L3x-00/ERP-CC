'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

type VarianteBadge = 'neutro' | 'alerta' | 'exito' | 'info' | 'peligro';

const VARIANTES: Record<VarianteBadge, string> = {
  neutro: 'bg-superficie-2 text-texto-secundario',
  alerta: 'bg-advertencia-suave text-advertencia-texto',
  exito: 'bg-exito-suave text-exito-texto',
  info: 'bg-info-suave text-info-texto',
  peligro: 'bg-peligro-suave text-peligro-texto',
};

type Props = ComponentProps<'span'> & { variante?: VarianteBadge };

/** Badge/etiqueta visual (shadcn/ui style) con tokens del sistema. */
export function Badge({ className, variante = 'neutro', ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANTES[variante],
        className,
      )}
      {...props}
    />
  );
}
