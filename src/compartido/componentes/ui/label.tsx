'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/** Etiqueta de formulario (shadcn/ui style). */
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}
