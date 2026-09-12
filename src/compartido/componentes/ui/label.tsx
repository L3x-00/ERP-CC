'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/** Etiqueta de formulario (shadcn/ui style). */
export function Label({
  className,
  obligatorio = false,
  children,
  ...props
}: ComponentProps<'label'> & { obligatorio?: boolean }) {
  return (
    <label
      className={cn(
        'flex items-center gap-1 text-sm font-medium text-texto-primario',
        className,
      )}
      {...props}
    >
      {children}
      {obligatorio ? (
        <span aria-hidden="true" className="text-peligro">
          *
        </span>
      ) : null}
    </label>
  );
}
