import type { ComponentProps } from 'react';
import { cn } from '@/compartido/utilidades/cn';

/**
 * Primitivos de tabla del sistema: contenedor elevado con scroll horizontal,
 * encabezado fijo, filas de 48px, alternancia sutil y hover accionable. Sin
 * líneas divisorias: la separación la dan el ritmo vertical y el hover.
 */
export function TablaContenedor({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'scroll-sutil overflow-x-auto rounded-xl bg-superficie shadow-suave',
        className,
      )}
      {...props}
    />
  );
}

export function Tabla({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />;
}

export function TablaEncabezado({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn(
        'sticky top-0 z-10 bg-superficie-2/70 text-[11px] uppercase tracking-[0.12em] text-texto-tenue backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}

export function TablaCuerpo({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      className={cn('[&>tr:nth-child(even)]:bg-superficie-2/25', className)}
      {...props}
    />
  );
}

type PropsFila = ComponentProps<'tr'> & {
  seleccionada?: boolean;
  clickable?: boolean;
};

export function TablaFila({ className, seleccionada = false, clickable = false, ...props }: PropsFila) {
  return (
    <tr
      aria-selected={seleccionada || undefined}
      className={cn(
        'transition-colors duration-150',
        clickable && 'cursor-pointer',
        seleccionada ? 'bg-acento-suave' : 'hover:bg-acento-suave/60',
        className,
      )}
      {...props}
    />
  );
}

export function TablaEncabezadoCelda({ className, ...props }: ComponentProps<'th'>) {
  return <th scope="col" className={cn('whitespace-nowrap px-4 py-3 font-semibold', className)} {...props} />;
}

export function TablaCelda({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3.5 align-middle', className)} {...props} />;
}
