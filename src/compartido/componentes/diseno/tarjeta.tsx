import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/**
 * Tarjeta/panel del sistema: superficie elevada sobre el lienzo gris. La
 * separación se logra con sombra y espacio, no con líneas divisorias.
 * Composición: Tarjeta > (TarjetaEncabezado | TarjetaContenido | TarjetaPie).
 */
export function Tarjeta({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl bg-superficie shadow-suave', className)}
      {...props}
    />
  );
}

export function TarjetaEncabezado({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 px-6 pb-2 pt-5', className)}
      {...props}
    />
  );
}

export function TarjetaTitulo({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-base font-semibold text-texto-primario', className)}
      {...props}
    />
  );
}

export function TarjetaDescripcion({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-texto-secundario', className)} {...props} />;
}

export function TarjetaContenido({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}

export function TarjetaPie({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 px-6 pb-5 pt-2',
        className,
      )}
      {...props}
    />
  );
}
